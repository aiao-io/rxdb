/**
 * @fileoverview US-317 红测试：`restore()` 把所选提交的数据写进业务表，差异计为未提交改动。
 *
 * @remarks
 * 实现目标是 `src/working-tree/restore-command.ts` 的物化与回写两段。
 *
 * v1 的 restore 只写条目与会话：条目是目标节点**自己**的变更单元，业务表一行都不动。两件事因此一起错：
 * 列表读到的仍是 HEAD 的数据，而工作树里那批条目既不是「HEAD → 目标」的差异（`inversePatch` 也不是
 * HEAD 上的值），也重放不回目标的状态——恢复到 `HEAD~2` 时，`HEAD~1` 改过的行根本不在里面。
 *
 * 这一组钉的是新语义的四件事：
 *
 * 1. **条目就是差异。** 从 HEAD 沿重放路径逐个撤销路径上的单元，把每一次撤销当成一次手写编辑，按捕获
 *    同一份折叠规则（`foldWorkingTreeEntry`）折起来：`patch` 是目标上的值，`inversePatch` 是 HEAD 上的值，
 *    插入 / 删除按「这一行在 HEAD 与目标两端各在不在」判。`HEAD + 条目 = 目标`，冷重放因此成立。
 * 2. **业务表回写的就是这同一份差异。** 回写的增删改由条目推出来，不另算一遍——两份各算的话，
 *    迟早在「改过又改回」「删了又重建」这种边角上一份对、一份错，而 discard 读的是条目那一份。
 * 3. **完整差异为空就是 no-op。** 路径上改过又改回的字段、新建又删掉的行都不算差异；簿记字段
 *    （`remoteId` / 审计时间）不进版本控制，也不算。US-307 US1-AC7 的「物化内容与 HEAD 完全相同」由此成立。
 * 4. **回写是登记表 #14 那一次受信写**：执行器上的 `mergeChanges`，入口是投影重写（回写不再被捕获成单元），
 *    触发器照开（回写进变更日志，切分支、同步与撤销栈才和业务表一致），排在 CAS 之后、落条目之前。
 */

import type { SwitchVersionActions, SwitchVersionChange } from '@aiao/rxdb';
import { getEntityMetadata, parseRxDBChangeKey, takeDeclaredWrite } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { CommitChangeUnit, CommitChangeUnitContent } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../commit/change-unit.js';
import { fingerprintOf } from '../../working-tree/capture-runtime.js';
import {
  restoreWorkingTree,
  type WorkingTreeRestoreOptions,
  type WorkingTreeRestoreResult,
  type WorkingTreeRestoreTarget
} from '../../working-tree/restore-command.js';
import { WorkingTreeRestoreSession } from '../../working-tree/working-tree-restore-session.entity.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  SCENE_SECRET,
  SceneNote,
  seedCommit,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 场景里的笔记实体身份；单元与条目都指向它。 */
const NOTE = getEntityMetadata(SceneNote);

/** 一个单元里由用例给的那几列；身份默认指向 {@link NOTE}。 */
type UnitSeed = Pick<CommitChangeUnitContent, 'entityId' | 'operation' | 'patch' | 'inversePatch'> &
  Partial<Pick<CommitChangeUnitContent, 'namespace' | 'entity'>>;

/** 一个历史节点：id、父节点与它自己的单元（一个提交里每个身份至多一条，与 `commit()` 的产物同形）。 */
interface CommitSeed {
  readonly id: string;
  readonly parentIds: readonly string[];
  readonly units: readonly UnitSeed[];
}

/** 把一条单元补齐成自洽的落库形态；指纹由写路径同一个函数算，图守卫才认。 */
const unitOf = (commitId: string, index: number, seed: UnitSeed): CommitChangeUnit => {
  const base: Omit<CommitChangeUnit, 'fingerprint'> = {
    unitId: `${commitId}-unit-${index}`,
    transactionId: null,
    namespace: NOTE.namespace,
    entity: NOTE.name,
    origin: 'local',
    baseFingerprint: null,
    ...seed
  };
  return { ...base, fingerprint: computeChangeUnitFingerprint(base) };
};

