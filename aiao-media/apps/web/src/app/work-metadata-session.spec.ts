import { type Observable, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { LocalWorkSummary } from '../local-data/index';
import { WorkMetadataSession, type WorkMetadataState } from './work-metadata-session';

const work: LocalWorkSummary = {
  jobId: 'local',
  prompt: '本机作品',
  modelId: 'fixture',
  bytes: 10,
  status: 'saved'
};

function rig() {
  const streams: Subject<LocalWorkSummary[]>[] = [];
  const port = {
    works$: vi.fn(() => {
      const stream = new Subject<LocalWorkSummary[]>();
      streams.push(stream);
      return stream;
    })
  };
  const accept = vi.fn<(state: WorkMetadataState) => void>();
  const session = new WorkMetadataSession(port, accept);
  const state = () => accept.mock.calls.at(-1)![0];
  session.start();
  return { session, streams, port, accept, state };
}

describe('full library ownership metadata', () => {
  it('keeps the first read failure unknown and confirms an empty library only after recovery', () => {
    const r = rig();
    expect(r.state()).toEqual({ works: [], known: false, error: null });
    r.streams[0].error(new Error('private storage path'));
    expect(r.state()).toMatchObject({ works: [], known: false });
    expect(r.state().error).toBeTruthy();
    expect(r.state().error).not.toContain('private storage path');
    r.session.start();
    expect(r.state()).toEqual({ works: [], known: false, error: null });
    r.streams[1].next([]);
    expect(r.state()).toEqual({ works: [], known: true, error: null });
    r.session.close();
  });

  it('retains the last successful full library while a failed subscription is retried', () => {
    const r = rig();
    r.streams[0].next([work]);
    r.streams[0].error(new Error('temporarily offline'));
    expect(r.state()).toMatchObject({ works: [work], known: true });
    expect(r.state().error).toBeTruthy();
    r.session.start();
    expect(r.state()).toEqual({ works: [work], known: true, error: null });
    r.streams[1].next([{ ...work, jobId: 'new' }]);
    expect(r.state()).toEqual({ works: [{ ...work, jobId: 'new' }], known: true, error: null });
    r.session.close();
  });

  it('unsubscribes a superseded watch and ignores every callback after close', () => {
    const r = rig();
    r.session.start();
    const calls = r.accept.mock.calls.length;
    r.streams[0].next([work]);
    expect(r.accept).toHaveBeenCalledTimes(calls);
    r.streams[1].next([work]);
    r.session.close();
    const closedCalls = r.accept.mock.calls.length;
    r.streams[1].next([]);
    r.session.start();
    expect(r.accept).toHaveBeenCalledTimes(closedCalls);
    expect(r.port.works$).toHaveBeenCalledTimes(2);
    const next = rig();
    expect(next.state().known).toBe(false);
    next.session.close();
  });

  it('handles a synchronous source failure and allows a new subscription', () => {
    const events = new Subject<LocalWorkSummary[]>();
    const port = { works$: vi.fn(() => events) };
    port.works$.mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
    const accept = vi.fn<(state: WorkMetadataState) => void>();
    const session = new WorkMetadataSession(port, accept);
    session.start();
    expect(accept.mock.calls.at(-1)![0]).toMatchObject({ known: false, error: expect.any(String) });
    session.start();
    events.next([work]);
    expect(accept.mock.calls.at(-1)![0]).toEqual({ works: [work], known: true, error: null });
    session.close();
  });

  it.each(['next', 'error'])('ignores an obsolete synchronous %s after the consumer starts a newer watch', kind => {
    const current = new Subject<LocalWorkSummary[]>();
    const obsolete =
      kind === 'next' ? of([{ ...work, jobId: 'obsolete' }]) : throwError(() => new Error('obsolete failure'));
    const port = {
      works$: vi.fn<() => Observable<LocalWorkSummary[]>>().mockReturnValueOnce(current).mockReturnValueOnce(obsolete)
    };
    let restarted = false;
    const accept = vi.fn<(state: WorkMetadataState) => void>(state => {
      if (!state.known && !restarted) {
        restarted = true;
        session.start();
      }
    });
    const session = new WorkMetadataSession(port, accept);
    session.start();
    expect(accept).toHaveBeenCalledTimes(2);
    expect(accept.mock.calls.at(-1)![0]).toEqual({ works: [], known: false, error: null });
    current.next([work]);
    expect(accept.mock.calls.at(-1)![0]).toEqual({ works: [work], known: true, error: null });
    expect(port.works$).toHaveBeenCalledTimes(2);
    session.close();
  });
});
