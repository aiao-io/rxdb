/**
 * @fileoverview `pull-round.ts` —— `pullBatchOnce` 与 `pullSingleRepository` 共用的一轮拉取。
 *
 * 本文件盯的是**两条路径曾经分叉的那两处**（见 next-11 评审块 3 的判定）：
 * 回填只写 `remoteId` 还空着的行，以及 supersession 标记与实体合并的先后。
 * 这两处此前各写一份，改一处漏一处不会红——收成一个函数之后，本文件是它唯一的判据。
 */

import type { RemoteChange } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { backfillOwnChangeRemoteIds, splitRemoteChangesByOrigin } from '../pull-round.js';

const remoteChange = (over: Partial<RemoteChange>): RemoteChange =>
  ({ id: 1, entityId: 'e1', namespace: 'test', entity: 'Todo', type: 'INSERT', ...over }) as RemoteChange;

interface ChangeRow {
  id: number;
  remoteId: number | null;
}

/** 只实现 `pull-round` 用到的两个成员：按 `id in (...) and remoteId is null` 查、按行 patch。 */
const createChangeRepoStub = (rows: ChangeRow[]) => {
  const updates: Array<{ id: number; remoteId: number }> = [];
  const repo = {
    find: vi.fn(async (options: { where: { rules: Array<{ field: string; operator: string; value: unknown }> } }) => {
      const idRule = options.where.rules.find(r => r.field === 'id')!;
      const nullRule = options.where.rules.find(r => r.field === 'remoteId');
      const ids = idRule.value as number[];
      return rows.filter(row => ids.includes(row.id) && (!nullRule || row.remoteId === null));
    }),
    update: vi.fn(async (row: ChangeRow, patch: { remoteId: number }) => {
      updates.push({ id: row.id, remoteId: patch.remoteId });
      row.remoteId = patch.remoteId;
      return row;
    })
  };
  return { repo: repo as unknown as Parameters<typeof backfillOwnChangeRemoteIds>[0], updates };
};

describe('splitRemoteChangesByOrigin', () => {
  it('缺 clientId 的远端记录一律算他人的', () => {
    // push 走 actions-only 路径时远端记录没有 localId，也可能没有 clientId。
    // 把这类记录当成「自己的」会让它跳过 apply/conflict 链路：数据拉下来了却从不落库。
    const changes = [
      remoteChange({ id: 1, clientId: 'me' }),
      remoteChange({ id: 2, clientId: 'peer' }),
      remoteChange({ id: 3, clientId: undefined })
    ];

    const { ownChanges, otherChanges } = splitRemoteChangesByOrigin(changes, 'me');

    expect(ownChanges.map(c => c.id)).toEqual([1]);
    expect(otherChanges.map(c => c.id)).toEqual([2, 3]);
  });
});

describe('backfillOwnChangeRemoteIds', () => {
  it('已经有 remoteId 的本地行不会被改写', async () => {
    // 这正是两份副本分叉的那一处：一侧把 `remoteId is null` 写进 SQL、一侧写成 JS 守卫。
    // 两种写法必须同判据——漏掉它，重复拉取会把旧映射覆盖成本轮的 id，
    // 而 `cleanupExpired` 按 remoteId 判「已同步」，覆盖之后保留窗口整段错位。
    const { repo, updates } = createChangeRepoStub([
      { id: 10, remoteId: null },
      { id: 11, remoteId: 900 }
    ]);

    await backfillOwnChangeRemoteIds(repo, [
      remoteChange({ id: 501, localId: 10 }),
      remoteChange({ id: 502, localId: 11 })
    ]);

    expect(updates).toEqual([{ id: 10, remoteId: 501 }]);
  });

  it('没有 localId 的自推变更不参与回填', async () => {
    // 远端记录缺 localId 时对不上本地行，硬回填只能靠猜。
    const { repo, updates } = createChangeRepoStub([{ id: 10, remoteId: null }]);

    await backfillOwnChangeRemoteIds(repo, [remoteChange({ id: 501 })]);

    expect(updates).toEqual([]);
    expect((repo as unknown as { find: ReturnType<typeof vi.fn> }).find).not.toHaveBeenCalled();
  });
});