/**
 * 铺一段历史，HEAD 停在最后一个节点上，工作树 clean。
 *
 * @remarks
 * 业务表在这个替身里不存在——它只记下交给 `mergeChanges` 的那份回写。业务表真的变成目标那样，
 * 由一致性套件在六个后端上证（`worktree.suite.ts`「放弃与恢复回写业务表」）。
 */
const sceneWithHistory = (commits: readonly CommitSeed[], rowsAffected = 1): WorkingTreeScene => {
  const head = commits[commits.length - 1];
  const scene = createWorkingTreeScene({ headCommitId: head.id, headRevision: commits.length, rowsAffected });
  for (const commit of commits) {
    seedCommit(
      scene,
      commit.id,
      commit.parentIds,
      commit.units.map((unit, index) => unitOf(commit.id, index, unit))
    );
  }
  return scene;
};

/** 与场景初值完全对得上的一组捕获型凭据。 */
const credentialsOf = (scene: WorkingTreeScene): WorkingTreeRestoreOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision
});

/** 跑一次恢复。 */
const restoreOnce = (scene: WorkingTreeScene, target: WorkingTreeRestoreTarget): Promise<WorkingTreeRestoreResult> =>
  restoreWorkingTree(scene.probe.executor, scene.context, target, credentialsOf(scene));

/** 取成功出口。 */
const expectOk = (result: WorkingTreeRestoreResult): Extract<WorkingTreeRestoreResult, { ok: true }> => {
  if (!result.ok) throw new Error(`期望这次恢复成功，实际拿到：${JSON.stringify(result)}`);
  return result;
};

/** 一个桶按身份摊开成 `namespace:entity:entityId` → 两份补丁。 */
const bucketOf = (bucket: ReadonlyMap<string, SwitchVersionChange>): Record<string, unknown> =>
  Object.fromEntries(
    [...bucket].map(([key, change]) => {
      const [namespace, entity, entityId] = parseRxDBChangeKey(key);
      return [`${namespace}:${entity}:${String(entityId)}`, { patch: change.patch, inversePatch: change.inversePatch }];
    })
  );

/** 三个桶一起摊开。 */
const actionsShapeOf = (actions: SwitchVersionActions): Record<string, unknown> => ({
  deletes: bucketOf(actions.deletes),
  updates: bucketOf(actions.updates),
  inserts: bucketOf(actions.inserts)
});

/** 那次回写交给 `mergeChanges` 的三个实参；要求恰好调了一次。 */
const rewriteCallOf = (scene: WorkingTreeScene): Parameters<WorkingTreeScene['probe']['executor']['mergeChanges']> => {
  const calls = vi.mocked(scene.probe.executor.mergeChanges).mock.calls;
  expect(calls, '回写应当恰好一次 mergeChanges').toHaveLength(1);
  return calls[0];
};

/** 工作树里的条目按身份摊开：操作与两份补丁；断言的是「差异」本身，不是条目的诊断列。 */
const entriesShapeOf = (scene: WorkingTreeScene): Record<string, unknown> =>
  Object.fromEntries(
    entryRowsOf(scene).map(entry => [
      `${entry.namespace}:${entry.entity}:${entry.entityId}`,
      { operation: entry.operation, patch: entry.patch, inversePatch: entry.inversePatch }
    ])
  );

/** 基线 → C1 → C2（HEAD）：三种操作、两个实体、一行始终没动。 */
const BASELINE = 'commit-baseline';
const C1 = 'commit-1';
const C2 = 'commit-2';

const crossEntityHistory = (): readonly CommitSeed[] => [
  {
    id: BASELINE,
    parentIds: [],
    units: [
      { entityId: 'note-a', operation: 'insert', patch: { title: 'A0' }, inversePatch: null },
      { entityId: 'note-b', operation: 'insert', patch: { title: 'B0' }, inversePatch: null },
      { entityId: 'note-keep', operation: 'insert', patch: { title: 'K0' }, inversePatch: null }
    ]
  },
  {
    id: C1,
    parentIds: [BASELINE],
    units: [
      { entityId: 'note-a', operation: 'update', patch: { title: 'A1' }, inversePatch: { title: 'A0' } },
      { entityId: 'note-b', operation: 'delete', patch: null, inversePatch: { title: 'B0' } },
      { entityId: 'note-c', operation: 'insert', patch: { title: 'C1' }, inversePatch: null }
    ]
  },
  {
    id: C2,
    parentIds: [C1],
    units: [
      { entityId: 'note-a', operation: 'update', patch: { title: 'A2' }, inversePatch: { title: 'A1' } },
      { entityId: 'note-d', operation: 'insert', patch: { title: 'D2' }, inversePatch: null },
      {
        namespace: SCENE_SECRET.namespace,
        entity: SCENE_SECRET.name,
        entityId: 'secret-1',
        operation: 'update',
        patch: { label: 'L2', secret: 'enc:v1:two' },
        inversePatch: { label: 'L0', secret: 'enc:v1:zero' }
      }
    ]
  }
];

