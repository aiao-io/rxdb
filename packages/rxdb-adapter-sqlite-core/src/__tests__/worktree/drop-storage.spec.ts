import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSqliteError } from '../../sqlite-core.utils.js';
import { deleteIndexedDatabase, removeOpfsFiles } from '../../worktree/drop-storage.js';

/**
 * @fileoverview SQLite 系 `dropStorage()` 共用的删存储工具（US-313）：错误分支的直接单测。
 *
 * @remarks
 * 各适配器的 `drop-storage.spec.ts` 只走真实存储的快乐路径，共享层的退避、耗尽与宽限期在这里钉死：
 * OPFS 根目录句柄与 `indexedDB.deleteDatabase` 的请求换成假的，时间用 fake timers 推进。
 * 桩只装在本文件的用例里，`afterEach` 还原。
 *
 * `navigator` 与 `indexedDB` 整个换成桩，不去 spy 真的：本文件也在 node 里跑
 * （coverage-acceptance 的 core 段），那里没有 `navigator.storage`，也没有 `indexedDB`。
 */

/** 文件被占用时 `removeEntry` 抛的错（Chromium 部分版本报 `InvalidModificationError`）。 */
const busy = (name = 'NoModificationAllowedError') => new DOMException('held', name);

interface RemoveCall {
  readonly name: string;
  /** 调用时刻相对用例开始的（假）毫秒数 */
  readonly at: number;
}

/**
 * 把 OPFS 根目录换成只认 `removeEntry` 的假目录。
 *
 * @param outcomes - 每个文件名依次删除的结局：错误即抛出，`undefined` 即删成；没列出的文件名、或排完了，都算删成
 * @returns 每次 `removeEntry` 的调用记录
 */
const fakeOpfsRoot = (outcomes: Record<string, (Error | undefined)[]>): RemoveCall[] => {
  const start = Date.now();
  const calls: RemoveCall[] = [];
  const removeEntry = async (name: string): Promise<void> => {
    calls.push({ name, at: Date.now() - start });
    const failure = outcomes[name]?.shift();
    if (failure) throw failure;
  };
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({ removeEntry }) } });
  return calls;
};

/** `indexedDB.deleteDatabase` 返回的请求里实现用到的部分；何时触发由用例决定。 */
interface FakeDeleteRequest {
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
}

const fakeDeleteRequest = (): FakeDeleteRequest => {
  const request: FakeDeleteRequest = { error: null, onsuccess: null, onerror: null, onblocked: null };
  vi.stubGlobal('indexedDB', { deleteDatabase: vi.fn(() => request) });
  return request;
};

interface Settlement {
  status: 'pending' | 'fulfilled' | 'rejected';
  reason?: unknown;
}

/** 盯住一个 Promise 的结局，不在用例里留下未处理的拒绝。 */
const track = (promise: Promise<void>): Settlement => {
  const state: Settlement = { status: 'pending' };
  void promise.then(
    () => {
      state.status = 'fulfilled';
    },
    (reason: unknown) => {
      state.status = 'rejected';
      state.reason = reason;
    }
  );
  return state;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('removeOpfsFiles', () => {
  it('一直被占：按 50 毫秒起逐次翻倍退避重试 6 次，第 7 次仍被占才抛，不再多等一档；原错误挂在 cause 上', async () => {
    const failures = Array.from({ length: 7 }, () => busy());
    const start = Date.now();
    const calls = fakeOpfsRoot({ 'held.sqlite': [...failures] });
    let rejectedAt = -1;
    const removing = removeOpfsFiles(['held.sqlite']).catch((error: unknown) => {
      rejectedAt = Date.now() - start;
      return error;
    });

    await vi.runAllTimersAsync();
    const error = await removing;

    expect(calls).toEqual([0, 50, 150, 350, 750, 1550, 3150].map(at => ({ name: 'held.sqlite', at })));
    expect(rejectedAt).toBe(3150);
    expect(error).toBeInstanceOf(RxDBAdapterSqliteError);
    expect((error as Error).message).toBe('OPFS file "held.sqlite" is still held by another context');
    expect((error as Error).cause).toBe(failures[6]);
  });

  it('不存在的跳过、接着删下一个；InvalidModificationError 也当占用退避重试', async () => {
    const calls = fakeOpfsRoot({
      'a.sqlite': [new DOMException('gone', 'NotFoundError')],
      'a.sqlite-wal': [busy('InvalidModificationError'), busy(), undefined]
    });
    const removing = track(removeOpfsFiles(['a.sqlite', 'a.sqlite-journal', 'a.sqlite-wal']));

    await vi.runAllTimersAsync();

    expect(removing.status).toBe('fulfilled');
    expect(calls).toEqual([
      { name: 'a.sqlite', at: 0 },
      { name: 'a.sqlite-journal', at: 0 },
      { name: 'a.sqlite-wal', at: 0 },
      { name: 'a.sqlite-wal', at: 50 },
      { name: 'a.sqlite-wal', at: 150 }
    ]);
  });

  it.each([
    ['别的 DOMException', new DOMException('denied', 'SecurityError')],
    ['名字相同却不是 DOMException', Object.assign(new Error('look-alike'), { name: 'NoModificationAllowedError' })]
  ])('不是占用的错误（%s）：立即原样抛出，不重试，也不再删后面的文件', async (_label, failure) => {
    const calls = fakeOpfsRoot({ 'a.sqlite': [failure] });

    await expect(removeOpfsFiles(['a.sqlite', 'a.sqlite-journal'])).rejects.toBe(failure);
    expect(calls.map(call => call.name)).toEqual(['a.sqlite']);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('deleteIndexedDatabase', () => {
  it('删除成功：resolve', async () => {
    const request = fakeDeleteRequest();
    const deleting = deleteIndexedDatabase('snapshot-db');

    expect(indexedDB.deleteDatabase).toHaveBeenCalledWith('snapshot-db');
    request.onsuccess!();
    await expect(deleting).resolves.toBeUndefined();
  });

  it('删除失败：拒绝，请求的错误挂在 cause 上', async () => {
    const request = fakeDeleteRequest();
    const deleting = deleteIndexedDatabase('snapshot-db');

    request.error = new DOMException('quota', 'UnknownError');
    request.onerror!();
    const error = await deleting.catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(RxDBAdapterSqliteError);
    expect((error as Error).message).toBe('IndexedDB database "snapshot-db" could not be deleted');
    expect((error as Error).cause).toBe(request.error);
  });

  it('被别的连接挡住超过 3 秒宽限期：拒绝，点名库还开着', async () => {
    const request = fakeDeleteRequest();
    const deleting = track(deleteIndexedDatabase('snapshot-db'));

    request.onblocked!();
    await vi.advanceTimersByTimeAsync(2999);
    expect(deleting.status).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);

    expect(deleting.status).toBe('rejected');
    expect(deleting.reason).toBeInstanceOf(RxDBAdapterSqliteError);
    expect((deleting.reason as Error).message).toBe('IndexedDB database "snapshot-db" is still open elsewhere');
  });

  it('挡住之后在宽限期内删成：resolve，宽限计时随之清掉', async () => {
    const request = fakeDeleteRequest();
    const deleting = track(deleteIndexedDatabase('snapshot-db'));

    request.onblocked!();
    await vi.advanceTimersByTimeAsync(2999);
    request.onsuccess!();
    await vi.advanceTimersByTimeAsync(0);

    expect(deleting.status).toBe('fulfilled');
    expect(vi.getTimerCount()).toBe(0);
  });
});
