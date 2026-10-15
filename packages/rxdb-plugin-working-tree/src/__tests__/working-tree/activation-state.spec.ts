/**
 * @fileoverview T033 红测试：激活态单行的建行、初始化、读取与分支代际发放（FR-052）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/activation-state.ts`。`activationRevision` 的递增归 US-308
 * （`activation-cas.spec.ts`），写路径 token 校验归 US-306 阶段 A——这里钉的是
 * 「行长什么样」「怎么读回来」，以及**代际号是怎么发出来的**。
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
 * 6. **代际发放会被写成读—改—写**。「同一个事务里读出来加一再存回去」看起来足够原子，
 *    但那个 `+1` 落在 JS 里：两条并发的 create branch 读到同一个当前值、写下同一个新号。
 *    最后一组用例把加法钉在库里（`SET seq = seq + 1`），理由与 `advanceActivationRevision` 同源。
 */

import type { EntityManager } from '@aiao/rxdb';
import { RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { createWorkingTreeCommitsInitialRows } from '../../migrations/0004-working-tree-commits.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import {
  allocateBranchGeneration,
  createWorkingTreeActivationRow,
  readWorkingTreeActivationState,
  type WorkingTreeActivationInfo
} from '../../working-tree/activation-state.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from '../../working-tree/working-tree-activation-state.entity.js';
import { createCommitGraphProbe, setClauseOf, whereClauseOf } from '../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import {
  activationColumn,
  activationUpdatesOf,
  isActivationStatement,
  isActivationUpdate,
  readBranchGenerationRows
} from './fixtures/activation-sql.js';

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-activation-state-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  // 十张系统表由插件贡献，必须赶在 `init()` 之前 `use()`：晚了核心会当场拒绝，
  // 而这些实体进不了 `config.entities` 时 `instantiate()` 抛的是「need init rxdb」。
  database.use(rxDBPluginWorkingTree);
  database.init();
  return database.entityManager;
}

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly entityManager: EntityManager;
}

/**
 * 造一个空场景。
 *
 * @param rowsAffected - `executor.query()` 一律回报的命中行数；代际发放靠它判单例行在不在
 */
function createScene(rowsAffected = 0): Scene {
  // 只替它答那条读回来的 SELECT，**不**替它执行那句 `+1`：本文件下面两条用例正是靠
  // 「库里仍是 7」把「返回值现读库」与「返回值是 `读到的 + 1`」分开的，替身把加法也做了
  // 的话两种实现都答 8，那两条断言当场失去分辨力。建分支的布景要的是两条都补
  // （`runBranchGenerationSql`），那边数的是单调源有没有往前走。
  const probe = createCommitGraphProbe({ rowsAffected, onQuery: readBranchGenerationRows });
  return { probe, entityManager: createEntityManager() };
}

/**
 * 造一个「UPDATE 报命中 1 行、读回来却交出这些行」的场景。
 *
 * @param rows - 读回来那条 SELECT 的位置化结果行
 *
 * @remarks
 * 这一组用例守的是两条语句**各说各的**那一刻，而正常布景里它们永远一致（同一份行，
 * 见 `activation-sql.ts`）——所以结果行得由用例直接给。模拟的是真实后端上够得着的两种现场：
 * 行在两条语句之间被另一方删掉（0 行 / 多行），以及某个后端把整型交成字符串或 `null`。
 */