describe('条目就是 HEAD → 目标的差异（US-317 AC3）', () => {
  it('跨实体的插入、修改与删除：inversePatch 是 HEAD 上的值，始终没动的行不留条目', async () => {
    const scene = sceneWithHistory(crossEntityHistory());

    const result = expectOk(await restoreOnce(scene, { commitId: BASELINE }));

    // note-a 改过两次：patch 取目标上的 A0，inversePatch 取 HEAD 上的 A2——取成中间态 A1 的话，
    // 恢复之后再 discard 只能退回 A1，退不回 HEAD。note-b 在目标上有、HEAD 上没有，是插入；
    // note-c / note-d 反过来是删除，inversePatch 是 HEAD 上的整行。
    expect(entriesShapeOf(scene)).toEqual({
      'app:Note:note-a': { operation: 'update', patch: { title: 'A0' }, inversePatch: { title: 'A2' } },
      'app:Note:note-b': { operation: 'insert', patch: { title: 'B0' }, inversePatch: null },
      'app:Note:note-c': { operation: 'delete', patch: null, inversePatch: { title: 'C1' } },
      'app:Note:note-d': { operation: 'delete', patch: null, inversePatch: { title: 'D2' } },
      'app:Secret:secret-1': {
        operation: 'update',
        patch: { label: 'L0', secret: 'enc:v1:zero' },
        inversePatch: { label: 'L2', secret: 'enc:v1:two' }
      }
    });
    expect({ restored: result.restoredCount, entryCount: stateRowOf(scene).entryCount }).toEqual({
      restored: 5,
      entryCount: 5
    });
  });

  it('条目的指纹与手写条目同一个算法、算在落库的那份 patch 上', async () => {
    const scene = sceneWithHistory(crossEntityHistory());

    await restoreOnce(scene, { commitId: BASELINE });

    // 指纹算错不会有任何症状——今天没有生产代码比较它；口径一旦分叉，将来第一个比较它的消费者
    // 会看到恢复出来的条目与同内容的手写条目「不相等」。
    const mismatched = entryRowsOf(scene).filter(
      entry => entry.fingerprint !== fingerprintOf(entry.operation, entry.patch)
    );
    expect(mismatched).toEqual([]);
  });
});

