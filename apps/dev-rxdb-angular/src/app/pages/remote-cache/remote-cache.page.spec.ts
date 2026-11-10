import { RxDB } from '@aiao/rxdb';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RemoteCachePage from './remote-cache.page';

interface Meta {
  id: string;
  opfsPath: string;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => (resolve = settle));
  return { promise, resolve };
};

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** storage 替身：`list` / `createObjectUrl` 何时返回由用例控制，`live` 记着分配了还没回收的地址。 */
const createStorage = () => {
  const lists: Deferred<Meta[]>[] = [];
  const creations: Deferred<void>[] = [];
  const live = new Set<string>();
  let seq = 0;
  const storage = {
    list: vi.fn(() => {
      const next = deferred<Meta[]>();
      lists.push(next);
      return next.promise;
    }),
    createObjectUrl: vi.fn(async () => {
      const gate = deferred<void>();
      creations.push(gate);
      await gate.promise;
      const url = `blob:${++seq}`;
      live.add(url);
      return url;
    }),
    revokeObjectUrl: vi.fn((url: string) => live.delete(url)),
    clear: vi.fn(async () => undefined)
  };
  return { storage, lists, creations, live };
};

const META: Meta = { id: 'file-a', opfsPath: 'remote/a.jpg' };

describe('RemoteCachePage 预览地址的生命周期', () => {
  let fake: ReturnType<typeof createStorage>;

  beforeEach(() => {
    fake = createStorage();
    TestBed.configureTestingModule({ providers: [{ provide: RxDB, useValue: { storage: fake.storage } }] });
  });

  afterEach(() => TestBed.resetTestingModule());

  const createPage = () => TestBed.runInInjectionContext(() => new RemoteCachePage());

  it('列表还没返回就离开页面：之后不再分配预览地址', async () => {
    const page = createPage();
    const init = page.ngOnInit();

    page.ngOnDestroy();
    fake.lists[0].resolve([META]);
    await flush();
    fake.creations.forEach(gate => gate.resolve());
    await init;

    expect(fake.live.size).toBe(0);
  });

  it('预览地址还在分配时离开页面：迟到的地址当场回收', async () => {
    const page = createPage();
    const init = page.ngOnInit();
    fake.lists[0].resolve([META]);
    await flush();
    expect(fake.creations).toHaveLength(1);

    page.ngOnDestroy();
    fake.creations[0].resolve();
    await init;

    expect(fake.live.size).toBe(0);
  });

  it('刷新复用仍在的文件的地址，回收已不在列表里的', async () => {
    const page = createPage();
    const init = page.ngOnInit();
    fake.lists[0].resolve([META]);
    await flush();
    fake.creations[0].resolve();
    await init;
    expect(page.cached().map(item => item.objectUrl)).toEqual(['blob:1']);

    const clearing = page.clearAll();
    await flush();
    fake.lists[1].resolve([]);
    await clearing;

    expect(fake.storage.createObjectUrl).toHaveBeenCalledTimes(1);
    expect(page.cached()).toEqual([]);
    expect(fake.live.size).toBe(0);
  });

  it('两次刷新交错：同一文件只留一个地址，离开页面后全部回收', async () => {
    const page = createPage();
    const init = page.ngOnInit();
    fake.lists[0].resolve([META]);
    await flush();

    const clearing = page.clearAll();
    await flush();
    fake.lists[1].resolve([META]);
    await flush();
    fake.creations.forEach(gate => gate.resolve());
    await Promise.all([init, clearing]);
    await flush();
    fake.creations.forEach(gate => gate.resolve());
    await flush();

    expect(page.cached().map(item => item.meta.id)).toEqual([META.id]);
    expect(fake.live.size).toBe(1);

    page.ngOnDestroy();

    expect(fake.live.size).toBe(0);
  });
});
