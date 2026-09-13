/**
 * @fileoverview T033 红测试：激活态单行的建行、初始化与连接时读取（FR-052）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/activation-state.ts`。递增语义归 US-308（T119），
 * 写路径 token 校验归 US-306 阶段 A——这里只钉「行长什么样」与「怎么读回来」。
 *
 * 为什么这几组断言值得写：
 *
 * 1. **缺行会被读成 0**。`(await find(...))[0]?.activationRevision ?? 0` 是最顺手的写法，
 *    它把「这一行不见了」和「这个库刚建好」混成同一个答案。代价在 US-308 才显形：
 *    switch branch 的 CAS 拿一个**编造出来的** 0 去比对，命中与否都不再有意义。
 * 2. **单行表会被读成「第一行」**。不按 `id` 过滤而直接取 `find()` 的第一条，在只有一行
 *    时永远正确；要到某次误写入第二行才炸，而那时 revision 已经开始漂移了。
 * 3. **「不复制第二份 active branch ID」是个负向约束，没人会主动去测**。FR-052 的这半句
 *    只在有人往返回值里加一个 `activeBranchId` 时才被违反，而那个字段看起来非常合理——
 *    所以这里正面钉死返回值的字段集合。
 * 4. **初始值 0 在两条路径上各写一遍**。新库走 `createTables()`，既有库走 0004 迁移；
 *    两边各自 `activationRevision = 0` 的话，改动其一就产生了两种库。所以建行只有一个来源，
 *    并且由迁移的初始行装配去调它。
 * 5. **读会被写成「读不到就补一行」**。自愈看着贴心，实际是把 0004 没跑完这件事永久掩埋，
 *    而且补出来的 `branchGenerationSeq = 0` 会让下一个新分支拿到代际 1——与既有分支撞号（ABA）。
 */

import { describe, expect, it } from 'vitest';
import type { EntityManager } from '../../entity/entity-manager.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { RxDB } from '../../RxDB.js';
import { createWorkingTreeCommitsInitialRows } from '../../system/migrations/0004-working-tree-commits.js';
import {
  createWorkingTreeActivationRow,
  readWorkingTreeActivationState,
  type WorkingTreeActivationInfo
} from '../../working-tree/activation-state.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from '../../working-tree/working-tree-activation-state.entity.js';
import { createCommitGraphProbe } from '../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-activation-state-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.init();
  return database.entityManager;
}

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly entityManager: EntityManager;
}

function createScene(): Scene {
  return { probe: createCommitGraphProbe(), entityManager: createEntityManager() };
}

/** 往探针里塞一行激活态。 */
function seedActivation(scene: Scene, overrides: Partial<WorkingTreeActivationState> = {}): WorkingTreeActivationState {
  const row = scene.entityManager.instantiate(WorkingTreeActivationState);
  row.id = overrides.id ?? WORKING_TREE_ACTIVATION_STATE_ID;
  row.activationRevision = overrides.activationRevision ?? 0;
  row.branchGenerationSeq = overrides.branchGenerationSeq ?? 0;
  // seed 是追加语义（见 commit-graph-probe.ts），多次调用即多行。
  scene.probe.seed(WorkingTreeActivationState, [row]);
  return row;
}

describe('建行与初始化（FR-052）', () => {
  it('主键是常量、revision 从 0 起、代际续上传入值', () => {
    const row = createWorkingTreeActivationRow(createEntityManager(), 7);

    expect({
      id: row.id,
      activationRevision: row.activationRevision,
      branchGenerationSeq: row.branchGenerationSeq
    }).toEqual({ id: WORKING_TREE_ACTIVATION_STATE_ID, activationRevision: 0, branchGenerationSeq: 7 });
  });

  it('代际不从 0 重来——续的是已发放到的号', () => {
    // 写死 0 会让下一次 create branch 发出代际 1，与迁移里第一个既有分支撞号：
    // 持旧 (branchId, headRevision) 的调用方会误中新分支（ABA）。
    expect(createWorkingTreeActivationRow(createEntityManager(), 3).branchGenerationSeq).toBe(3);
  });

  it('0004 迁移的初始行用的就是这一个建行来源', () => {
    const entityManager = createEntityManager();

    const rows = createWorkingTreeCommitsInitialRows(entityManager, ['main', 'feature']);

    const activations = rows.filter(row => row instanceof WorkingTreeActivationState);
    expect(activations).toHaveLength(1);
    // 新库走 createTables()、既有库走 0004，两条路径的初始值必须逐字段相同；
    // 各写一份 `activationRevision = 0` 的话，改动其一就产生了两种库。
    expect({
      id: (activations[0] as WorkingTreeActivationState).id,
      activationRevision: (activations[0] as WorkingTreeActivationState).activationRevision,
      branchGenerationSeq: (activations[0] as WorkingTreeActivationState).branchGenerationSeq
    }).toEqual({ id: WORKING_TREE_ACTIVATION_STATE_ID, activationRevision: 0, branchGenerationSeq: 2 });
  });
});

