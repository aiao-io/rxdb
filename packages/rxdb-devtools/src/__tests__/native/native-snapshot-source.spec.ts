import { describe, expect, it } from 'vitest';

import type {
  DevToolsNativeSnapshotPorts,
  DevToolsSnapshotEntry,
  DevToolsSnapshotLock,
  DevToolsSnapshotLockResult
} from '../../native/native-snapshot-source.js';
import { createDevToolsNativeSnapshotSource } from '../../native/native-snapshot-source.js';
import type { DevToolsSnapshotStore } from '../../provider/snapshot.js';
import { createDevToolsSnapshotStore } from '../../provider/snapshot.js';
import type { DevToolsSnapshotCaptureResult, DevToolsSnapshotRecord } from '../../provider/types.js';
import type { DevToolsFakeClock } from '../../testing/fake-clock.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import {
  DEVTOOLS_DEFAULT_PAGE_SIZE,
  DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES,
  DEVTOOLS_MAX_SNAPSHOT_RECORDS,
  DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS,
  DEVTOOLS_SNAPSHOT_TIMEOUT_MS
} from '../../v2/constants.js';

/** 锁的应答方式。`held` 会真的执行 task，另两种不会。 */
type LockOutcome = 'held' | 'lost' | 'aborted';

interface FakeHost {
  readonly ports: DevToolsNativeSnapshotPorts;
  /** 端口调用的发生顺序；用来断言「读发生在锁内」而不只是「读发生过」。 */
  readonly trace: readonly string[];
  /** 锁内 task 执行期间为 true。 */
  heldDuring(): readonly boolean[];
}

interface HostOptions {
  readonly metadata?: readonly DevToolsSnapshotEntry[];
  readonly files?: readonly DevToolsSnapshotEntry[];
  /** 按调用次序取用的 epoch 值；用尽后重复最后一个。 */
  readonly epochs?: readonly string[];
  readonly lock?: LockOutcome;
}

function entry(
  logicalPath: string,
  id: string | null,
  size: number | null,
  version: string | null
): DevToolsSnapshotEntry {
  return { logicalPath, id, size, contentVersion: version };
}

function fakeHost(options: HostOptions = {}): FakeHost {
  const trace: string[] = [];
  const heldSamples: boolean[] = [];
  const epochs = options.epochs ?? ['e1'];
  const lockOutcome = options.lock ?? 'held';
  let epochIndex = 0;
  let held = false;

  const lock: DevToolsSnapshotLock = {
    async run<TValue>(_signal: AbortSignal, task: () => Promise<TValue>): Promise<DevToolsSnapshotLockResult<TValue>> {
      trace.push(`lock:${lockOutcome}`);
      if (lockOutcome !== 'held') return { outcome: lockOutcome };
      held = true;
      try {
        return { outcome: 'held', value: await task() };
      } finally {
        held = false;
      }
    }
  };

  const sample = (label: string): void => {
    trace.push(label);
    heldSamples.push(held);
  };

  return {
    trace,
    heldDuring: () => heldSamples,
    ports: {
      lock,
      epoch() {
        sample('epoch');
        const value = epochs[Math.min(epochIndex, epochs.length - 1)] ?? 'e1';
        epochIndex += 1;
        return Promise.resolve(value);
      },
      readMetadata() {
        sample('meta');
        return Promise.resolve(options.metadata ?? []);
      },
      readCommittedFiles() {
        sample('files');
        return Promise.resolve(options.files ?? []);
      }
    }
  };
}

function capture(options: HostOptions = {}): Promise<DevToolsSnapshotCaptureResult> {
  return createDevToolsNativeSnapshotSource(fakeHost(options).ports).capture(new AbortController().signal);
}

/** 取出 `captured` 的记录，顺带断言结果不是失效。 */
function recordsOf(result: DevToolsSnapshotCaptureResult): readonly DevToolsSnapshotRecord[] {
  if (result.outcome !== 'captured') throw new Error(`expected a captured snapshot, got ${result.outcome}`);
  return result.records;
}