describe('业务表回写的就是这同一份差异（US-317 AC3）', () => {
  it('一次 mergeChanges：把条目叠到 HEAD 上，触发器照开', async () => {
    const scene = sceneWithHistory(crossEntityHistory());

    expectOk(await restoreOnce(scene, { commitId: BASELINE }));
    const [actions, localChanges, disableTriggers] = rewriteCallOf(scene);

    // restore 要求 clean 工作树，此刻业务表等于 HEAD；叠上差异之后就是目标的数据。
    expect(actionsShapeOf(actions)).toEqual({
      deletes: {
        'app:Note:note-c': { patch: null, inversePatch: { title: 'C1' } },
        'app:Note:note-d': { patch: null, inversePatch: { title: 'D2' } }
      },
      updates: {
        'app:Note:note-a': { patch: { title: 'A0' }, inversePatch: { title: 'A2' } },
        'app:Secret:secret-1': {
          patch: { label: 'L0', secret: 'enc:v1:zero' },
          inversePatch: { label: 'L2', secret: 'enc:v1:two' }
        }
      },
      inserts: { 'app:Note:note-b': { patch: { title: 'B0' }, inversePatch: null } }
    });
    // 触发器开着：恢复是当前分支上的一次新写入，日志里要有它，切走再切回来才不会被撤回 HEAD 的样子。
    expect({ localChanges, disableTriggers }).toEqual({ localChanges: undefined, disableTriggers: false });
  });

  it('声明在 mergeChanges 被调到的那一刻挂在执行器上：登记表 #14，入口是投影重写', async () => {
    const scene = sceneWithHistory(crossEntityHistory());
    const executor = scene.probe.executor;
    let declared: ReturnType<typeof takeDeclaredWrite>;
    vi.mocked(executor.mergeChanges).mockImplementation(async () => {
      declared = takeDeclaredWrite(executor);
    });

    expectOk(await restoreOnce(scene, { commitId: BASELINE }));

    // 投影重写：条目由命令自己写；回写若被挂载点 2 按领域重算捕获，同一批差异会在工作树里出现两份。
    expect(declared).toEqual({
      file: 'restore-command.ts',
      symbol: 'rewriteProjectionToTarget',
      intent: 'working_tree_projection',
      entrance: 'projection_rewrite'
    });
  });

  it('先打 CAS，命中之后回写业务表，再落条目与会话', async () => {
    const scene = sceneWithHistory(crossEntityHistory());

    expectOk(await restoreOnce(scene, { commitId: BASELINE }));

    // CAS 排第一：没命中时一个字节都不该落，包括业务表。
    const writes = scene.probe.trace.filter(step => ['query', 'mergeChanges', 'saveMany'].includes(step));
    expect(writes).toEqual(['query', 'mergeChanges', 'saveMany', 'saveMany']);
  });

  it('CAS 没命中：业务表一行都不回写，条目与会话也不落', async () => {
    const scene = sceneWithHistory(crossEntityHistory(), 0);

    const result = await restoreOnce(scene, { commitId: BASELINE });

    expect(result).toMatchObject({ ok: false, reason: 'conflict' });
    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
    expect({
      entries: entryRowsOf(scene).length,
      sessions: scene.probe.rowsOf(WorkingTreeRestoreSession).length
    }).toEqual({ entries: 0, sessions: 0 });
  });

  it('回写抛错原样上抛，条目与会话都没落（AC4 的命令侧半边）', async () => {
    const scene = sceneWithHistory(crossEntityHistory());
    const injected = new Error('注入：回写失败');
    vi.mocked(scene.probe.executor.mergeChanges).mockRejectedValueOnce(injected);

    const error = await restoreOnce(scene, { commitId: BASELINE }).then(
      () => null,
      (caught: unknown) => caught
    );

    // CAS 那条 UPDATE 已经发了，撤回它靠调用方的事务——真实后端上的整笔回滚由一致性套件在六个后端上证。
    // 这里证的是命令没吞掉错误、也没在失败之后接着落条目与会话。
    expect(error).toBe(injected);
    expect({
      entries: entryRowsOf(scene).length,
      sessions: scene.probe.rowsOf(WorkingTreeRestoreSession).length
    }).toEqual({ entries: 0, sessions: 0 });
  });
});

