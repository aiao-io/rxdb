import { describe, expect, it } from 'vitest';

import { createDevToolsNativeFilesProvider } from '../../native/native-files-provider.js';
import type {
  DevToolsSnapshotCaptureResult,
  DevToolsSnapshotRecord,
  DevToolsSnapshotSource
} from '../../provider/types.js';
import type { DevToolsFakeClock } from '../../testing/fake-clock.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import { DEVTOOLS_MAX_SNAPSHOT_RECORDS, DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS } from '../../v2/constants.js';
import { createFakeNativeFilesystem } from './fake-native-filesystem.js';

/**
 * `files.list` 的快照模式（AC#48）——provider 侧的唯一新增面。
 *
 * @remarks
 * 快照物化、分页、deadline、busy/too-large/expired 全部由 {@link @aiao/rxdb-devtools!createDevToolsSnapshotStore}
 * 负责，已有 `v2/snapshot.spec.ts` 与 `native/native-snapshot-source.spec.ts` 覆盖。这里只验
 * provider 接缝自己负责的三件事：参数分派（`path` vs `snapshot`）、store 结果的翻译、
 * 以及「没接快照端口时回 `provider_unsupported` 而不是假装物化」。
 */

/** 造 `count` 条一侧记录；路径按下标零填充，方便断言排序与尾页。 */
function makeRecords(count: number, side: 'meta' | 'file' = 'file'): readonly DevToolsSnapshotRecord[] {
  return Array.from({ length: count }, (_, index): DevToolsSnapshotRecord => [
    side,
    `/data/file-${String(index).padStart(6, '0')}.bin`,
    `id-${index}`,
    index,
    `v${index}`
  ]);
}

/** 恒产出同一批记录的来源。 */
function captured(records: readonly DevToolsSnapshotRecord[]): DevToolsSnapshotSource {
  return { capture: (): Promise<DevToolsSnapshotCaptureResult> => Promise.resolve({ outcome: 'captured', records }) };
}

/** 恒报 epoch 失效的来源——重试用尽后 store 回 `snapshot_busy`。 */
const invalidated: DevToolsSnapshotSource = {
  capture: (): Promise<DevToolsSnapshotCaptureResult> => Promise.resolve({ outcome: 'invalidated' })
};

interface SnapshotPage {
  readonly snapshotId: string;
  readonly records: readonly DevToolsSnapshotRecord[];
  readonly offset: number;
  readonly complete: boolean;
}

/** 取出快照页；断言 `invoke('list', …)` 的 `ok` 分支确实是页而不是别的形状。 */
function pageOf(
  result: Awaited<ReturnType<ReturnType<typeof createDevToolsNativeFilesProvider>['invoke']>>
): SnapshotPage {
  if (result.outcome !== 'ok') throw new Error(`expected an ok snapshot page, got ${result.outcome}`);
  return result.result as SnapshotPage;
}

function setupWithSnapshot(source: DevToolsSnapshotSource): {
  clock: DevToolsFakeClock;
  provider: ReturnType<typeof createDevToolsNativeFilesProvider>;
} {
  const clock = createFakeClock();
  const filesystem = createFakeNativeFilesystem();
  const provider = createDevToolsNativeFilesProvider({
    filesystem,
    maxTransferBytes: 64,
    runtime: 'electron',
    snapshot: { clock, source }
  });
  return { clock, provider };
}

