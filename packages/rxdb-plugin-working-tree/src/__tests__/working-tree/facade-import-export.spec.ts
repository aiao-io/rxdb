/**
 * @fileoverview US-316：门面上的 `importCommits()` / `exportCommits()`——受管事务、导入环境的接线、`commits$` 与损坏守卫。
 *
 * @remarks
 * 命令体本身的判定在 `import-commits.spec.ts` 与 `commit-graph-merge.spec.ts`，这里只守门面那一层：
 *
 * 1. **经 `runEnabled()` 进来**：未启用的库上两者都被拒（由 `facade-capability-gate.spec.ts` 枚举原型成员自动覆盖），
 *    启用之后在一笔受管事务里跑。
 * 2. **导入环境从宿主现取**：版本化域与捕获运行时同一个构造、同步配置取实例解析器——场景库是 `SyncType.None`，
 *    笔记实体不走推送，导入照常落库。
 * 3. **导入不经 `commits$` 发事件**：那条流的订阅者通常是上传逻辑，导入的提交本就来自服务端，再发一次就是回声。
 * 4. **导出先跑损坏守卫**：把一段自己都校验不过的历史传上服务端，等于把损坏复制到每一台导入它的设备上。
 */

import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { CommitChangeUnitContent } from '../../commit/change-unit.js';
import { computeCommitContentFingerprint } from '../../commit/change-unit.js';
import type { CommitExchangeRecord } from '../../commit/commit-exchange.js';
import { CommitGraphCorruptedError } from '../../commit/commit-graph-guard.js';
import { Commit } from '../../commit/commit.entity.js';
import type { WorkingTreeCommitEvent } from '../../working-tree/working-tree-commit-event.js';
import {
  createWorkingTreeScene,
  refRowOf,
  SCENE_BRANCH_ID,
  SceneNote,
  seedCommit,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

const NOTE = getEntityMetadata(SceneNote);

/** 一个插入单元。 */
const insertOf = (entityId: string): CommitChangeUnitContent => ({
  unitId: `unit-${entityId}`,
  transactionId: null,
  namespace: NOTE.namespace,
  entity: NOTE.name,
  entityId,
  operation: 'insert',
  patch: { title: entityId },
  inversePatch: null,
  origin: 'local'
});

/** 一条以 `parentId` 为父的远端普通提交。 */
const remoteCommit = (commitId: string, parentId: string): CommitExchangeRecord => {
  const units = [insertOf(`note-${commitId}`)];
  const base = {
    commitId,
    parentIds: [parentId],
    kind: 'normal' as const,
    message: `远端 ${commitId}`,
    authorId: 'server-alice',
    createdAt: new Date('2026-11-02T00:00:00.000Z'),
    units
  };
  return {
    ...base,
    contentFingerprint: computeCommitContentFingerprint({ ...base, author: base.authorId })
  };
};

/** 本地历史：系统根节点 `root` → `head`（当前头），工作树 clean。 */
const sceneAtHead = (): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: 'head', headRevision: 2 });
  seedCommit(scene, 'root', []);
  seedCommit(scene, 'head', ['root']);
  return scene;
};

const credentialsOf = (scene: WorkingTreeScene) => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision
});

describe('importCommits()：门面（US-316）', () => {
  it('在一笔受管事务里跑，导入环境从宿主现取：快进到批次的最后一个提交', async () => {
    const scene = sceneAtHead();
    const openTransaction = scene.adapter.transaction;

    const result = await scene.manager.importCommits([remoteCommit('r1', 'head')], credentialsOf(scene));

    expect(result).toEqual({ ok: true, headCommitId: 'r1', headRevision: 3, importedCount: 1, appliedCount: 1 });
    expect(openTransaction).toHaveBeenCalledTimes(1);
  });

  it('不经 commits$ 发事件：导入的提交本就来自服务端', async () => {
    const scene = sceneAtHead();
    const seen: WorkingTreeCommitEvent[] = [];
    scene.manager.commits$.subscribe(event => seen.push(event));

    await scene.manager.importCommits([remoteCommit('r1', 'head')], credentialsOf(scene));

    expect(seen).toEqual([]);
  });
});

describe('exportCommits()：门面（US-316）', () => {
  it('读当前 active 分支：某个提交之后的那一段，父先于子', async () => {
    const scene = sceneAtHead();

    const page = await scene.manager.exportCommits({ afterCommitId: 'root' });

    expect(page.branchId).toBe(SCENE_BRANCH_ID);
    expect(page.commits.map(record => record.commitId)).toEqual(['head']);
  });

  it('先跑损坏守卫：可达历史校验不过时抛 commit_graph_corrupted，不把损坏传上服务端', async () => {
    const scene = sceneAtHead();
    const head = (scene.probe.rowsOf(Commit) as Commit[]).find(commit => commit.id === 'head')!;
    head.message = '被外部改过的消息';

    await expect(scene.manager.exportCommits()).rejects.toBeInstanceOf(CommitGraphCorruptedError);
  });
});