describe('完整差异为空就是 no-op（FR-042、US-307 US1-AC7）', () => {
  it('路径上改过又改回的行：两端相同，一条条目都不留、业务表一行都不写', async () => {
    const scene = sceneWithHistory([
      {
        id: BASELINE,
        parentIds: [],
        units: [{ entityId: 'note-a', operation: 'insert', patch: { title: 'A0' }, inversePatch: null }]
      },
      {
        id: C1,
        parentIds: [BASELINE],
        units: [{ entityId: 'note-a', operation: 'update', patch: { title: 'A1' }, inversePatch: { title: 'A0' } }]
      },
      {
        id: C2,
        parentIds: [C1],
        units: [{ entityId: 'note-a', operation: 'update', patch: { title: 'A0' }, inversePatch: { title: 'A1' } }]
      }
    ]);
    const revisionBefore = stateRowOf(scene).workingTreeRevision;

    const result = expectOk(await restoreOnce(scene, { commitId: BASELINE }));

    // 不做值级归零的话，这里会落一条 patch 与 inversePatch 相等的 update 条目：status() 报脏，
    // diff 里一条「没改」的改动，而用户唯一能做的是 commit 一个什么都没变的提交。
    expect(result).toEqual({ ok: true, restoredCount: 0, sessionId: null, workingTreeRevision: revisionBefore });
    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
    expect(scene.probe.rowsOf(WorkingTreeRestoreSession)).toEqual([]);
  });

  it('同一行只有一部分字段改回去：差异只带两端取值不同的那几列', async () => {
    const scene = sceneWithHistory([
      {
        id: BASELINE,
        parentIds: [],
        units: [
          {
            namespace: SCENE_SECRET.namespace,
            entity: SCENE_SECRET.name,
            entityId: 'secret-1',
            operation: 'insert',
            patch: { label: 'L0', secret: 'enc:v1:zero' },
            inversePatch: null
          }
        ]
      },
      {
        id: C1,
        parentIds: [BASELINE],
        units: [
          {
            namespace: SCENE_SECRET.namespace,
            entity: SCENE_SECRET.name,
            entityId: 'secret-1',
            operation: 'update',
            patch: { label: 'L1', secret: 'enc:v1:one' },
            inversePatch: { label: 'L0', secret: 'enc:v1:zero' }
          }
        ]
      },
      {
        id: C2,
        parentIds: [C1],
        units: [
          {
            namespace: SCENE_SECRET.namespace,
            entity: SCENE_SECRET.name,
            entityId: 'secret-1',
            operation: 'update',
            patch: { label: 'L0' },
            inversePatch: { label: 'L1' }
          }
        ]
      }
    ]);

    expectOk(await restoreOnce(scene, { commitId: BASELINE }));

    expect(entriesShapeOf(scene)).toEqual({
      'app:Secret:secret-1': {
        operation: 'update',
        patch: { secret: 'enc:v1:zero' },
        inversePatch: { secret: 'enc:v1:one' }
      }
    });
  });

  it('目标之后新建又删掉的行：两端都不存在，不留条目也不回写', async () => {
    const scene = sceneWithHistory([
      {
        id: BASELINE,
        parentIds: [],
        units: [{ entityId: 'note-a', operation: 'insert', patch: { title: 'A0' }, inversePatch: null }]
      },
      {
        id: C1,
        parentIds: [BASELINE],
        units: [{ entityId: 'note-tmp', operation: 'insert', patch: { title: '临时' }, inversePatch: null }]
      },
      {
        id: C2,
        parentIds: [C1],
        units: [{ entityId: 'note-tmp', operation: 'delete', patch: null, inversePatch: { title: '临时' } }]
      }
    ]);

    const result = expectOk(await restoreOnce(scene, { commitId: BASELINE }));

    // 只看最后一步的话这是「把删掉的行插回去」；可目标上这一行压根不存在，插回去就是凭空多一行。
    expect(result.restoredCount).toBe(0);
    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
  });

  it('目标之后删掉又重建的行：两端都存在，计为修改，只带取值不同的字段', async () => {
    const scene = sceneWithHistory([
      {
        id: BASELINE,
        parentIds: [],
        units: [
          {
            namespace: SCENE_SECRET.namespace,
            entity: SCENE_SECRET.name,
            entityId: 'secret-1',
            operation: 'insert',
            patch: { label: 'L0', secret: 'enc:v1:zero' },
            inversePatch: null
          }
        ]
      },
      {
        id: C1,
        parentIds: [BASELINE],
        units: [
          {
            namespace: SCENE_SECRET.namespace,
            entity: SCENE_SECRET.name,
            entityId: 'secret-1',
            operation: 'delete',
            patch: null,
            inversePatch: { label: 'L0', secret: 'enc:v1:zero' }
          }
        ]
      },
      {
        id: C2,
        parentIds: [C1],
        units: [
          {
            namespace: SCENE_SECRET.namespace,
            entity: SCENE_SECRET.name,
            entityId: 'secret-1',
            operation: 'insert',
            patch: { label: 'L0', secret: 'enc:v1:two' },
            inversePatch: null
          }
        ]
      }
    ]);

    expectOk(await restoreOnce(scene, { commitId: BASELINE }));
    const [actions] = rewriteCallOf(scene);

    // 记成插入的话，适配器会拿一整行去 INSERT OR REPLACE 一行本来就在的数据；记成删除更糟。
    expect(entriesShapeOf(scene)).toEqual({
      'app:Secret:secret-1': {
        operation: 'update',
        patch: { secret: 'enc:v1:zero' },
        inversePatch: { secret: 'enc:v1:two' }
      }
    });
    expect(actionsShapeOf(actions)).toEqual({
      deletes: {},
      updates: { 'app:Secret:secret-1': { patch: { secret: 'enc:v1:zero' }, inversePatch: { secret: 'enc:v1:two' } } },
      inserts: {}
    });
  });

  it('簿记字段不进差异：只有审计时间与 remoteId 不同的行不留条目', async () => {
    const scene = sceneWithHistory([
      {
        id: BASELINE,
        parentIds: [],
        units: [{ entityId: 'note-a', operation: 'insert', patch: { title: 'A0' }, inversePatch: null }]
      },
      {
        id: C1,
        parentIds: [BASELINE],
        units: [
          {
            entityId: 'note-a',
            operation: 'update',
            patch: { title: 'A1', updatedAt: '2026-11-17T02:00:00.000Z', remoteId: 'remote-1' },
            inversePatch: { title: 'A0', updatedAt: '2026-11-17T01:00:00.000Z', remoteId: null }
          }
        ]
      },
      {
        id: C2,
        parentIds: [C1],
        units: [
          {
            entityId: 'note-a',
            operation: 'update',
            patch: { title: 'A0', updatedAt: '2026-11-17T03:00:00.000Z' },
            inversePatch: { title: 'A1', updatedAt: '2026-11-17T02:00:00.000Z' }
          }
        ]
      }
    ]);

    const result = expectOk(await restoreOnce(scene, { commitId: BASELINE }));

    // 簿记字段不表达用户意图（epic-006「版本化域」第 2 类）：把 remoteId 退回 null 会断开与远端行的对应，
    // 审计时间则由适配器按「此刻」重写。它们一不同就留条目的话，任何一次改回原样都不是 no-op。
    expect(result.restoredCount).toBe(0);
  });
});

