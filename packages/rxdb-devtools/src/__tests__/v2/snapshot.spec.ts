import { describe, expect, it } from 'vitest';

import type { DevToolsSnapshotCaptureResult, DevToolsSnapshotRecord, DevToolsSnapshotSource } from '../../provider/types.js';
import {
  createDevToolsSnapshotStore,
  snapshotRecordBytes,
  totalSnapshotBytes
} from '../../provider/snapshot.js';
import type { DevToolsSnapshotStore } from '../../provider/snapshot.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import type { DevToolsFakeClock } from '../../testing/fake-clock.js';
import {
  DEVTOOLS_DEFAULT_PAGE_SIZE,
  DEVTOOLS_MAX_PAGE_SIZE,
  DEVTOOLS_MAX_SNAPSHOT_BYTES,
  DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES,
  DEVTOOLS_MAX_SNAPSHOT_RECORDS,
  DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS,
  DEVTOOLS_SNAPSHOT_TIMEOUT_MS
} from '../../v2/constants.js';
import { isCanonicalUuidV4 } from '../../v2/ids.js';

/** 一次 capture 的应答方式；按调用次序取用，用尽后重复最后一个。 */
type Responder = (signal: AbortSignal) => Promise<DevToolsSnapshotCaptureResult>;

interface FakeSource {
  readonly source: DevToolsSnapshotSource;
  readonly signals: readonly AbortSignal[];
}

function fakeSource(...responders: readonly Responder[]): FakeSource {
  const signals: AbortSignal[] = [];
  let index = 0;
  return {
    signals,
    source: {
      capture: (signal: AbortSignal): Promise<DevToolsSnapshotCaptureResult> => {
        signals.push(signal);
        const responder = responders[Math.min(index, responders.length - 1)];
        index += 1;
        return responder(signal);
      }
    }
  };
}

function captured(records: readonly DevToolsSnapshotRecord[]): Responder {
  return () => Promise.resolve({ outcome: 'captured', records });
}

const invalidated: Responder = () => Promise.resolve({ outcome: 'invalidated' });

/** 永不结算——模拟一直等不到 storage 全局独占锁。 */
const waitingForLock: Responder = () => new Promise<DevToolsSnapshotCaptureResult>(() => undefined);

function makeRecords(count: number, side: 'meta' | 'file' = 'file'): readonly DevToolsSnapshotRecord[] {
  return Array.from({ length: count }, (_, index): DevToolsSnapshotRecord => [
    side,
    `/data/file-${index}.bin`,
    `id-${index}`,
    index,
    `v${index}`
  ]);
}

function setup(...responders: readonly Responder[]): {
  clock: DevToolsFakeClock;
  source: FakeSource;
  store: DevToolsSnapshotStore;
} {
  const clock = createFakeClock();
  const source = fakeSource(...responders);
  return { clock, source, store: createDevToolsSnapshotStore({ clock, source: source.source }) };
}

/** 取出一页，断言它确实是页而不是错误，并把它交回给调用方。 */
function expectPage(result: Awaited<ReturnType<DevToolsSnapshotStore['open']>>): {
  snapshotId: string;
  offset: number;
  records: readonly DevToolsSnapshotRecord[];
  complete: boolean;
} {
  if (result.outcome !== 'page') throw new Error(`expected a page, got ${result.outcome}`);
  return result.page;
}

describe('snapshot canonical accounting', () => {
  it('MUST size a record by its canonical JSON tuple, envelope excluded', () => {
    const record: DevToolsSnapshotRecord = ['meta', '/a', null, null, null];
    const encoded = JSON.stringify(record);

    expect(encoded).toBe('["meta","/a",null,null,null]');
    expect(snapshotRecordBytes(record)).toBe(new TextEncoder().encode(encoded).byteLength);
  });

  it('MUST count bytes, not UTF-16 code units', () => {
    // 「32 MiB」若按 `String.length` 计量，同一份数据在含非 ASCII 路径时各端算出不同的值。
    const record: DevToolsSnapshotRecord = ['file', '/数据/文件', null, null, null];

    expect(snapshotRecordBytes(record)).toBeGreaterThan(JSON.stringify(record).length);
  });

  it('MUST total a record set with the same helper', () => {
    const records = makeRecords(3);
    const expected = records.reduce((sum, record) => sum + snapshotRecordBytes(record), 0);

    expect(totalSnapshotBytes(records)).toBe(expected);
  });
});