describe('native snapshot source — 同一时点', () => {
  it('MUST read both sides inside the exclusive lock', async () => {
    const host = fakeHost({ metadata: [entry('/a', 'id-a', 1, 'v1')] });

    await createDevToolsNativeSnapshotSource(host.ports).capture(new AbortController().signal);

    // epoch 在两侧读取的**前后**各一次，四次调用全在锁内：只在开头读一次等于假设
    // 「拿到锁 = 没人改过」，而锁归属可能在物化中途丢失。
    expect(host.trace).toEqual(['lock:held', 'epoch', 'meta', 'files', 'epoch']);
    expect(host.heldDuring()).toEqual([true, true, true, true]);
  });

  it('MUST invalidate when the epoch changed between the two reads', async () => {
    expect(await capture({ epochs: ['e1', 'e2'], metadata: [entry('/a', 'id-a', 1, 'v1')] })).toEqual({
      outcome: 'invalidated'
    });
  });

  it('MUST invalidate when the lock was lost', async () => {
    expect(await capture({ lock: 'lost' })).toEqual({ outcome: 'invalidated' });
  });

  it('MUST invalidate when waiting for the lock was aborted', async () => {
    expect(await capture({ lock: 'aborted' })).toEqual({ outcome: 'invalidated' });
  });

  it('MUST NOT touch the host when the signal is already aborted', async () => {
    const host = fakeHost({ metadata: [entry('/a', 'id-a', 1, 'v1')] });

    const result = await createDevToolsNativeSnapshotSource(host.ports).capture(AbortSignal.abort());

    expect(result).toEqual({ outcome: 'invalidated' });
    // 一次注定要被丢弃的物化不该先去抢 storage 的全局独占锁。
    expect(host.trace).toEqual([]);
  });
});

describe('native snapshot source — 记录', () => {
  it('MUST emit both sides as canonical tuples', async () => {
    const records = recordsOf(
      await capture({
        metadata: [entry('/db/main', 'id-1', 12, 'v1')],
        files: [entry('/db/main', 'id-1', 12, 'v1')]
      })
    );

    expect(records).toEqual([
      ['file', '/db/main', 'id-1', 12, 'v1'],
      ['meta', '/db/main', 'id-1', 12, 'v1']
    ]);
  });

  it('MUST order by logicalPath, then id, then side', async () => {
    const records = recordsOf(
      await capture({
        metadata: [entry('/b', 'id-2', null, null), entry('/a', 'id-9', null, null), entry('/a', null, null, null)],
        files: [entry('/a', 'id-9', 4, 'v9')]
      })
    );

    // `side` 是第三键而不是装饰：同一路径同一 ID 的 meta 与 file 在前两键上完全相等，
    // 只用两键时它们的先后取决于 sort 的实现细节，而快照要在三端逐字节对齐。
    expect(records.map(record => [record[0], record[1], record[2]])).toEqual([
      ['meta', '/a', null],
      ['file', '/a', 'id-9'],
      ['meta', '/a', 'id-9'],
      ['meta', '/b', 'id-2']
    ]);
  });

  it('MUST preserve both kinds of missing', async () => {
    const records = recordsOf(
      await capture({
        metadata: [entry('/orphan-meta', 'id-1', 3, 'v1')],
        files: [entry('/orphan-file', 'id-2', 5, 'v2')]
      })
    );

    // 单边条目正是面板要报的两类缺失；来源不得为了「对齐」把它们补齐或丢弃。
    expect(records).toEqual([
      ['file', '/orphan-file', 'id-2', 5, 'v2'],
      ['meta', '/orphan-meta', 'id-1', 3, 'v1']
    ]);
  });

  it('MUST NOT report an in-flight upload as a file', async () => {
    // 宿主的 `readCommittedFiles` 不吐临时产物。若来源改读原始目录，这条在途上传会
    // 变成一条「有文件无元数据」的假缺失，而它下一秒就自己消失了。
    const records = recordsOf(
      await capture({
        metadata: [entry('/db/main', 'id-1', 12, 'v1')],
        files: [entry('/db/main', 'id-1', 12, 'v1')]
      })
    );

    expect(records.map(record => record[1])).toEqual(['/db/main', '/db/main']);
  });

  it('MUST capture an empty host as an empty snapshot, not as invalidated', async () => {
    expect(await capture()).toEqual({ outcome: 'captured', records: [] });
  });
});