describe('native files provider — snapshot mode (AC#48)', () => {
  it('MUST materialize the first page through files.list', async () => {
    const { provider } = setupWithSnapshot(captured(makeRecords(250)));

    const page = pageOf(await provider.invoke('list', { snapshot: { pageSize: 100 } }));

    expect(page.offset).toBe(0);
    expect(page.complete).toBe(false);
    expect(page.records).toHaveLength(100);
    expect(page.records[0]).toEqual(['file', '/data/file-000000.bin', 'id-0', 0, 'v0']);
  });

  it('MUST page 1001 records to a complete tail without dropping or reordering', async () => {
    const { provider } = setupWithSnapshot(captured(makeRecords(1001)));

    const first = pageOf(await provider.invoke('list', { snapshot: {} }));
    const seen: DevToolsSnapshotRecord[] = [...first.records];
    let page = first;
    while (!page.complete) {
      const next = pageOf(
        await provider.invoke('list', {
          snapshot: { cursor: { snapshotId: first.snapshotId, offset: seen.length } }
        })
      );
      page = next;
      seen.push(...page.records);
    }

    expect(seen).toHaveLength(1001);
    expect(page.complete).toBe(true);
    expect(page.records).toHaveLength(1);
    expect(page.records[0]?.[1]).toBe('/data/file-001000.bin');
  });

  it('MUST surface snapshot_busy when the epoch keeps invalidating the capture', async () => {
    const { provider } = setupWithSnapshot(invalidated);

    expect(await provider.invoke('list', { snapshot: {} })).toEqual({
      outcome: 'failed',
      error: { code: 'snapshot_busy', retryable: true }
    });
  });

  it('MUST surface snapshot_too_large instead of truncating', async () => {
    const { provider } = setupWithSnapshot(captured(makeRecords(DEVTOOLS_MAX_SNAPSHOT_RECORDS + 1)));

    expect(await provider.invoke('list', { snapshot: {} })).toEqual({
      outcome: 'failed',
      error: { code: 'snapshot_too_large', retryable: false }
    });
  });

  it('MUST surface snapshot_expired for a stale cursor after 60 s of inactivity', async () => {
    const { clock, provider } = setupWithSnapshot(captured(makeRecords(150)));
    const first = pageOf(await provider.invoke('list', { snapshot: {} }));

    clock.advance(DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS);
    expect(
      await provider.invoke('list', { snapshot: { cursor: { snapshotId: first.snapshotId, offset: 100 } } })
    ).toEqual({
      outcome: 'failed',
      error: { code: 'snapshot_expired', retryable: false }
    });
  });

  it('MUST answer provider_unsupported when no snapshot port was wired', async () => {
    const provider = createDevToolsNativeFilesProvider({
      filesystem: createFakeNativeFilesystem(),
      maxTransferBytes: 64,
      runtime: 'electron'
    });

    expect(await provider.invoke('list', { snapshot: {} })).toEqual({
      outcome: 'failed',
      error: { code: 'provider_unsupported', retryable: false }
    });
  });

  it('MUST reject a malformed snapshot spec with invalid_path before touching the store', async () => {
    const { provider } = setupWithSnapshot(captured(makeRecords(1)));

    const malformed = [null, 'x', 3, { pageSize: '100' }, { cursor: 'x' }, { cursor: { snapshotId: 1, offset: 0 } }];
    for (const snapshot of malformed) {
      expect(await provider.invoke('list', { snapshot })).toEqual({
        outcome: 'failed',
        error: { code: 'invalid_path', retryable: false }
      });
    }
  });

  it('MUST keep the plain path listing untouched when snapshot is absent', async () => {
    const filesystem = createFakeNativeFilesystem();
    filesystem.seedFile(['top.sqlite'], 3);
    const provider = createDevToolsNativeFilesProvider({
      filesystem,
      maxTransferBytes: 64,
      runtime: 'electron',
      snapshot: { clock: createFakeClock(), source: captured(makeRecords(1)) }
    });

    const result = await provider.invoke('list', { path: '' });

    expect(result).toEqual({
      outcome: 'ok',
      result: {
        path: '',
        entries: [{ name: 'top.sqlite', kind: 'file', size: 3, lastModified: 1, path: 'top.sqlite' }]
      }
    });
  });

  it('MUST dispose idempotently and release the snapshot idle timer', async () => {
    const { clock, provider } = setupWithSnapshot(captured(makeRecords(150)));
    await provider.invoke('list', { snapshot: {} });

    provider.dispose();
    provider.dispose();
    expect(() => provider.dispose()).not.toThrow();
    expect(clock.pendingTimers()).toBe(0);
  });
});