function createReadbackScene(rows: unknown[][]): Scene {
  const probe = createCommitGraphProbe({
    rowsAffected: 1,
    onQuery: sql => (isActivationStatement(sql) && !isActivationUpdate(sql) ? rows : [])
  });
  return { probe, entityManager: createEntityManager() };
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

/**
 * 代际发放的失效形态与 `activation-cas.ts` 那两支同源，后果却更重：`activationRevision`
 * 撞号只是让一次切换的仲裁失准，代际撞号会让**两条不同的分支拿到同一个身份**——持旧
 * `(branchId, headRevision)` 的调用方从此认不出同名重建的那一条（ABA），提交幂等键跟着
 * 一起失效（`commit-idempotency.ts`）。
 *
 * 六条断言各挡一种退化：
 *
 * 1. **读出来加一再写回。** 那个 `+1` 落在 JS 里，两条并发的 create branch 读到同一个当前值、
 *    写下同一个新号，而两边都以为自己拿到了独一份。让库自己做那一步加法，新号是什么由行锁
 *    决定，与调用方读到过什么无关（与 `advanceActivationRevision` 同一条理由）。
 * 2. **WHERE 里多钉一条 `seq = ?`。** 那就退回成 CAS，而这里没有调用方给的期望值可用——
 *    唯一能填的是自读来的数，于是 CAS 永远命中，多出来的只有「看起来比过了」。
 * 3. **先读一遍再发 UPDATE。** 读到的那个值在 UPDATE 落地之前就可能过期，留着它的唯一后果
 *    是迟早有人「顺手」拿它当返回值，于是退回第 1 条。
 * 4. **返回值在 JS 里算出来。** `读到的 + 1` 与「库里现在是几」在并发下不是同一个数，
 *    而写进新分支行的正是这个返回值。
 * 5. **那一行不见了却走过去。** 代际发不出来时新分支拿到的是个编造的号，与既有分支撞号，
 *    而这一次撞号在建分支的那一刻是完全静默的。
 * 6. **读回来那一次走仓库。** 加法在库里做了，号却从 ORM 取——身份映射里那个实体实例看不见
 *    原始 UPDATE，回填走的是「逐字段避让本地未保存编辑」那条路，于是刚发放的新号被当成
 *    用户的编辑挡掉，读回来的仍是上一次那个数。这一支在六个后端的一致性套件上真红过
 *    （两条新分支拿到同一个代际），而那时单测这边一条都没红，因为替身两条通道交出的
 *    恰好是同一个数——所以这里比的是**轨迹**，不是值。
 * 7. **读回来的东西不成形却走过去。** 0 行、多行、或那一格不是整数，三种都意味着这一次
 *    发放没有答案；挑一个能用的出来等于让调用方自己编一个代际，而代际的全部意义是永不复用。
 */
describe('分支代际的发放（data-model.md §2.2）', () => {
  it('发出的是一条 UPDATE，把代际就地 +1，而不是赋一个自读来的数', async () => {
    const scene = createScene(1);
    seedActivation(scene, { branchGenerationSeq: 7 });

    await allocateBranchGeneration(scene.probe.executor);

    const seq = activationColumn('branchGenerationSeq');
    const updates = activationUpdatesOf(scene.probe.statements);
    expect(updates).toHaveLength(1);
    expect(setClauseOf(updates[0] ?? '')).toContain(`${seq} = ${seq} + 1`);
  });

  it('WHERE 只钉常量主键——它不是 CAS，这里没有调用方给的期望值可用', async () => {
    const scene = createScene(1);
    seedActivation(scene, { branchGenerationSeq: 7 });

    await allocateBranchGeneration(scene.probe.executor);

    const where = whereClauseOf(activationUpdatesOf(scene.probe.statements)[0] ?? '');
    expect({
      pinsId: where.includes(`${activationColumn('id')} = '${WORKING_TREE_ACTIVATION_STATE_ID}'`),
      pinsSeq: where.includes(activationColumn('branchGenerationSeq'))
    }).toEqual({ pinsId: true, pinsSeq: false });
  });

  it('先发 UPDATE 再读回来，两次都走原始语句，一次仓库读都没有', async () => {
    const scene = createScene(1);
    seedActivation(scene, { branchGenerationSeq: 7 });

    await allocateBranchGeneration(scene.probe.executor);

    // 两件事钉在同一条断言上，因为它们错开任何一个的后果都是「两条新分支拿到同一个代际」：
    //
    // **顺序。** 读在前的话，读到的就是加法之前的数，而两条并发发放会读到同一个它。
    // **通道。** 读回来那一次若走仓库（`readWorkingTreeActivationState`），交出的是身份映射里
    // 那个实体实例——它看不见上一条原始 UPDATE，回填时反而会把 `branchGenerationSeq` 当成
    // 「本地未保存的编辑」保护下来（`entity-status.ts` › `applyExternal`），于是读回来的是本
    // 会话上次以为的那个数。这一条在六个后端的一致性套件上真红过，而单测这边当时全绿。
    //
    // `finds` 与 `statements` 各自成序、彼此之间却没有先后，所以这里比的是轨迹
    // （见 commit-graph-probe.ts › trace）：两个 `query` 说明两条都是原始语句，
    // 没有 `find:` 说明这条路上没有任何一层会替它记答案的缓存。
    expect(scene.probe.trace).toEqual(['query', 'query']);
  });

  it('交回来的号现读库，不是「读到的值 + 1」', async () => {
    const scene = createScene(1);
    seedActivation(scene, { branchGenerationSeq: 7 });

    // 布景只答读回来那一条，不替它执行那句 `+1`（见 `createScene`），于是库里仍然是 7。
    // 断言 7 而不是 8，钉的正是「返回值现读库」：任何在 JS 里算 `读到的 + 1` 的实现
    // 都会给出 8，而那个 8 在并发下与库里的真值无关。
    await expect(allocateBranchGeneration(scene.probe.executor)).resolves.toBe(7);
  });

  it('不经 ORM 改那一行——读—改—写会把加法搬回 JS 里', async () => {
    const scene = createScene(1);
    const row = seedActivation(scene, { branchGenerationSeq: 7 });

    await allocateBranchGeneration(scene.probe.executor);

    // 同上：布景不执行那句 `+1`，所以这一行只可能被 JS 改动。它没动，就说明发放没走读—改—写。
    expect(row.branchGenerationSeq).toBe(7);
  });

  it('单例行不在时当场抛，不静默发一个号出去', async () => {
    const scene = createScene(0);

    // 放行等于让这条新分支带着一个编造的代际落库，而它与既有分支撞号在建分支的那一刻
    // 是完全静默的——要到有人拿旧 `(branchId, headRevision)` 误中新分支时才显形。
    await expect(allocateBranchGeneration(scene.probe.executor)).rejects.toThrow(/0004-working-tree-commits/);
  });

  it('读回来不是恰好一行时抛——上一条 UPDATE 已经报了命中 1 行', async () => {
    // 两条语句看见的不是同一行，唯一诚实的结论是「这个号发不出来」。挑一行凑合用的话，
    // 0 行那支只能由调用方自己编一个数出来，多行那支则是编「用哪一行」——两种编法
    // 在建分支的那一刻都完全静默，要到有人拿旧 `(branchId, headRevision)` 误中新分支时才显形。
    await expect(allocateBranchGeneration(createReadbackScene([]).probe.executor)).rejects.toThrow(
      /期望恰好 1 行 1 个整数/
    );
    await expect(allocateBranchGeneration(createReadbackScene([[8], [9]]).probe.executor)).rejects.toThrow(
      /期望恰好 1 行 1 个整数/
    );
  });

  it('读回来的那一格不是整数时抛——不把后端交上来的字符串当代际用', async () => {
    // 整型读成字符串在本仓支持的后端上不是假想：放过去的话，`'8'` 会一路走到
    // `CommitBranchRef.generation` 落库，而代际是不可变列——落错之后没有第二次机会，
    // 且此后每一次 CAS 比对都是在拿一个字符串跟数字比。
    await expect(allocateBranchGeneration(createReadbackScene([['8']]).probe.executor)).rejects.toThrow(
      /期望恰好 1 行 1 个整数/
    );
    await expect(allocateBranchGeneration(createReadbackScene([[null]]).probe.executor)).rejects.toThrow(
      /期望恰好 1 行 1 个整数/
    );
  });

  it('命中多行时也抛——单例行上改了两行意味着表里多长了一行', async () => {
    const scene = createScene(2);
    seedActivation(scene, { branchGenerationSeq: 7 });

    // 按成功继续的话，接下来读回来的是两行里的哪一行都说不准，而代际的单调性全靠这一行。
    await expect(allocateBranchGeneration(scene.probe.executor)).rejects.toThrow(/0004-working-tree-commits/);
  });
});