/** 造 `count` 条一侧条目，路径按下标零填充以便断言排序结果。 */
function manyEntries(count: number, prefix: string): readonly DevToolsSnapshotEntry[] {
  return Array.from({ length: count }, (_, index) =>
    entry(`${prefix}/${String(index).padStart(6, '0')}`, `id-${index}`, index, `v${index}`)
  );
}

function storeOver(options: HostOptions): { clock: DevToolsFakeClock; host: FakeHost; store: DevToolsSnapshotStore } {
  const clock = createFakeClock();
  const host = fakeHost(options);
  return {
    clock,
    host,
    store: createDevToolsSnapshotStore({ clock, source: createDevToolsNativeSnapshotSource(host.ports) })
  };
}

describe('native snapshot source — 经仓库读取完整诊断 snapshot（AC#48）', () => {
  it('MUST page 1201 records to a complete tail without dropping or reordering', async () => {
    const { store } = storeOver({ metadata: manyEntries(600, '/meta'), files: manyEntries(601, '/file') });

    const first = await store.open();
    if (first.outcome !== 'page') throw new Error(`expected a page, got ${first.outcome}`);

    const seen: DevToolsSnapshotRecord[] = [...first.page.records];
    let page = first.page;
    while (!page.complete) {
      const next = store.page({ snapshotId: first.page.snapshotId, offset: seen.length });
      if (next.outcome !== 'page') throw new Error(`expected a page, got ${next.outcome}`);
      page = next.page;
      seen.push(...page.records);
    }

    expect(seen).toHaveLength(1201);
    expect(page.records).toHaveLength(1201 % DEVTOOLS_DEFAULT_PAGE_SIZE);
    // 只有尾页的 `complete: true` 才授权面板下「两类缺失」的结论，所以尾页必须真的是最后一条。
    expect(seen.at(-1)?.[1]).toBe('/meta/000599');
    expect(seen.map(record => record[1])).toEqual([...seen].map(record => record[1]).sort());
  });

  it('MUST reject with snapshot_too_large instead of truncating', async () => {
    const half = Math.ceil((DEVTOOLS_MAX_SNAPSHOT_RECORDS + 1) / 2);
    const { store } = storeOver({ metadata: manyEntries(half, '/meta'), files: manyEntries(half, '/file') });

    const result = await store.open();

    expect(result).toEqual({ outcome: 'rejected', error: { code: 'snapshot_too_large', retryable: false } });
  });

  it('MUST reject with snapshot_busy when the epoch keeps moving', async () => {
    // 每次 capture 消耗两个 epoch，且两两不同：每一轮都失效，重试用尽后是「忙」而不是半份数据。
    const epochs = Array.from({ length: (DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES + 1) * 2 }, (_, index) => `e${index}`);
    const { store, host } = storeOver({ epochs, metadata: [entry('/a', 'id-a', 1, 'v1')] });

    const result = await store.open();

    expect(result).toEqual({ outcome: 'rejected', error: { code: 'snapshot_busy', retryable: true } });
    expect(host.trace.filter(step => step.startsWith('lock:'))).toHaveLength(DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES + 1);
  });

  it('MUST reject with snapshot_busy when the shared deadline elapses while waiting for the lock', async () => {
    const clock = createFakeClock();
    const source = { capture: (): Promise<DevToolsSnapshotCaptureResult> => new Promise(() => undefined) };
    const store = createDevToolsSnapshotStore({ clock, source });

    const pending = store.open();
    clock.advance(DEVTOOLS_SNAPSHOT_TIMEOUT_MS);

    expect(await pending).toEqual({ outcome: 'rejected', error: { code: 'snapshot_busy', retryable: true } });
  });

  it('MUST reject a stale cursor with snapshot_expired', async () => {
    const { clock, store } = storeOver({ metadata: manyEntries(150, '/meta') });

    const first = await store.open();
    if (first.outcome !== 'page') throw new Error(`expected a page, got ${first.outcome}`);
    clock.advance(DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS);

    expect(store.page({ snapshotId: first.page.snapshotId, offset: DEVTOOLS_DEFAULT_PAGE_SIZE })).toEqual({
      outcome: 'rejected',
      error: { code: 'snapshot_expired', retryable: false }
    });
  });
});
