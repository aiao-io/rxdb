import type { PublicWorkPayload } from '@aiao-media/api-contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  remoteImageKey,
  remoteImagePage,
  RemoteImagePreviewSession,
  type RemoteImagePreview
} from './remote-image-preview-session';

const work = (index: number): PublicWorkPayload => ({
  version: 1,
  jobId: `work-${index}`,
  prompt: `作品 ${index}`,
  modelId: 'fixture',
  providerInstanceId: 'fixture',
  mimeType: 'image/png',
  width: 1,
  height: 1,
  bytes: 68,
  sha256: index.toString(16).padStart(64, '0'),
  createdAt: '2026-11-14T00:00:00Z'
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const requests: {
    work: PublicWorkPayload;
    signal: AbortSignal;
    task: ReturnType<typeof deferred<{ url: string } | null>>;
  }[] = [];
  const preview = vi.fn((entry: PublicWorkPayload, signal: AbortSignal) => {
    const task = deferred<{ url: string } | null>();
    requests.push({ work: entry, signal, task });
    return task.promise;
  });
  const release = vi.fn();
  let state: ReadonlyMap<string, RemoteImagePreview> = new Map();
  const accept = vi.fn((next: ReadonlyMap<string, RemoteImagePreview>) => {
    state = next;
  });
  const session = new RemoteImagePreviewSession({ preview, release }, accept);
  const status = (entry: PublicWorkPayload) => state.get(remoteImageKey(entry));
  return { session, requests, preview, release, accept, status };
}
const settle = async () => {
  await new Promise<void>(resolve => queueMicrotask(resolve));
};

describe('远端图库分页与预览生命周期', () => {
  it('每页最多 24 张，缩小列表时收敛到最后一页，不接受非整数页号', () => {
    const works = Array.from({ length: 53 }, (_, index) => work(index));
    expect(remoteImagePage(works, 1)).toMatchObject({ page: 1, total: 53, works: works.slice(0, 24) });
    expect(remoteImagePage(works, 2).works).toEqual(works.slice(24, 48));
    expect(remoteImagePage(works, 99)).toMatchObject({ page: 3, works: works.slice(48) });
    expect(remoteImagePage([], 2)).toEqual({ page: 1, total: 0, works: [] });
    for (const invalid of [NaN, Infinity, -1, 0, 1.5]) expect(remoteImagePage(works, invalid).page).toBe(1);
  });

  it('仅可见卡片发起请求，最多两条在途，队列中的离屏图片不读取', async () => {
    const r = setup();
    const works = Array.from({ length: 24 }, (_, index) => work(index));
    r.session.page(works);
    expect(r.preview).not.toHaveBeenCalled();
    for (const entry of works.slice(0, 4)) r.session.visible(entry, true);
    expect(r.requests).toHaveLength(2);
    r.session.visible(works[2], false);
    r.requests[0].task.resolve({ url: 'blob:first' });
    await settle();
    expect(r.requests.map(request => request.work)).toEqual([works[0], works[1], works[3]]);
    expect(r.status(works[0])).toEqual({ status: 'ready', url: 'blob:first' });
    r.requests[1].task.resolve(null);
    r.requests[2].task.resolve(null);
    await settle();
    r.session.close();
    expect(r.release).toHaveBeenCalledWith('blob:first');
  });

  it('离开视口取消读取，取消后迟到 URL 立即释放且不标为可取回', async () => {
    const r = setup();
    const entry = work(1);
    r.session.page([entry]);
    r.session.visible(entry, true);
    r.session.visible(entry, false);
    expect(r.requests[0].signal.aborted).toBe(true);
    r.requests[0].task.resolve({ url: 'blob:late' });
    await settle();
    expect(r.release).toHaveBeenCalledWith('blob:late');
    expect(r.status(entry)).toEqual({ status: 'idle' });
  });

  it('翻页立即释放已显示 URL，旧页迟到结果不能写入新页', async () => {
    const r = setup();
    const a = work(1);
    const b = work(2);
    const c = work(3);
    r.session.page([a, b]);
    r.session.visible(a, true);
    r.session.visible(b, true);
    r.requests[0].task.resolve({ url: 'blob:a' });
    await settle();
    r.session.page([c]);
    expect(r.release).toHaveBeenCalledWith('blob:a');
    expect(r.requests[1].signal.aborted).toBe(true);
    r.requests[1].task.resolve({ url: 'blob:b' });
    await settle();
    expect(r.release).toHaveBeenCalledWith('blob:b');
    expect(r.status(a)).toBeUndefined();
    expect(r.status(c)).toEqual({ status: 'idle' });
    r.session.close();
  });

  it('同一页的元数据更新保留已核对预览，原图身份变化时重新读取', async () => {
    const r = setup();
    const a = work(1);
    r.session.page([a]);
    r.session.visible(a, true);
    r.requests[0].task.resolve({ url: 'blob:a' });
    await settle();
    r.session.page([{ ...a, prompt: '修改描述' }]);
    expect(r.preview).toHaveBeenCalledOnce();
    expect(r.release).not.toHaveBeenCalled();
    r.session.page([{ ...a, bytes: 69 }]);
    expect(r.release).toHaveBeenCalledWith('blob:a');
    expect(r.preview).toHaveBeenCalledTimes(2);
    r.requests[1].task.resolve(null);
    await settle();
    r.session.close();
  });

  it('失败和仅元数据独立展示，显式重试只作用于可见卡片', async () => {
    const r = setup();
    const a = work(1);
    const b = work(2);
    r.session.page([a, b]);
    r.session.visible(a, true);
    r.session.visible(b, true);
    r.requests[0].task.reject(new Error('权限失效'));
    r.requests[1].task.resolve(null);
    await settle();
    expect(r.status(a)).toMatchObject({ status: 'failed', message: '权限失效' });
    expect(r.status(b)).toEqual({ status: 'unavailable' });
    r.session.visible(a, false);
    r.session.retry(a);
    expect(r.requests).toHaveLength(2);
    r.session.retry(b);
    expect(r.requests).toHaveLength(3);
    r.requests[2].task.resolve({ url: 'blob:b' });
    await settle();
    expect(r.status(b)?.status).toBe('ready');
    r.session.close();
  });

  it('切账号重置取消旧请求，旧请求未退出前仍计入并发上限', async () => {
    const r = setup();
    const a = work(1);
    const b = work(2);
    const c = work(3);
    r.session.page([a, b]);
    r.session.visible(a, true);
    r.session.visible(b, true);
    r.session.reset();
    r.session.page([c]);
    r.session.visible(c, true);
    expect(r.requests).toHaveLength(2);
    expect(r.requests.every(request => request.signal.aborted)).toBe(true);
    r.requests[0].task.resolve({ url: 'blob:account-a' });
    await settle();
    expect(r.requests).toHaveLength(3);
    expect(r.release).toHaveBeenCalledWith('blob:account-a');
    r.session.close();
    r.requests[1].task.resolve(null);
    r.requests[2].task.resolve({ url: 'blob:closed' });
    await settle();
    expect(r.release).toHaveBeenCalledWith('blob:closed');
    const count = r.accept.mock.calls.length;
    r.session.page([a]);
    r.session.visible(a, true);
    r.session.retry(a);
    r.session.close();
    expect(r.accept).toHaveBeenCalledTimes(count);
  });
});