describe('entities：只把点名的行恢复到目标时的状态', () => {
  it('没点名的行留在 HEAD，不进条目也不回写', async () => {
    const scene = sceneWithHistory(crossEntityHistory());

    expectOk(
      await restoreOnce(scene, {
        commitId: BASELINE,
        entities: [{ namespace: NOTE.namespace, entity: NOTE.name, entityId: 'note-a' }]
      })
    );
    const [actions] = rewriteCallOf(scene);

    expect(entriesShapeOf(scene)).toEqual({
      'app:Note:note-a': { operation: 'update', patch: { title: 'A0' }, inversePatch: { title: 'A2' } }
    });
    expect(actionsShapeOf(actions)).toEqual({
      deletes: {},
      updates: { 'app:Note:note-a': { patch: { title: 'A0' }, inversePatch: { title: 'A2' } } },
      inserts: {}
    });
  });

  it('点名的行在 HEAD 与目标之间没变过：no-op', async () => {
    const scene = sceneWithHistory(crossEntityHistory());

    const result = expectOk(
      await restoreOnce(scene, {
        commitId: BASELINE,
        entities: [{ namespace: NOTE.namespace, entity: NOTE.name, entityId: 'note-keep' }]
      })
    );

    expect(result).toMatchObject({ restoredCount: 0, sessionId: null });
    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
  });
});

describe('兼容性预检只看真正被读的那些节点', () => {
  it('目标节点自己引用了认不出的实体也照常恢复：物化只读重放路径上的单元', async () => {
    // v1 物化读的是目标节点自己的 ChangeSet，于是预检把它也算进去；新语义下目标的数据就是「路径撤销完」
    // 之后的状态，目标节点自己一条单元都不读。照旧检查它，等于拿一个用不到的节点拒掉一次合法的恢复。
    const scene = sceneWithHistory([
      {
        id: BASELINE,
        parentIds: [],
        units: [
          { entity: 'Ghost', entityId: 'ghost-1', operation: 'insert', patch: { name: '幽灵' }, inversePatch: null }
        ]
      },
      {
        id: C1,
        parentIds: [BASELINE],
        units: [{ entityId: 'note-a', operation: 'insert', patch: { title: 'A1' }, inversePatch: null }]
      }
    ]);

    const result = expectOk(await restoreOnce(scene, { commitId: BASELINE }));

    expect(entriesShapeOf(scene)).toEqual({
      'app:Note:note-a': { operation: 'delete', patch: null, inversePatch: { title: 'A1' } }
    });
    expect(result.restoredCount).toBe(1);
  });
});
