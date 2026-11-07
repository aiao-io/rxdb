import { encodeP2PFrame, type P2PByteTransport } from '@aiao/rxdb-plugin-p2p';
import { describe, expect, it, vi } from 'vitest';
import { FrameTrace, summarizeFrame } from './frame-trace';

const transportOf = (incoming: Uint8Array[]): P2PByteTransport => ({
  send: vi.fn(async () => undefined),
  receive: vi.fn(async () => incoming.shift() as Uint8Array),
  close: vi.fn()
});

describe('summarizeFrame', () => {
  it.each([
    [
      { kind: 'request', id: 3, protocol: 'p2p.files', method: 'read', params: {}, payload: new Uint8Array(0) },
      'p2p.files.read'
    ],
    [{ kind: 'error', id: 3, code: 'not_holder', message: 'no' }, 'not_holder'],
    [{ kind: 'bye', reason: 'duplicate' }, 'duplicate'],
    [{ kind: 'ping' }, null]
  ] as const)('summarizes %o', (frame, detail) => {
    const summary = summarizeFrame(encodeP2PFrame(frame as never));

    expect(summary.kind).toBe(frame.kind);
    expect(summary.detail).toBe(detail);
  });

  it('counts payload bytes of a response', () => {
    const frame = encodeP2PFrame({ kind: 'response', id: 1, result: null, payload: new Uint8Array(1000) });

    expect(summarizeFrame(frame)).toMatchObject({ kind: 'response', id: 1, bytes: frame.byteLength });
  });

  it('reports a frame it cannot decode instead of throwing', () => {
    expect(summarizeFrame(new Uint8Array([0, 0]))).toMatchObject({ kind: 'malformed' });
  });
});

describe('FrameTrace', () => {
  it('records both directions, keeps the latest frames and counts everything', async () => {
    const changed = vi.fn();
    const trace = new FrameTrace(2, changed);
    const transport = trace.wrap(transportOf([encodeP2PFrame({ kind: 'pong' })]));

    await transport.send(encodeP2PFrame({ kind: 'ping' }));
    await transport.send(encodeP2PFrame({ kind: 'ping' }));
    await transport.receive();

    expect(trace.recent().map(frame => `${frame.direction}:${frame.kind}`)).toEqual(['out:ping', 'in:pong']);
    expect(trace.totals()).toMatchObject({ sent: 2, received: 1 });
    expect(changed).toHaveBeenCalledTimes(3);
  });
});
