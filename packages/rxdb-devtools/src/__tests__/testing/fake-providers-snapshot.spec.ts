import { describe, expect, it } from 'vitest';

import type {
  DevToolsProvider,
  DevToolsSnapshotCaptureResult,
  DevToolsSnapshotRecord,
  DevToolsSnapshotSource
} from '../../provider/types.js';
import type { DevToolsFakeClock } from '../../testing/fake-clock.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import { createFakeProviders } from '../../testing/fake-providers.js';
import { DEVTOOLS_MAX_SNAPSHOT_RECORDS, DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS } from '../../v2/constants.js';

/**
 * `files.list` 的快照模式在 fake provider 集合上的形态（US-905 阶段 1 的 fake 档装配面）。
 *
 * @remarks
 * fake 的 snapshot 与 native-files 必须走**同一份**分派（`provider/snapshot.ts` 的共享
 * 助手），因此这里验的是接缝接线：给了端口就走快照、没给就回 `provider_unsupported`、
 * 普通 `list` 不受影响。物化与分页的语义本身由 `v2/snapshot.spec.ts` 与
 * `native/native-files-snapshot.spec.ts` 覆盖，不在这里重复展开。
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
function pageOf(result: Awaited<ReturnType<DevToolsProvider['invoke']>>): SnapshotPage {
  if (result.outcome !== 'ok') throw new Error(`expected an ok snapshot page, got ${result.outcome}`);
  return result.result as SnapshotPage;
}

function setupWithSnapshot(source: DevToolsSnapshotSource): {
  clock: DevToolsFakeClock;
  files: DevToolsProvider;
} {
  const clock = createFakeClock();
  const set = createFakeProviders({ snapshot: { clock, source } });
  return { clock, files: set.provider('files') };
}

describe('fake providers — snapshot mode (US-905 fake 档)', () => {
  it('MUST materialize the first page through files.list', async () => {
    const { files } = setupWithSnapshot(captured(makeRecords(250)));

    const page = pageOf(await files.invoke('list', { snapshot: { pageSize: 100 } }));

    expect(page.offset).toBe(0);
    expect(page.complete).toBe(false);
    expect(page.records).toHaveLength(100);
    expect(page.records[0]).toEqual(['file', '/data/file-000000.bin', 'id-0', 0, 'v0']);
  });

  it('MUST page 1001 records to a complete tail without dropping or reordering', async () => {
    const { files } = setupWithSnapshot(captured(makeRecords(1001)));

    const first = pageOf(await files.invoke('list', { snapshot: {} }));
    const seen: DevToolsSnapshotRecord[] = [...first.records];
    let page = first;
    while (!page.complete) {
      const next = pageOf(
        await files.invoke('list', {
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
    const { files } = setupWithSnapshot(invalidated);

    expect(await files.invoke('list', { snapshot: {} })).toEqual({
      outcome: 'failed',
      error: { code: 'snapshot_busy', retryable: true }
    });
  });

  it('MUST surface snapshot_too_large instead of truncating', async () => {
    const { files } = setupWithSnapshot(captured(makeRecords(DEVTOOLS_MAX_SNAPSHOT_RECORDS + 1)));

    expect(await files.invoke('list', { snapshot: {} })).toEqual({
      outcome: 'failed',
      error: { code: 'snapshot_too_large', retryable: false }
    });
  });

  it('MUST surface snapshot_expired for a stale cursor after 60 s of inactivity', async () => {
    const { clock, files } = setupWithSnapshot(captured(makeRecords(150)));
    const first = pageOf(await files.invoke('list', { snapshot: {} }));

    clock.advance(DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS);
    expect(await files.invoke('list', { snapshot: { cursor: { snapshotId: first.snapshotId, offset: 100 } } })).toEqual(
      {
        outcome: 'failed',
        error: { code: 'snapshot_expired', retryable: false }
      }
    );
  });

  it('MUST answer provider_unsupported when no snapshot port was wired', async () => {
    const files = createFakeProviders().provider('files');

    expect(await files.invoke('list', { snapshot: {} })).toEqual({
      outcome: 'failed',
      error: { code: 'provider_unsupported', retryable: false }
    });
  });

  it('MUST reject a malformed snapshot spec with invalid_path before touching the store', async () => {
    const { files } = setupWithSnapshot(captured(makeRecords(1)));

    const malformed = [null, 'x', 3, { pageSize: '100' }, { cursor: 'x' }, { cursor: { snapshotId: 1, offset: 0 } }];
    for (const snapshot of malformed) {
      expect(await files.invoke('list', { snapshot })).toEqual({
        outcome: 'failed',
        error: { code: 'invalid_path', retryable: false }
      });
    }
  });

  it('MUST keep the plain file listing untouched when snapshot is absent', async () => {
    const { files } = setupWithSnapshot(captured(makeRecords(1)));

    const result = await files.invoke('list', {});

    expect(result).toEqual({
      outcome: 'ok',
      result: {
        entries: [
          { path: '/db.sqlite', size: 4_096 },
          { path: '/notes/a.md', size: 12 }
        ]
      }
    });
  });
});