describe('snapshot materialization and paging', () => {
  it('MUST page a fixture of 1001 records without dropping the tail', async () => {
    const { store } = setup(captured(makeRecords(1001)));
    const first = expectPage(await store.open());

    expect(first.records).toHaveLength(DEVTOOLS_DEFAULT_PAGE_SIZE);
    expect(first.offset).toBe(0);
    expect(first.complete).toBe(false);

    let offset = DEVTOOLS_DEFAULT_PAGE_SIZE;
    let seen = first.records.length;
    let page = first;
    while (!page.complete) {
      page = expectPage(store.page({ snapshotId: first.snapshotId, offset }));
      seen += page.records.length;
      offset += DEVTOOLS_DEFAULT_PAGE_SIZE;
    }

    // 尾页只有一条；只有它 `complete: true` 之后 panel 才能得出「两类缺失」的结论。
    expect(page.records).toHaveLength(1);
    expect(seen).toBe(1001);
  });

  it('MUST keep the capture order the source materialized', async () => {
    const records: readonly DevToolsSnapshotRecord[] = [
      ['meta', '/a', 'id-1', 1, 'v1'],
      ['file', '/a', 'id-1', 1, 'v1'],
      ['meta', '/b', 'id-2', null, null]
    ];
    const { store } = setup(captured(records));

    expect(expectPage(await store.open()).records).toEqual(records);
  });

  it('MUST mark an empty snapshot complete on its first page', async () => {
    const { store } = setup(captured([]));
    const page = expectPage(await store.open());

    expect(page.records).toEqual([]);
    expect(page.complete).toBe(true);
  });

  it('MUST honour an explicit page size', async () => {
    const { store } = setup(captured(makeRecords(5)));
    const first = expectPage(await store.open(2));

    expect(first.records).toHaveLength(2);
    expect(expectPage(store.page({ snapshotId: first.snapshotId, offset: 4 })).records).toHaveLength(1);
  });

  it('MUST reject a page size outside 1–500 before allocating anything', async () => {
    const { source, store } = setup(captured(makeRecords(1)));

    for (const pageSize of [0, -1, 1.5, Number.NaN, DEVTOOLS_MAX_PAGE_SIZE + 1]) {
      expect(await store.open(pageSize)).toEqual({
        outcome: 'rejected',
        error: { code: 'invalid_message', retryable: false }
      });
    }
    expect(source.signals).toHaveLength(0);
  });
});

describe('snapshot capacity', () => {
  it('MUST refuse a snapshot over the record cap instead of truncating', async () => {
    const { store } = setup(captured(makeRecords(DEVTOOLS_MAX_SNAPSHOT_RECORDS + 1, 'meta')));

    expect(await store.open()).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_too_large', retryable: false }
    });
  });

  it('MUST accept a snapshot exactly at the record cap', async () => {
    const { store } = setup(captured(makeRecords(DEVTOOLS_MAX_SNAPSHOT_RECORDS, 'meta')));
    const page = expectPage(await store.open());

    expect(page.offset).toBe(0);
    expect(page.complete).toBe(false);
  });

  it('MUST refuse a snapshot over the byte cap', async () => {
    // 单条超长记录即可越过 32 MiB，不必构造十万条。
    const huge: DevToolsSnapshotRecord = ['file', 'x'.repeat(DEVTOOLS_MAX_SNAPSHOT_BYTES + 1), null, null, null];
    const { store } = setup(captured([huge]));

    expect(await store.open()).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_too_large', retryable: false }
    });
  });

  it('MUST NOT leave a released snapshot readable after a capacity refusal', async () => {
    const { clock, store } = setup(captured(makeRecords(DEVTOOLS_MAX_SNAPSHOT_RECORDS + 1, 'meta')));
    await store.open();

    expect(store.active).toBe(false);
    // 越限不是「先物化再报错」：拒绝后不得留下任何计时器或已物化数据。
    expect(clock.pendingTimers()).toBe(0);
  });
});

