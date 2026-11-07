// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, type TestServer } from '../fixtures/test-server';

let ts: TestServer;

beforeAll(async () => {
  ts = await bootTestServer();
});

describe('TTS end-to-end (US3 / T074)', () => {
  it('JSON request → mock provider audio stream → client collects full body', async () => {
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ts.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mock-tts-1',
          input: 'streaming hello',
          voice: 'alloy'
        })
      })
    );
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let acc = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
    }
    expect(acc).toBe('mock-tts-echo:streaming hello');
  });

  it('respects speed parameter (passes through provider without error)', async () => {
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ts.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mock-tts-1',
          input: 'speed test',
          voice: 'alloy',
          speed: 1.5
        })
      })
    );
    expect(res.status).toBe(200);
  });

  it('mock inject-validation surfaces as 422 validation error', async () => {
    const res = await ts.app.handle(
      new Request('http://localhost/v1/audio/speech', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ts.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mock-tts-1',
          input: 'inject-validation',
          voice: 'alloy'
        })
      })
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('mock_inject');
  });
});