describe('连接时读取（FR-052）', () => {
  it('读回 revision 与代际号', async () => {
    const scene = createScene();
    seedActivation(scene, { activationRevision: 4, branchGenerationSeq: 9 });

    const info = await readWorkingTreeActivationState(scene.probe.executor);

    expect(info).toEqual({ activationRevision: 4, branchGenerationSeq: 9 });
  });

  it('返回值里没有 active branch ID——当前分支的唯一真相仍是 rxdb_branch.activated', async () => {
    const scene = createScene();
    seedActivation(scene, { activationRevision: 1, branchGenerationSeq: 1 });

    const info: WorkingTreeActivationInfo = await readWorkingTreeActivationState(scene.probe.executor);

    // 加一个 `activeBranchId` 看起来非常合理，代价是两份真相开始各自漂移，
    // 而漂移之后没有任何一方能证明自己是对的。
    expect(Object.keys(info).sort()).toEqual(['activationRevision', 'branchGenerationSeq']);
  });

  it('按常量主键读，不是「取第一行」', async () => {
    const scene = createScene();
    seedActivation(scene, { id: 'stray', activationRevision: 99, branchGenerationSeq: 99 });
    seedActivation(scene, { activationRevision: 2, branchGenerationSeq: 5 });

    const info = await readWorkingTreeActivationState(scene.probe.executor);

    // 不按 id 过滤时这里会读到 99/99：单行表上「第一行」永远正确，
    // 要到某次误写入第二行才炸，而那时 revision 已经开始漂移了。
    expect(info).toEqual({ activationRevision: 2, branchGenerationSeq: 5 });
  });

  it('缺行时抛错，而不是当成 0', async () => {
    const scene = createScene();

    const error = await readWorkingTreeActivationState(scene.probe.executor).then(
      resolved => {
        throw new Error(`expected rejection, resolved with ${JSON.stringify(resolved)}`);
      },
      (caught: unknown) => caught
    );

    // `?? 0` 把「这一行不见了」和「这个库刚建好」混成同一个答案；
    // 代价在 US-308 才显形——CAS 拿一个编造出来的 0 去比对，命中与否都不再有意义。
    expect((error as Error).message).toMatch(/0004-working-tree-commits/);
  });

  it('缺行时不自愈补行——读就只是读', async () => {
    const scene = createScene();

    await readWorkingTreeActivationState(scene.probe.executor).catch(() => undefined);

    // 自愈会把「0004 没跑完」永久掩埋，而且补出来的 branchGenerationSeq = 0
    // 会让下一个新分支拿到代际 1，与既有分支撞号。
    expect(scene.probe.rowsOf(WorkingTreeActivationState)).toEqual([]);
    expect(scene.probe.saved).toEqual([]);
    expect(scene.probe.statements).toEqual([]);
  });

  it('读走仓库而不是裸 SQL——六后端方言不在这一层分叉', async () => {
    const scene = createScene();
    seedActivation(scene, { activationRevision: 0, branchGenerationSeq: 0 });

    await readWorkingTreeActivationState(scene.probe.executor);

    expect(scene.probe.statements).toEqual([]);
    expect(scene.probe.finds.map(call => call.entity)).toEqual(['WorkingTreeActivationState']);
  });
});