describe('snapshot cursor binding', () => {
  it('MUST bind a cursor to its own snapshot id', async () => {
    const { store } = setup(captured(makeRecords(200)));
    const first = expectPage(await store.open());

    expect(store.page({ snapshotId: 'b3d9e7c1-4a52-4e08-8f6b-1c0d5a2739e4', offset: 100 })).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_expired', retryable: false }
    });
    expect(expectPage(store.page({ snapshotId: first.snapshotId, offset: 100 })).offset).toBe(100);
  });

  it('MUST reject an offset that is not a materialized page boundary', async () => {
    const { store } = setup(captured(makeRecords(200)));
    const first = expectPage(await store.open());

    for (const offset of [1, 99, 150, -1, 1.5]) {
      expect(store.page({ snapshotId: first.snapshotId, offset })).toEqual({
        outcome: 'rejected',
        error: { code: 'invalid_message', retryable: false }
      });
    }
  });

  it('MUST reject an offset past the end of the capture', async () => {
    const { store } = setup(captured(makeRecords(200)));
    const first = expectPage(await store.open());

    expect(store.page({ snapshotId: first.snapshotId, offset: 200 })).toEqual({
      outcome: 'rejected',
      error: { code: 'invalid_message', retryable: false }
    });
  });

  it('MUST release a cursor after 60 s of inactivity', async () => {
    const { clock, store } = setup(captured(makeRecords(200)));
    const first = expectPage(await store.open());

    clock.advance(DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS - 1);
    expect(expectPage(store.page({ snapshotId: first.snapshotId, offset: 100 })).offset).toBe(100);

    clock.advance(DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS);
    expect(store.page({ snapshotId: first.snapshotId, offset: 100 })).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_expired', retryable: false }
    });
    expect(store.active).toBe(false);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('MUST refresh the idle deadline on every delivered page', async () => {
    const { clock, store } = setup(captured(makeRecords(400)));
    const first = expectPage(await store.open());

    for (const offset of [100, 200, 300]) {
      clock.advance(DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS - 1);
      expect(expectPage(store.page({ snapshotId: first.snapshotId, offset })).offset).toBe(offset);
    }
    expect(store.active).toBe(true);
  });

  it('MUST NOT let a rejected page refresh the idle deadline', async () => {
    // 与 transfer 的 idle 闸同一条规则：被拒帧续命等于让非法请求把快照钉在内存里。
    const { clock, store } = setup(captured(makeRecords(400)));
    const first = expectPage(await store.open());

    clock.advance(DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS - 1);
    expect(store.page({ snapshotId: first.snapshotId, offset: 42 }).outcome).toBe('rejected');

    clock.advance(1);
    expect(store.page({ snapshotId: first.snapshotId, offset: 100 })).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_expired', retryable: false }
    });
  });
});

