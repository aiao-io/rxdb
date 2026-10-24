import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { LocalWorkSummary } from '../local-data/index';
import { WorkLibrarySession } from './work-library-session';

const work = (jobId: string): LocalWorkSummary => ({
  jobId,
  prompt: jobId,
  modelId: 'fixture',
  bytes: 10,
  status: 'saved'
});
const deferred = () => {
  let resolve!: (url: string) => void;
  const promise = new Promise<string>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
function rig() {
  const events = new Subject<LocalWorkSummary[]>();
  const port = {
    works$: () => events,
    preview: vi.fn(async (id: string) => `blob:${id}`),
    release: vi.fn()
  };
  const accept = vi.fn(),
    report = vi.fn();
  const session = new WorkLibrarySession(port, accept, report);
  session.start();
  return { events, port, accept, report, session };
}
describe('reactive work library previews', () => {
  it('processes changes received while an earlier preview is loading', async () => {
    const r = rig(),
      gate = deferred();
    r.port.preview.mockReturnValueOnce(gate.promise);
    r.events.next([work('first')]);
    r.events.next([work('first'), work('second')]);
    gate.resolve('blob:first');
    await vi.waitFor(() =>
      expect(r.accept).toHaveBeenLastCalledWith([
        { ...work('first'), url: 'blob:first' },
        { ...work('second'), url: 'blob:second' }
      ])
    );
    expect(r.port.preview).toHaveBeenCalledTimes(2);
    r.session.close();
  });
  it('reuses surviving previews and releases only removed works', async () => {
    const r = rig();
    r.events.next([work('first'), work('second')]);
    await vi.waitFor(() => expect(r.accept).toHaveBeenCalledOnce());
    r.events.next([work('second')]);
    await vi.waitFor(() => expect(r.accept).toHaveBeenCalledTimes(2));
    expect(r.port.preview).toHaveBeenCalledTimes(2);
    expect(r.port.release).toHaveBeenCalledExactlyOnceWith('blob:first');
    r.session.close();
    expect(r.port.release).toHaveBeenCalledWith('blob:second');
  });
  it('reclaims late previews after closing without updating the UI', async () => {
    const r = rig(),
      gate = deferred();
    r.port.preview.mockReturnValueOnce(gate.promise);
    r.events.next([work('first'), work('second')]);
    r.events.next([work('third')]);
    r.session.close();
    gate.resolve('blob:first');
    await vi.waitFor(() => expect(r.port.release).toHaveBeenCalledWith('blob:first'));
    expect(r.port.preview).toHaveBeenCalledOnce();
    expect(r.accept).not.toHaveBeenCalled();
  });
  it('keeps an unreadable work visible and continues subsequent updates', async () => {
    const r = rig();
    r.port.preview.mockRejectedValueOnce(new Error('missing file'));
    r.events.next([work('first')]);
    await vi.waitFor(() => expect(r.accept).toHaveBeenCalledWith([{ ...work('first'), url: null }]));
    r.events.next([]);
    await vi.waitFor(() => expect(r.accept).toHaveBeenLastCalledWith([]));
    r.session.close();
  });
  it('reclaims pending previews when the live query fails', async () => {
    const r = rig(),
      gate = deferred();
    r.port.preview.mockReturnValueOnce(gate.promise);
    r.events.next([work('first')]);
    r.events.error(new Error('database unavailable'));
    expect(r.report).toHaveBeenCalledOnce();
    gate.resolve('blob:first');
    await vi.waitFor(() => expect(r.port.release).toHaveBeenCalledWith('blob:first'));
    expect(r.accept).not.toHaveBeenCalled();
  });
});
