import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import RemoteCachePage from './RemoteCachePage.vue';

const holder = vi.hoisted(() => ({ rxdb: null as unknown }));

vi.mock('@aiao/rxdb-vue', () => ({ useRxDB: () => holder.rxdb }));

interface Meta {
  id: string;
  opfsPath: string;
  name: string;
  mimeType: string;
  size: number;
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
    fetch: vi.fn(async () => undefined)
  };
  return { storage, lists, creations, live };
};

const META: Meta = { id: 'file-a', opfsPath: 'remote/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 1 };

const mountPage = () => {
  const host = document.createElement('div');
  const app = createApp(RemoteCachePage);
  app.mount(host);
  return { host, unmount: () => app.unmount() };
};

describe('RemoteCachePage 预览地址的生命周期', () => {
  let fake: ReturnType<typeof createStorage>;

  beforeEach(() => {
    fake = createStorage();
    holder.rxdb = { storage: fake.storage };
  });

  it('列表还没返回就离开页面：之后不再分配预览地址', async () => {
    const page = mountPage();

    page.unmount();
    fake.lists[0].resolve([META]);
    await flush();
    fake.creations.forEach(gate => gate.resolve());
    await flush();

    expect(fake.live.size).toBe(0);
  });

  it('预览地址还在分配时离开页面：迟到的地址当场回收', async () => {
    const page = mountPage();
    fake.lists[0].resolve([META]);
    await flush();
    expect(fake.creations).toHaveLength(1);

    page.unmount();
    fake.creations[0].resolve();
    await flush();

    expect(fake.live.size).toBe(0);
  });

  it('两次刷新交错：同一文件只留一个地址，离开页面后全部回收', async () => {
    const page = mountPage();
    fake.lists[0].resolve([META]);
    await flush();

    const preset = [...page.host.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Picsum #237')
    );
    preset?.click();
    await flush();
    fake.lists[1].resolve([META]);
    await flush();
    fake.creations.forEach(gate => gate.resolve());
    await flush();
    await nextTick();

    expect(fake.storage.fetch).toHaveBeenCalledOnce();
    expect(fake.live.size).toBe(1);

    page.unmount();

    expect(fake.live.size).toBe(0);
  });
});
