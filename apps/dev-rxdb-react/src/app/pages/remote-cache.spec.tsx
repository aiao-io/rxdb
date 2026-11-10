import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RemoteCachePage from './remote-cache';

const holder = vi.hoisted(() => ({ rxdb: null as unknown }));

vi.mock('@aiao/rxdb-react', () => ({ useRxDB: () => holder.rxdb }));

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

const deferred = <T,>(): Deferred<T> => {
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
    revokeObjectUrl: vi.fn((url: string) => live.delete(url))
  };
  return { storage, lists, creations, live };
};

const META: Meta = { id: 'file-a', opfsPath: 'remote/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 1 };

describe('RemoteCachePage 预览地址的生命周期', () => {
  let fake: ReturnType<typeof createStorage>;

  beforeEach(() => {
    fake = createStorage();
    holder.rxdb = { storage: fake.storage };
  });

  it('列表还没返回就离开页面：之后不再分配预览地址', async () => {
    const view = render(<RemoteCachePage />);

    view.unmount();
    await act(async () => {
      fake.lists[0].resolve([META]);
      await flush();
    });
    await act(async () => {
      fake.creations.forEach(gate => gate.resolve());
      await flush();
    });

    expect(fake.live.size).toBe(0);
  });

  it('预览地址还在分配时离开页面：迟到的地址当场回收', async () => {
    const view = render(<RemoteCachePage />);
    await act(async () => {
      fake.lists[0].resolve([META]);
      await flush();
    });
    expect(fake.creations).toHaveLength(1);

    view.unmount();
    await act(async () => {
      fake.creations[0].resolve();
      await flush();
    });

    expect(fake.live.size).toBe(0);
  });

  it('StrictMode 下挂载两遍：同一文件只留一个地址，离开页面后全部回收', async () => {
    const view = render(
      <StrictMode>
        <RemoteCachePage />
      </StrictMode>
    );
    await act(async () => {
      fake.lists.forEach(list => list.resolve([META]));
      await flush();
    });
    await act(async () => {
      fake.creations.forEach(gate => gate.resolve());
      await flush();
    });

    expect(fake.live.size).toBe(1);

    view.unmount();

    expect(fake.live.size).toBe(0);
  });
});