describe('snapshot epoch retries and deadline', () => {
  it('MUST restart from scratch under a new snapshot id when the epoch changes', async () => {
    const { source, store } = setup(invalidated, captured(makeRecords(3)));
    const page = expectPage(await store.open());

    expect(source.signals).toHaveLength(2);
    // 重试是「从头再来」而不是接着上一次：两个时点的数据绝不拼接。
    expect(page.records).toHaveLength(3);
    expect(page.complete).toBe(true);
  });

  it('MUST mint a fresh canonical id for the retried capture', async () => {
    const first = setup(captured(makeRecords(1)));
    const retried = setup(invalidated, captured(makeRecords(1)));

    const a = expectPage(await first.store.open());
    const b = expectPage(await retried.store.open());
    expect(isCanonicalUuidV4(b.snapshotId)).toBe(true);
    expect(b.snapshotId).not.toBe(a.snapshotId);
  });

  it('MUST give up with snapshot_busy once the retry budget is spent', async () => {
    const { source, store } = setup(invalidated);

    expect(await store.open()).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_busy', retryable: true }
    });
    // 首次尝试 + 3 次重试。
    expect(source.signals).toHaveLength(DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES + 1);
  });

  it('MUST end the request within 15 s of it passing the guard', async () => {
    const { clock, store } = setup(waitingForLock);
    const pending = store.open();

    clock.advance(DEVTOOLS_SNAPSHOT_TIMEOUT_MS);
    expect(await pending).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_busy', retryable: true }
    });
  });

  it('MUST measure the deadline across retries, not per attempt', async () => {
    // 每次重试各给 15 秒，等价于最长 60 秒——故事把 deadline 定为端到端。
    const clock = createFakeClock();
    const slowInvalidation: Responder = (): Promise<DevToolsSnapshotCaptureResult> =>
      new Promise(resolve => {
        clock.setTimeout(() => resolve({ outcome: 'invalidated' }), DEVTOOLS_SNAPSHOT_TIMEOUT_MS - 1);
      });
    const source = fakeSource(slowInvalidation);
    const store = createDevToolsSnapshotStore({ clock, source: source.source });

    const pending = store.open();
    clock.advance(DEVTOOLS_SNAPSHOT_TIMEOUT_MS);

    expect(await pending).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_busy', retryable: true }
    });
    expect(source.signals).toHaveLength(1);
  });

  it('MUST abort the source signal when the deadline expires', async () => {
    const { clock, source, store } = setup(waitingForLock);
    const pending = store.open();

    expect(source.signals[0]?.aborted).toBe(false);
    clock.advance(DEVTOOLS_SNAPSHOT_TIMEOUT_MS);
    await pending;
    expect(source.signals[0]?.aborted).toBe(true);
  });

  it('MUST abort waiting immediately on cancel', async () => {
    const { clock, source, store } = setup(waitingForLock);
    const pending = store.open();

    store.cancel();
    expect(await pending).toEqual({ outcome: 'cancelled' });
    expect(source.signals[0]?.aborted).toBe(true);
    // 取消后不留下 deadline 计时器。
    expect(clock.pendingTimers()).toBe(0);
  });

  it('MUST leave no active snapshot behind after a cancel', async () => {
    const { store } = setup(waitingForLock);
    const pending = store.open();
    store.cancel();
    await pending;

    expect(store.active).toBe(false);
  });

  it('MUST release the in-flight ledger when the source throws instead of returning', async () => {
    // 平台实现只要在等锁时抛一个 DOMException，就能让在途账本永远留在那里——
    // 此后每一次 open() 都答 snapshot_busy，而那份「忙」背后并没有任何在途工作，
    // 也没有任何东西会来解除它：整个 session 的快照能力就此报废。
    const boom: Responder = () => Promise.reject(new Error('lock manager exploded'));
    const { clock, store } = setup(boom, captured(makeRecords(1)));

    await expect(store.open()).rejects.toThrow('lock manager exploded');
    // 15 秒 deadline 也一并收回，否则它会在 15 秒后去中断一份早已不存在的物化。
    expect(clock.pendingTimers()).toBe(0);

    expect(expectPage(await store.open()).records).toHaveLength(1);
  });
});

describe('snapshot session ownership', () => {
  it('MUST allow only one active snapshot per session', async () => {
    const { store } = setup(captured(makeRecords(200)), captured(makeRecords(200)));
    const first = expectPage(await store.open());
    const second = expectPage(await store.open());

    expect(second.snapshotId).not.toBe(first.snapshotId);
    // 旧 cursor 的答案是过期，而不是悄悄读到新快照的数据。
    expect(store.page({ snapshotId: first.snapshotId, offset: 100 })).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_expired', retryable: false }
    });
  });

  it('MUST refuse a second capture while one is still materializing', async () => {
    const { store } = setup(waitingForLock);
    const pending = store.open();

    expect(await store.open()).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_busy', retryable: true }
    });

    store.cancel();
    await pending;
  });

  it('MUST answer snapshot_expired once released', async () => {
    const { clock, store } = setup(captured(makeRecords(200)));
    const first = expectPage(await store.open());

    store.release();
    expect(store.active).toBe(false);
    expect(clock.pendingTimers()).toBe(0);
    expect(store.page({ snapshotId: first.snapshotId, offset: 100 })).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_expired', retryable: false }
    });
  });

  it('MUST drop everything on dispose and refuse to open again', async () => {
    const { clock, store } = setup(captured(makeRecords(200)));
    await store.open();

    store.dispose();
    expect(clock.pendingTimers()).toBe(0);
    expect(await store.open()).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_expired', retryable: false }
    });
  });

  it('MUST be idempotent on release and dispose', async () => {
    const { store } = setup(captured(makeRecords(1)));
    await store.open();

    store.release();
    store.release();
    store.dispose();
    expect(() => store.dispose()).not.toThrow();
  });
});
