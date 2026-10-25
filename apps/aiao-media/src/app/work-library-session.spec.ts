import { of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { ImageMimeType } from '../contracts/image-format';
import type { LocalWorkQuery, LocalWorkSummary } from '../local-data/index';
import { type LibraryState, WorkLibrarySession } from './work-library-session';

const work = (jobId: string): LocalWorkSummary => ({
  jobId,
  prompt: jobId,
  modelId: 'fixture',
  bytes: 10,
  status: 'saved'
});
const deferred = () => {
  let resolve!: (url: string) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ url: string; mimeType: 'image/png' }>((done, fail) => {
    resolve = url => done({ url, mimeType: 'image/png' });
    reject = fail;
  });
  return { promise, resolve, reject };
};
function rig(query: LocalWorkQuery = {}) {
  const pages: Subject<LocalWorkSummary[]>[] = [],
    counts: Subject<number>[] = [];
  const port = {
    works$: vi.fn(() => {
      const events = new Subject<LocalWorkSummary[]>();
      pages.push(events);
      return events;
    }),
    workCount$: vi.fn(() => {
      const events = new Subject<number>();
      counts.push(events);
      return events;
    }),
    previewImage: vi.fn(async (id: string) => ({
      url: `blob:${id}`,
      mimeType: 'image/png' as ImageMimeType
    })),
    release: vi.fn()
  };
  const accept = vi.fn<(state: LibraryState) => void>(),
    report = vi.fn();
  const session = new WorkLibrarySession(port, accept, report);
  session.start(query);
  const state = () => accept.mock.calls.at(-1)![0];
  const emit = (entries: LocalWorkSummary[], total = entries.length, index = pages.length - 1) => {
    counts[index].next(total);
    pages[index].next(entries);
  };
  return { pages, counts, port, accept, report, session, state, emit };
}

