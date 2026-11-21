import { describe, expect, it, vi } from 'vitest';
import type { CommitPage, CommitSummary } from '../model.js';
import { CommitHistory, type HistoryBranch } from './commit-history.js';

const commit = (id: string, parent: string): CommitSummary => ({
  id,
  parentIds: [parent],
  kind: 'normal',
  authorId: 'u1',
  message: id,
  createdAt: '2026-11-18T00:00:00.000Z'
});
const page = (ids: string[], nextBefore: string | null): CommitPage => ({
  commits: ids.map((id, index) => commit(id, ids[index + 1] ?? 'root')),
  nextBefore
});
const shared: HistoryBranch = { branch: 'shared' };
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const ids = (view: { commits: CommitSummary[] } | undefined) => view?.commits.map(item => item.id);

function setup() {
  const fetch = vi.fn<(branch: HistoryBranch, before: string | undefined) => Promise<CommitPage>>();
  const loaded = vi.fn();
  const failed = vi.fn();
  return { history: new CommitHistory(fetch, loaded, failed), fetch, loaded, failed };
}

describe('按分支与头提交缓存的提交历史', () => {
  it('头为 null（空分支或任务还没有提交）时直接是空列表，不发请求', () => {
    const { history, fetch } = setup();
    expect(history.peek(shared, null)).toEqual({ commits: [], hasEarlier: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('未命中返回 undefined 并只读一次第一页，读完通知重绘，之后同步命中', async () => {
    const { history, fetch, loaded } = setup();
    fetch.mockResolvedValue(page(['m3', 'm2'], 'm2'));
    expect(history.peek(shared, 'm3')).toBeUndefined();
    expect(history.peek(shared, 'm3')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(shared, undefined);
    await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
    expect(history.peek(shared, 'm3')).toEqual({ commits: page(['m3', 'm2'], 'm2').commits, hasEarlier: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('头变化即换键、从第一页重读；不同分支各自缓存', async () => {
    const { history, fetch } = setup();
    fetch
      .mockResolvedValueOnce(page(['m1'], null))
      .mockResolvedValueOnce(page(['m2', 'm1'], null))
      .mockResolvedValueOnce(page(['t1'], null));
    history.peek(shared, 'm1');
    await vi.waitFor(() => expect(ids(history.peek(shared, 'm1'))).toEqual(['m1']));
    expect(history.peek(shared, 'm2')).toBeUndefined();
    await vi.waitFor(() => expect(ids(history.peek(shared, 'm2'))).toEqual(['m2', 'm1']));
    const pr: HistoryBranch = { prId: 'pr' };
    expect(history.peek(pr, 't1')).toBeUndefined();
    await vi.waitFor(() => expect(ids(history.peek(pr, 't1'))).toEqual(['t1']));
    expect(ids(history.peek(shared, 'm2'))).toEqual(['m2', 'm1']);
    expect(fetch.mock.calls).toEqual([
      [shared, undefined],
      [shared, undefined],
      [pr, undefined]
    ]);
  });
  it('丢弃旧头的页：换回旧头时重新读取', async () => {
    const { history, fetch } = setup();
    fetch.mockResolvedValue(page(['m1'], null));
    history.peek(shared, 'm1');
    await vi.waitFor(() => expect(history.peek(shared, 'm1')).toBeDefined());
    history.peek(shared, 'm2');
    await vi.waitFor(() => expect(history.peek(shared, 'm2')).toBeDefined());
    expect(history.peek(shared, 'm1')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('「加载更早」用最后一页的 nextBefore 接着读并接在后面，读完通知重绘', async () => {
    const { history, fetch, loaded } = setup();
    fetch.mockResolvedValueOnce(page(['m5', 'm4'], 'm4')).mockResolvedValueOnce(page(['m3', 'm2'], 'm2'));
    history.peek(shared, 'm5');
    await vi.waitFor(() => expect(history.peek(shared, 'm5')).toBeDefined());
    await history.loadEarlier(shared, 'm5');
    expect(fetch).toHaveBeenLastCalledWith(shared, 'm4');
    expect(history.peek(shared, 'm5')).toEqual({
      commits: [...page(['m5', 'm4'], 'm4').commits, ...page(['m3', 'm2'], 'm2').commits],
      hasEarlier: true
    });
    expect(loaded).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValueOnce(page(['m1'], null));
    await history.loadEarlier(shared, 'm5');
    expect(ids(history.peek(shared, 'm5'))).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
    expect(history.peek(shared, 'm5')?.hasEarlier).toBe(false);
  });
  it('同一页的并发「加载更早」只读一次；没有更早的页或还没读到第一页时什么也不做', async () => {
    const { history, fetch } = setup();
    await history.loadEarlier(shared, 'm2');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(page(['m2'], 'm2'));
    history.peek(shared, 'm2');
    await vi.waitFor(() => expect(history.peek(shared, 'm2')).toBeDefined());
    const reply = Promise.withResolvers<CommitPage>();
    fetch.mockReturnValueOnce(reply.promise);
    const both = Promise.all([history.loadEarlier(shared, 'm2'), history.loadEarlier(shared, 'm2')]);
    reply.resolve(page(['m1'], null));
    await both;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(ids(history.peek(shared, 'm2'))).toEqual(['m2', 'm1']);
    await history.loadEarlier(shared, 'm2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('「加载更早」期间头变了或被重置，这一页不再相接，丢弃且不通知', async () => {
    const { history, fetch, loaded } = setup();
    fetch.mockResolvedValueOnce(page(['m3'], 'm3'));
    history.peek(shared, 'm3');
    await vi.waitFor(() => expect(history.peek(shared, 'm3')).toBeDefined());
    const late = Promise.withResolvers<CommitPage>();
    fetch.mockReturnValueOnce(late.promise).mockResolvedValueOnce(page(['m4', 'm3'], 'm3'));
    const earlier = history.loadEarlier(shared, 'm3');
    history.peek(shared, 'm4');
    await vi.waitFor(() => expect(history.peek(shared, 'm4')).toBeDefined());
    loaded.mockClear();
    late.resolve(page(['m2', 'm1'], null));
    await earlier;
    expect(ids(history.peek(shared, 'm4'))).toEqual(['m4', 'm3']);
    expect(loaded).not.toHaveBeenCalled();

    const again = setup();
    again.fetch.mockResolvedValue(page(['fresh'], null));
    again.fetch.mockResolvedValueOnce(page(['m3'], 'm3'));
    again.history.peek(shared, 'm3');
    await vi.waitFor(() => expect(again.history.peek(shared, 'm3')).toBeDefined());
    const pending = Promise.withResolvers<CommitPage>();
    again.fetch.mockReturnValueOnce(pending.promise);
    const reading = again.history.loadEarlier(shared, 'm3');
    again.history.reset();
    pending.resolve(page(['m2'], null));
    await reading;
    expect(again.history.peek(shared, 'm3')).toBeUndefined();
  });
  it('后台读取失败只报告一次、不自动重试；retry 之后再读；用户操作的「加载更早」失败抛给调用方', async () => {
    const { history, fetch, failed } = setup();
    fetch.mockRejectedValueOnce(new Error('down')).mockResolvedValue(page(['m1'], 'm1'));
    expect(history.peek(shared, 'm1')).toBeUndefined();
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    for (let index = 0; index < 3; index++) expect(history.peek(shared, 'm1')).toBeUndefined();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    history.retry();
    expect(history.peek(shared, 'm1')).toBeUndefined();
    await vi.waitFor(() => expect(history.peek(shared, 'm1')).toBeDefined());
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockRejectedValueOnce(new Error('earlier down'));
    await expect(history.loadEarlier(shared, 'm1')).rejects.toThrow('earlier down');
    expect(failed).toHaveBeenCalledTimes(1);
    expect(ids(history.peek(shared, 'm1'))).toEqual(['m1']);
  });
  it('重置丢弃全部历史，进行中的第一页读取结果不再写入也不再通知', async () => {
    const { history, fetch, loaded, failed } = setup();
    const late = Promise.withResolvers<CommitPage>();
    fetch.mockReturnValueOnce(late.promise).mockResolvedValue(page(['m1'], null));
    history.peek(shared, 'm1');
    history.reset();
    late.resolve(page(['stale'], null));
    await settle();
    expect(loaded).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(history.peek(shared, 'm1')).toBeUndefined();
    await vi.waitFor(() => expect(ids(history.peek(shared, 'm1'))).toEqual(['m1']));
  });
});