describe('paged work library previews', () => {
  it('retains the actual JPEG format alongside a verified preview', async () => {
    const r = rig();
    r.port.previewImage.mockResolvedValueOnce({ url: 'blob:jpeg', mimeType: 'image/jpeg' });
    r.emit([work('jpeg')]);
    r.session.setVisible('jpeg', true);
    await vi.waitFor(() => expect(r.state().works[0]).toMatchObject({ url: 'blob:jpeg', mimeType: 'image/jpeg' }));
    r.session.close();
  });
  it('queries a bounded native page and publishes metadata without reading files', () => {
    const r = rig({ search: 'cat', offset: 35, limit: 100 });
    expect(r.port.works$).toHaveBeenCalledWith(expect.objectContaining({ search: 'cat', offset: 24, limit: 24 }));
    expect(r.state()).toMatchObject({ works: [], page: 2, pageSize: 24, total: null, loading: true });
    r.emit([work('first')], 50);
    expect(r.state()).toMatchObject({
      works: [{ ...work('first'), url: null, previewStatus: 'idle' }],
      page: 2,
      total: 50,
      loading: false,
      error: null
    });
    expect(r.port.previewImage).not.toHaveBeenCalled();
    r.session.close();
  });

  it('loads only visible saved cards and deduplicates visibility and metadata events', async () => {
    const r = rig(),
      gate = deferred();
    r.port.previewImage.mockReturnValueOnce(gate.promise);
    r.emit([work('first'), work('second'), { ...work('broken'), status: 'broken' }]);
    r.session.setVisible('first', true);
    r.session.setVisible('first', true);
    r.session.setVisible('broken', true);
    r.session.setVisible('absent', true);
    r.emit([work('first'), work('second'), { ...work('broken'), status: 'broken' }]);
    expect(r.port.previewImage).toHaveBeenCalledExactlyOnceWith('first');
    expect(r.state().works[0].previewStatus).toBe('loading');
    gate.resolve('blob:first');
    await vi.waitFor(() => expect(r.state().works[0]).toMatchObject({ url: 'blob:first', previewStatus: 'ready' }));
    r.emit([{ ...work('first'), prompt: 'updated' }, work('second')]);
    expect(r.state().works[0].url).toBe('blob:first');
    expect(r.port.previewImage).toHaveBeenCalledOnce();
    r.session.close();
  });

  it('loads independent visible cards without waiting for an earlier file', async () => {
    const r = rig(),
      gate = deferred();
    r.port.previewImage.mockReturnValueOnce(gate.promise);
    r.emit([work('first'), work('second')]);
    r.session.setVisible('first', true);
    r.session.setVisible('second', true);
    await vi.waitFor(() => expect(r.state().works[1].url).toBe('blob:second'));
    expect(r.state().works[0].url).toBeNull();
    gate.resolve('blob:first');
    await vi.waitFor(() => expect(r.state().works[0].url).toBe('blob:first'));
    r.session.close();
  });

  it('releases a card as soon as it leaves the viewport and reloads on return', async () => {
    const r = rig();
    r.emit([work('first')]);
    r.session.setVisible('first', true);
    await vi.waitFor(() => expect(r.state().works[0].url).toBe('blob:first'));
    r.session.setVisible('first', false);
    expect(r.port.release).toHaveBeenCalledExactlyOnceWith('blob:first');
    expect(r.state().works[0]).toMatchObject({ url: null, previewStatus: 'idle' });
    r.session.setVisible('first', true);
    await vi.waitFor(() => expect(r.port.previewImage).toHaveBeenCalledTimes(2));
    r.session.close();
  });

  it('shares a pending preview across hide and show and releases a hidden late result', async () => {
    const r = rig(),
      gate = deferred();
    r.port.previewImage.mockReturnValueOnce(gate.promise);
    r.emit([work('first')]);
    r.session.setVisible('first', true);
    r.session.setVisible('first', false);
    r.session.setVisible('first', true);
    expect(r.port.previewImage).toHaveBeenCalledOnce();
    r.session.setVisible('first', false);
    gate.resolve('blob:late');
    await vi.waitFor(() => expect(r.port.release).toHaveBeenCalledWith('blob:late'));
    expect(r.state().works[0].url).toBeNull();
    expect(r.port.previewImage).toHaveBeenCalledOnce();
    r.session.close();
  });

  it('clears a page synchronously, changes view keys and releases its previews when filtering', async () => {
    const r = rig();
    r.emit([work('first')]);
    const viewKey = r.state().works[0].viewKey;
    r.session.setVisible('first', true);
    await vi.waitFor(() => expect(r.state().works[0].url).toBe('blob:first'));
    r.session.query({ model: 'fixture' });
    expect(r.port.release).toHaveBeenCalledExactlyOnceWith('blob:first');
    expect(r.state()).toMatchObject({ works: [], loading: true, total: null });
    r.emit([work('first')]);
    expect(r.state().works[0].viewKey).not.toBe(viewKey);
    expect(r.port.previewImage).toHaveBeenCalledOnce();
    r.session.close();
  });

  it('reclaims an old query result before loading the same visible ID in the new query', async () => {
    const r = rig(),
      gate = deferred();
    r.port.previewImage.mockReturnValueOnce(gate.promise);
    r.emit([work('first')]);
    r.session.setVisible('first', true);
    r.session.query({ search: 'first' });
    r.emit([work('first')]);
    r.session.setVisible('first', true);
    expect(r.port.previewImage).toHaveBeenCalledOnce();
    gate.resolve('blob:old');
    await vi.waitFor(() => expect(r.port.previewImage).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(r.state().works[0].url).toBe('blob:first'));
    expect(r.port.release).toHaveBeenCalledExactlyOnceWith('blob:old');
    expect(r.state().works[0].url).not.toBe('blob:old');
    r.session.close();
  });

  it('releases removed, broken or replaced files while retaining surviving card resources', async () => {
    const r = rig();
    r.emit([work('first'), work('second')]);
    r.session.setVisible('first', true);
    r.session.setVisible('second', true);
    await vi.waitFor(() => expect(r.state().works.every(item => item.url)).toBe(true));
    r.emit([{ ...work('second'), bytes: 20 }]);
    expect(r.port.release).toHaveBeenCalledWith('blob:first');
    expect(r.port.release).toHaveBeenCalledWith('blob:second');
    await vi.waitFor(() => expect(r.port.previewImage).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(r.state().works[0].url).toBe('blob:second'));
    r.emit([{ ...work('second'), bytes: 20, status: 'broken' }]);
    expect(r.state().works[0].url).toBeNull();
    expect(r.port.release).toHaveBeenCalledTimes(3);
    r.session.close();
  });

  it('does not attach a removed card request to a later card with the same ID', async () => {
    const r = rig(),
      gate = deferred();
    r.port.previewImage.mockReturnValueOnce(gate.promise);
    r.emit([work('first')]);
    r.session.setVisible('first', true);
    r.emit([]);
    r.emit([{ ...work('first'), bytes: 20 }]);
    r.session.setVisible('first', true);
    gate.resolve('blob:removed');
    await vi.waitFor(() => expect(r.port.release).toHaveBeenCalledWith('blob:removed'));
    await vi.waitFor(() => expect(r.port.previewImage).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(r.state().works[0].url).toBe('blob:first'));
    r.session.close();
  });

  it('shows a safe preview error and retries only on an explicit action', async () => {
    const r = rig();
    r.port.previewImage.mockRejectedValueOnce(new Error('private database path'));
    r.emit([work('first')]);
    r.session.setVisible('first', true);
    await vi.waitFor(() => expect(r.state().works[0].previewStatus).toBe('error'));
    expect(r.state().works[0].previewError).not.toContain('private database path');
    r.emit([work('first')]);
    r.session.setVisible('first', true);
    expect(r.port.previewImage).toHaveBeenCalledOnce();
    r.session.retry('first');
    await vi.waitFor(() => expect(r.state().works[0]).toMatchObject({ url: 'blob:first', previewStatus: 'ready' }));
    expect(r.port.previewImage).toHaveBeenCalledTimes(2);
    r.session.close();
  });

  it('clamps a removed last page through a new native query', () => {
    const r = rig({ offset: 48, search: 'cat' });
    r.emit([work('last')], 50);
    const viewKey = r.state().works[0].viewKey;
    r.counts[0].next(25);
    expect(r.port.works$).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 24, limit: 24, search: 'cat' }));
    expect(r.state()).toMatchObject({ works: [], loading: true, page: 2 });
    r.emit([work('last')], 25);
    expect(r.state().works[0].viewKey).not.toBe(viewKey);
    expect(r.state()).toMatchObject({ total: 25, page: 2, loading: false });
    r.session.close();
  });

  it('handles a synchronously clamped page without retaining the obsolete subscription', () => {
    const obsolete = new Subject<LocalWorkSummary[]>();
    const port = {
      works$: vi.fn((query?: LocalWorkQuery) => (query?.offset ? obsolete : of([work('first')]))),
      workCount$: () => of(1),
      previewImage: vi.fn(async (id: string) => ({
        url: `blob:${id}`,
        mimeType: 'image/png' as ImageMimeType
      })),
      release: vi.fn()
    };
    const accept = vi.fn<(state: LibraryState) => void>();
    const session = new WorkLibrarySession(port, accept, vi.fn());
    session.start({ offset: 24 });
    obsolete.next([work('obsolete')]);
    expect(accept.mock.calls.at(-1)![0]).toMatchObject({ page: 1, works: [{ jobId: 'first' }] });
    session.close();
  });

  it('reclaims previews on query failure, reports once and permits a fresh query', async () => {
    const r = rig(),
      gate = deferred();
    r.port.previewImage.mockReturnValueOnce(gate.promise);
    r.emit([work('first')]);
    r.session.setVisible('first', true);
    r.pages[0].error(new Error('private database path'));
    expect(r.report).toHaveBeenCalledOnce();
    expect(r.state()).toMatchObject({ works: [], total: null, loading: false });
    expect(r.state().error).not.toContain('private database path');
    gate.resolve('blob:late');
    await vi.waitFor(() => expect(r.port.release).toHaveBeenCalledWith('blob:late'));
    r.session.query({});
    r.emit([work('second')]);
    expect(r.state()).toMatchObject({ works: [{ jobId: 'second' }], error: null });
    r.session.close();
  });

  it('releases ready previews if the independent count query fails', async () => {
    const r = rig();
    r.emit([work('first')]);
    r.session.setVisible('first', true);
    await vi.waitFor(() => expect(r.state().works[0].url).toBe('blob:first'));
    r.counts[0].error(new Error('count failed'));
    expect(r.port.release).toHaveBeenCalledExactlyOnceWith('blob:first');
    expect(r.state()).toMatchObject({ works: [], total: null, loading: false });
    expect(r.report).toHaveBeenCalledOnce();
    r.pages[0].next([work('stale')]);
    expect(r.state().works).toEqual([]);
    r.session.close();
  });

  it('releases held and late URLs after closing without further UI callbacks', async () => {
    const r = rig(),
      gate = deferred();
    r.emit([work('first'), work('second')]);
    r.session.setVisible('first', true);
    await vi.waitFor(() => expect(r.state().works[0].url).toBe('blob:first'));
    r.port.previewImage.mockReturnValueOnce(gate.promise);
    r.session.setVisible('second', true);
    r.session.close();
    const calls = r.accept.mock.calls.length;
    expect(r.port.release).toHaveBeenCalledWith('blob:first');
    gate.resolve('blob:late');
    await vi.waitFor(() => expect(r.port.release).toHaveBeenCalledWith('blob:late'));
    r.session.query({});
    r.session.setVisible('first', true);
    expect(r.accept).toHaveBeenCalledTimes(calls);
  });
});
