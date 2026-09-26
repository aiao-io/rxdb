/**
 * @fileoverview T095 —— 工作树三项核心操作的 benchmark（契约 §1–§3）。
 *
 * @remarks
 * 测四项：完整 `status()`、完整 `diff()`（无 scope）、从 clean HEAD 恢复 `HEAD~1` 的
 * `restore()`（T109），以及一次提交 100 单元的 `commit()`。fixture 由
 * {@link ./working-tree-fixture.ts} 给出并冻结形状，本文件一个形状常数都不再定义。
 *
 * **为什么每项都要配一个 control，而不是直接断裸墙钟数字。** 契约 §0 的理由是「不指定设备
 * 与存储后端就在 CI 上做绝对断言必然抖动，而抖动的门禁最终会被关掉」。于是被测项除以一个
 * 同机同时刻的 control CRUD，得到的 ratio 才是可以跨机器比较的量——机器快一倍时分子分母
 * 一起快一倍，ratio 不动。
 *
 * **control 跑在一个没装工作树插件的库上。** 这是 control 的定义所要求的：它要回答「同样
 * 100 个实体、同样一个事务边界，**普通 CRUD** 要多久」。跑在被测库上的话，那 100 行写入
 * 会被捕获运行时拦下、记成 100 个工作树条目——control 里于是含着一份被测开销，ratio 被压向 1，
 * 而「工作树贵多少」这个问题恰恰问不出来了。两个库的业务表都装着同一份 10,000 行、同一批
 * 主键（`FIXTURE_SEED` 决定），因此 B-tree 深度与页分布可比；control 读写的又正是工作树
 * 此刻正持有的那 100 个 id，连页局部性都对得上。
 *
 * **control 与被测逐 sample 交错，不是先测完一堆再测另一堆。** 契约 §2 只要求「同一次运行内」，
 * 但同一次运行内也会漂移——PGlite 的 WASM 堆在几万次写之后不是运行开始时的样子，机器的
 * 热节流更不是。交错之后第 i 个 ratio 的分子分母来自同一时刻，漂移在相除时对消。代价是
 * `control_read_100` 被采样两轮（`status` 与 `diff` 各一轮）：同一份工作分两处采，两份
 * `controlP95` 会有零点几毫秒的差别，而那正是本该留在各自 ratio 里的那部分漂移。
 *
 * **每个 sample 之前在计时外恢复 fixture**（契约 §1「恢复时机」），恢复动作见
 * {@link restoreWorkingTreeFixture}。`restore` 是唯一的例外形状：它的前置只清场、不写那
 * 100 个未提交单元，因为契约 §3.2 给它的口径是「从 **clean HEAD** 恢复 `HEAD~1`」，
 * 而工作树不干净时 `restore()` 压根不会开始干活（`dirty_working_tree`）。
 *
 * **`commit` 的历史会在采样过程中变深，本文件不假装它没变。** 第 0 个 sample 面对 100 层
 * 历史，第 54 个面对 154 层。唯一能消掉这层漂移的办法是每个 sample 重建整库，而那是
 * 10,000 行插入乘以 55——一项就要四十多分钟，且重建本身的抖动比它要消掉的漂移更大。
 * 于是照实测、照实记：这条漂移对 `commit` 与它的 control 一视同仁地留在数字里，冻结
 * reference 时也在同一条件下冻结，相对门禁比的仍是同一件事。
 *
 * **门禁**（契约 §3）：
 *
 * - 相对门禁：各项 ratio ≤ **与本机同比值画像**的那份 reference median × 该项容差（读项
 *   `status` / `diff` 130%，写项 `restore` / `commit` 110%，见 `RELATIVE_GATE_TOLERANCES`），
 *   这是 PR CI 的**唯一**硬门禁。画像 = 系统/架构 + CPU 型号 + Node 主版本；为什么 ratio 只能在同画像内比，
 *   见 `working-tree-gate.ts`。三种结局：
 *   - 一份 reference 都没冻结：打印提示并以 0 退出——首个绿色实现得先跑出数字，T097 才有东西可冻。
 *   - 有 reference 但没有同画像的：以 `benchmark_environment_mismatch` 失败，不降级为通过；
 *     补冻方法见失败时打印的提示。
 *   - 有同画像的：逐项比。
 * - 绝对门禁：只在 `--release` 下评估，且只在 `runnerProfileHash` 与同画像 reference 相等时。
 *   profile 对不上时以 `benchmark_environment_mismatch` 失败，**既不伪装成性能回归，也不
 *   降级为通过**（契约 §3.2 的原话）。
 *
 * 运行：
 *   node --experimental-strip-types benchmarks/working-tree.bench.ts [--release]
 *
 * @see requirements/epics/epic-006-working-tree-commits.md「性能预算的口径」与「reference 的冻结与复冻」（现行规则）
 * @see `git show f9528e8f:specs/001-working-tree-commits/contracts/benchmark-report.md`（文中的「契约 §N」）
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { IRxDBAdapter, RxDBAdapterLocalBase, UUID } from '@aiao/rxdb';
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { WORKING_TREE_CONFORMANCE_USER_ID } from '@aiao/rxdb-plugin-working-tree/testing';
import { firstValueFrom } from 'rxjs';

import { summarise } from './bench-stats.ts';
import type { WorkingTreeFixturePlan } from './working-tree-fixture.ts';
import {
  buildWorkingTreeFixturePlan,
  captureFixtureCredentials,
  clearWorkingTreeFixture,
  createWorkingTreeFixtureDatabase,
  fixtureCommitOptions,
  fixtureUpdateTitle,
  restoreWorkingTreeFixture,
  seedWorkingTreeFixture
} from './working-tree-fixture.ts';
import type { RatioVerdict, RelativeGateDecision } from './working-tree-gate.ts';
import { collectEnvironment, decideRelativeGate, readReferences, selectReference } from './working-tree-gate.ts';
import type {
  BenchEnvironment,
  BenchMeasurement,
  BenchReference,
  WorkingTreeBenchReport
} from './working-tree-report.ts';
import {
  ABSOLUTE_BUDGET_MS,
  ENVIRONMENT_MISMATCH_CODE,
  LATEST_PATH,
  REFERENCE_DIR,
  RESTORE_ABSOLUTE_BUDGET_MS,
  SAMPLES,
  SCHEMA_VERSION,
  WARMUP
} from './working-tree-report.ts';

/** 计时一次异步操作，返回耗时毫秒；「响应」按契约 §1 定义为 promise resolve。 */
const timed = async (operation: () => Promise<unknown>): Promise<number> => {
  const start = performance.now();
  await operation();
  return performance.now() - start;
};

// ---------------------------------------------------------------------------
// control：没装工作树插件的同规模库
// ---------------------------------------------------------------------------

/**
 * control 库的业务实体：与 `ConformanceNote` 逐列同形，但是**另一个类**。
 *
 * @remarks
 * **不能复用 `ConformanceNote`。** 核心的实体注册表是按类做键的全局表，同一个类被两个
 * `RxDB` 实例注册之后，`new ConformanceNote()` 无从知道该把自己登记到哪一个上——核心为此
 * 直接抛 `Entity 'ConformanceNote' is registered with multiple RxDB instances`。control 要的是
 * 「另一个库上的同样一张表」，而那在今天只能由另一个类表达。
 *
 * **两个可写列与 `ConformanceNote` 逐字段对齐**（`title` 定长 tracked、`body` 可空），
 * 簿记列由 {@link EntityBase} 带来，两边同样多。control 与被测搬的字节数因此相等——不等的话
 * ratio 量的就成了「两张表宽度之差」。
 *
 * 用 `Entity(...)(class)` 而不是 `@Entity` 装饰器语法：本文件要由
 * `node --experimental-strip-types` 直接跑，而 type stripping 只擦类型、不转换装饰器。
 * 装饰器本来就是「接受类、返回类」的函数，这里调的是同一个函数、同一条增强路径
 * （`entity.decorator.ts`），没有绕过任何一步。
 */
class BenchControlNoteBase extends EntityBase {
  /** tracked 列，与 `ConformanceNote.title` 同宽 */
  title!: string;

  /** 可空 tracked 列，与 `ConformanceNote.body` 同宽 */
  body!: string | null;
}

/** 见 {@link BenchControlNoteBase}；增强后的类才是可 `new` 的那一个。 */
const BenchControlNote = Entity({
  name: 'BenchControlNote',
  tableName: 'bench_control_notes',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'body', type: PropertyType.string, nullable: true }
  ]
})(BenchControlNoteBase);

/**
 * control 侧的库与它的适配器；两项 control 都在这一个事务边界上跑。
 *
 * @remarks
 * `adapter` 的类型是两者的交集而不是单一个 `IRxDBAdapter`：`transaction()` 声明在抽象基类
 * `RxDBAdapterLocalBase` 上，接口那一半只覆盖读写 API。工作树门面取本地适配器时用的正是
 * 这同一个交集（`working-tree-facade.ts` 的 `runEnabled`），control 与被测于是跨的是同一道
 * 事务边界——这是 ratio 成立的前提，不是一次类型上的将就。
 */
interface ControlDatabase {
  readonly database: RxDB;
  readonly adapter: IRxDBAdapter & RxDBAdapterLocalBase;
}

/** 一次 control 写入分多少行一批灌进去；只影响建库耗时，不影响任何被测量。 */
const CONTROL_SEED_BATCH = 500;

/**
 * 建一个**不装工作树插件**的对照库，并灌进与 fixture 同样的 10,000 行。
 *
 * @param plan - fixture 规划；主键与内容逐字节取自它
 * @returns 见 {@link ControlDatabase}
 *
 * @remarks
 * 只注册 {@link BenchControlNoteBase} 一个实体，一个插件都不 `use()`：control 要量的是
 * 「这台机器上，普通 CRUD 碰 100 个实体要多久」。装上工作树插件（哪怕不 `enable()`）
 * 会多出 10 张系统表与一层引导事务，而那些都不属于「普通 CRUD」。
 *
 * 灌数据走 `adapter.transaction(ex => ex.saveMany(batch))` 而不是逐行 `entityManager.save()`：
 * 后者是 10,000 个事务，建库要几十秒，而这段耗时既不进报告也不该拖慢门禁。
 *
 * 只写 `id` / `title` / `body` 三列，与 fixture 侧写业务行时同形——两个库的
 * 行宽必须一样，否则 control 搬的字节数与被测搬的对不上，ratio 就不再是「同样的数据量下
 * 贵多少」。
 */
const createControlDatabase = async (plan: WorkingTreeFixturePlan): Promise<ControlDatabase> => {
  const database = new RxDB({
    dbName: `working-tree-bench-control-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    context: { userId: WORKING_TREE_CONFORMANCE_USER_ID },
    entities: [BenchControlNote],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  await database.connect('pglite');
  const adapter = await firstValueFrom(database.localAdapter$);

  const notes = plan.commitPlans.flatMap(commit => commit.notes);
  for (let cursor = 0; cursor < notes.length; cursor += CONTROL_SEED_BATCH) {
    const batch = notes
      .slice(cursor, cursor + CONTROL_SEED_BATCH)
      .map(note => new BenchControlNote({ id: note.id, title: note.title, body: note.body }));
    await adapter.transaction(executor => executor.saveMany(batch));
  }
  return { database, adapter };
};

/** control 的两种形状；写进报告的 `controlId` 只能是这两个之一。 */
const CONTROL_READ = 'control_read_100';
const CONTROL_WRITE = 'control_write_100';

/**
 * control 读：一个事务里读出那 100 行。
 *
 * @param control - 见 {@link createControlDatabase}
 * @param ids - 工作树此刻正持有的那 100 个主键
 * @returns 本次读的耗时，毫秒
 * @throws `Error` 读回的行数不是 100
 *
 * @remarks
 * 走 `executor.getRepository().find()` 而不是仓储的 `findAll()`：后者返回的是活查询
 * Observable，`firstValueFrom` 之后订阅还挂在那里，几十次采样会在库上堆出几十个监听，
 * 而那份开销只属于 control 一侧。
 *
 * 断言行数：`in` 规则里少一个 id 会让 control 变快，而门禁看到的只是「ratio 变大了」，
 * 排查方向会被指向被测实现。
 */
const sampleControlRead = async (control: ControlDatabase, ids: readonly UUID[]): Promise<number> => {
  let rowCount = 0;
  const elapsed = await timed(async () => {
    const rows = await control.adapter.transaction(executor =>
      executor
        .getRepository(BenchControlNote)
        .find({ where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: [...ids] }] } })
    );
    rowCount = rows.length;
  });
  if (rowCount !== ids.length) throw new Error(`control 读回 ${rowCount} 行，应为 ${ids.length}`);
  return elapsed;
};

/**
 * control 写：一个事务里更新那 100 行。
 *
 * @param control - 见 {@link createControlDatabase}
 * @param plan - fixture 规划
 * @param revision - 这一轮的轮次号；与工作树侧共用同一个单调计数器
 * @returns 本次写的耗时，毫秒
 * @throws `Error` 待写的行数不是 100
 *
 * @remarks
 * 读回与改字段都在**计时外**，计时只罩住那一个事务——被测的 `commit()` 同样只被罩住命令
 * 本身（它的三个捕获位由 `fixtureCommitOptions()` 在计时外取）。两边的边界必须画在同一处，
 * 否则 ratio 里混着「谁多算了一次读」。
 *
 * 写的值与工作树侧那 100 个未提交单元逐字节相同（{@link fixtureUpdateTitle} + 同一个
 * `body`），于是两边搬的字节数相等。
 */
const sampleControlWrite = async (
  control: ControlDatabase,
  plan: WorkingTreeFixturePlan,
  revision: number
): Promise<number> => {
  const ids = plan.uncommittedUpdates.map(update => update.id);
  const rows = await control.adapter.transaction(executor =>
    executor
      .getRepository(BenchControlNote)
      .find({ where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: ids }] } })
  );
  if (rows.length !== plan.uncommittedUpdates.length) {
    throw new Error(`control 写前读回 ${rows.length} 行，应为 ${plan.uncommittedUpdates.length}`);
  }
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const update of plan.uncommittedUpdates) {
    const row = byId.get(update.id);
    if (row === undefined) throw new Error(`control 库里缺少 ${update.id}`);
    row.title = fixtureUpdateTitle(update, revision);
    row.body = update.body;
  }
  return timed(() => control.adapter.transaction(executor => executor.saveMany(rows)));
};

// ---------------------------------------------------------------------------
// 采样
// ---------------------------------------------------------------------------

/** 一个测点的被测侧：给定轮次号，跑一次并返回耗时。 */
type MeasuredSampler = (revision: number) => Promise<number>;

/** 一个测点的 control 侧。 */
type ControlSampler = (revision: number) => Promise<number>;

/** 轮次号发号器；整次运行共用一个，保证每次恢复写进去的标题都没被提交过。 */
let nextRevision = 1;

/** 一轮开始前那次**计时外**的前置；见 {@link runMeasurement} 的 `prepare`。 */
type RoundPreparer = (revision: number) => Promise<void>;

/**
 * 跑满一个测点：`WARMUP + SAMPLES` 轮，每轮「计时外前置 → 测被测 → 测 control」。
 *
 * @param id - 测点 id
 * @param prepare - 每轮开始前的计时外前置；见下
 * @param controlId - control 形状标识，写进报告
 * @param measured - 被测侧采样器
 * @param control - control 侧采样器
 * @returns 见 {@link BenchMeasurement}
 *
 * @remarks
 * 前置收成参数而不是在这里直接调 `restoreWorkingTreeFixture()`：契约 §1 要求的是「每个
 * sample 前在计时外恢复**同一** fixture」，而「同一」对不同测点落在不同状态上——
 * `status` / `diff` / `commit` 要的是「100 个未提交单元」，`restore` 要的是
 * 「clean HEAD」（契约 §3.2 的 SC-004 口径）。写死一种的话，`restore` 每轮都会先被写脏
 * 再自己清一次，量到的仍是 restore，但那 100 行多余的写会把它前面那批页的状态搅成
 * 另一回事。四个测点的前置因此各自声明，恢复时机（计时外、每轮一次）仍然只有这一处。
 *
 * 预热轮**照样前置、照样跑 control**：预热的作用是让 JIT 与 PGlite 的页缓存进入稳态，
 * 而稳态是由整轮三件事共同决定的。只预热被测侧的话，control 的前几个正式样本仍然是冷的，
 * 分母偏大、ratio 偏小。
 *
 * 被测排在 control **之前**：反过来的话，control 刚写完的那 100 行还热着，被测项会捡到
 * 一份不属于它的缓存便宜。按这个顺序，两边面对的都是「刚被前置动作碰过」的同一批页。
 */
const runMeasurement = async (
  id: string,
  prepare: RoundPreparer,
  controlId: string,
  measured: MeasuredSampler,
  control: ControlSampler
): Promise<BenchMeasurement> => {
  const measuredSamples: number[] = [];
  const controlSamples: number[] = [];
  process.stdout.write(`[bench:working-tree] ${id} `);
  for (let round = 0; round < WARMUP + SAMPLES; round++) {
    const revision = nextRevision++;
    await prepare(revision);
    const measuredMs = await measured(revision);
    const controlMs = await control(revision);
    if (round >= WARMUP) {
      measuredSamples.push(measuredMs);
      controlSamples.push(controlMs);
    }
    if (round % 10 === 0) process.stdout.write('.');
  }
  process.stdout.write('\n');

  const stats = summarise(measuredSamples);
  const controlP95 = summarise(controlSamples).p95;
  return { id, ...stats, controlId, controlP95, ratio: stats.p95 / controlP95 };
};

/**
 * 解析出 `HEAD~1` 的 commit id（契约 §3.2 的 `restore` 口径）。
 *
 * @param database - 已建好 fixture 的被测库
 * @returns HEAD 的第一父
 * @throws `Error` 历史里读不到 HEAD，或 HEAD 没有父节点
 *
 * @remarks
 * 走 `headCommitId` + `firstParentId` 而不是 `entries[1]`：后者依赖返回顺序，而顺序一旦
 * 变化，这里会安安静静地量起另一个 commit 的恢复——`HEAD~2` 的重放路径有两个节点、
 * 200 个单元，数字会翻倍而没有任何东西报错。
 *
 * 取第一父而不是遍历 `parentIds`：`HEAD~1` 在 git 语义里就是第一父，合并节点的第二父是
 * `HEAD^2`。fixture 里没有合并节点，但这个函数不该靠那件事成立。
 */
const resolveHeadParentCommitId = async (database: RxDB): Promise<string> => {
  const log = await database.workingTree.listCommits();
  const head = log.entries.find(entry => entry.commitId === log.headCommitId);
  if (!head) throw new Error(`历史里找不到 HEAD（${String(log.headCommitId)}）`);
  if (head.firstParentId === null) throw new Error('HEAD 是根节点，没有 HEAD~1 可恢复');
  return head.firstParentId;
};

/**
 * 造出 `restore` 测点的被测采样器。
 *
 * @param database - 已建好 fixture 的被测库
 * @param plan - fixture 规划；`unitsPerCommit` 用作落库条目数的判据
 * @returns 见 {@link MeasuredSampler}
 * @throws `Error` 解析 `HEAD~1` 失败（见 {@link resolveHeadParentCommitId}）
 *
 * @remarks
 * 造一个采样器而不是直接写成箭头函数，是为了让 `HEAD~1` 的解析发生在**采样循环之外**
 * 并且只发生一次；返回的闭包里于是一次多余的 IO 都没有。
 *
 * 三个捕获位在**计时外**取，与 `commit` 测点同形（`fixtureCommitOptions()` 也在计时外）。
 * 而且必须取在每轮的前置**之后**：那次丢弃会推进 `workingTreeRevision`，循环外取一次
 * 全程复用的话，第二轮起每一次恢复都会被 CAS 判成冲突（FR-034）。
 *
 * 断言落库条目数恰好是一层 commit 的单元数：恢复少写几条会让这一项变快，而门禁看到的
 * 只是「ratio 变小了」——与 {@link sampleControlRead} 断言行数是同一个理由，方向相反。
 * 被拒出口也必须炸而不是记成一个很快的样本：`dirty_working_tree` 之类的拒绝只要几毫秒，
 * 一旦前置失灵，这一项会以「快了两个数量级」的姿态绿着过门禁。
 */
const buildRestoreSampler = async (database: RxDB, plan: WorkingTreeFixturePlan): Promise<MeasuredSampler> => {
  const commitId = await resolveHeadParentCommitId(database);
  return async revision => {
    const credentials = await captureFixtureCredentials(database);
    let restoredCount = -1;
    let rejectedBecause = '';
    const elapsed = await timed(async () => {
      const result = await database.workingTree.restore({ commitId }, credentials);
      if (result.ok) restoredCount = result.restoredCount;
      else rejectedBecause = result.reason;
    });
    if (rejectedBecause.length > 0) throw new Error(`第 ${revision} 轮恢复被拒：${rejectedBecause}`);
    if (restoredCount !== plan.unitsPerCommit) {
      throw new Error(`第 ${revision} 轮恢复写了 ${restoredCount} 个条目，应为 ${plan.unitsPerCommit}`);
    }
    return elapsed;
  };
};

/**
 * 跑完四个测点。
 *
 * @param database - 已建好 fixture 的被测库
 * @param control - 对照库
 * @param plan - fixture 规划
 * @returns 四项测量，顺序即报告里的顺序
 *
 * @remarks
 * `commit` 排在最后，因为只有它会推进历史（见文件头）。排在前面的话，`status` / `diff` /
 * `restore` 会在一条比 fixture 声明更深的历史上采样，而报告里的 `fixture.commits` 仍写着
 * 100——`restore` 受这条影响尤其大：它量的正是「重放 HEAD 那一层的 100 个单元」，而那一层
 * 是哪一个 commit 决定了它有多少单元。
 *
 * `restore` 的 `HEAD~1` 在整个测点内**只解析一次**：恢复不挪 HEAD（硬裁决 5），五十五轮
 * 面对的是同一个目标。每轮重解析一次的话，多出来的那次 `listCommits()` 会读满整条 100 层
 * 历史，而它既不进计时也不属于这个测点要量的东西。
 *
 * `operationId` 每轮不同：同一个值在提交语义里表示「同一次逻辑提交的重试」，五十轮共用
 * 一个会让第二轮起全部落进幂等短路——测出来的是「查一次幂等键」的耗时。
 */
const runMeasurements = async (
  database: RxDB,
  control: ControlDatabase,
  plan: WorkingTreeFixturePlan
): Promise<BenchMeasurement[]> => {
  const restoreFixture: RoundPreparer = revision => restoreWorkingTreeFixture(database, plan, revision);
  const ids = plan.uncommittedUpdates.map(update => update.id);

  const status = await runMeasurement(
    'status',
    restoreFixture,
    CONTROL_READ,
    () => timed(() => database.workingTree.status()),
    () => sampleControlRead(control, ids)
  );
  const diff = await runMeasurement(
    'diff',
    restoreFixture,
    CONTROL_READ,
    () => timed(() => database.workingTree.diff()),
    () => sampleControlRead(control, ids)
  );
  const restore = await runMeasurement(
    'restore',
    () => clearWorkingTreeFixture(database),
    CONTROL_WRITE,
    await buildRestoreSampler(database, plan),
    revision => sampleControlWrite(control, plan, revision)
  );
  const commit = await runMeasurement(
    'commit',
    restoreFixture,
    CONTROL_WRITE,
    async revision => {
      const options = await fixtureCommitOptions(database, `bench-commit-${revision}`);
      let ok = false;
      const elapsed = await timed(async () => {
        const result = await database.workingTree.commit(`bench commit ${revision}`, options);
        ok = result.ok;
      });
      if (!ok) throw new Error(`第 ${revision} 轮提交冲突：单线程 benchmark 里出现 CAS 冲突只可能是实现缺陷`);
      return elapsed;
    },
    revision => sampleControlWrite(control, plan, revision)
  );
  return [status, diff, restore, commit];
};

// ---------------------------------------------------------------------------
// 门禁
// ---------------------------------------------------------------------------

/**
 * 打印相对门禁的逐项判定（契约 §3.1）；判定本身见 `decideRelativeGate`。
 *
 * @param verdicts - 同画像 reference 下的逐项判定
 */
const printRelativeVerdicts = (verdicts: readonly RatioVerdict[]): void => {
  console.log('\n[bench:working-tree] === 相对门禁（PR CI 唯一硬门禁）===');
  for (const verdict of verdicts) {
    if (verdict.referenceRatio === null) {
      console.log(`  [${verdict.id}] reference 里没有这一项 → ✗ FAIL（新增测点必须先重新冻结 reference）`);
      continue;
    }
    if (verdict.tolerance === null || verdict.budget === null) {
      console.log(`  [${verdict.id}] 没有定过容差 → ✗ FAIL（新增测点须先在 RELATIVE_GATE_TOLERANCES 归为读或写）`);
      continue;
    }
    console.log(
      `  [${verdict.id}] ratio=${verdict.ratio.toFixed(3)} ` +
        `(reference median=${verdict.referenceRatio.toFixed(3)}, ` +
        `上限=${verdict.budget.toFixed(3)} = ${Math.round(verdict.tolerance * 100)}%) → ` +
        (verdict.passed ? '✓ PASS' : '✗ FAIL')
    );
  }
};

/**
 * 打印「没有同画像 reference」的失败说明与补冻方法。
 *
 * @param decision - `mismatch` 分支
 *
 * @remarks
 * 不拿别的画像的 reference 凑合着判：那正是 CI run 36070569734 红掉的原因——EPYC 上的 `status`
 * 拿 M1 的 median 去比。也不当成通过：CI 大多数时候恰恰跑在还没冻结过的 CPU 上。
 */
const printProfileMismatch = (decision: Extract<RelativeGateDecision, { kind: 'mismatch' }>): void => {
  console.error(
    `\n[bench:working-tree] ${ENVIRONMENT_MISMATCH_CODE}: 本机画像「${decision.profile}」没有冻结的 reference。\n` +
      `[bench:working-tree] 已冻结的画像：${decision.known.map(profile => `「${profile}」`).join('、')}\n` +
      '[bench:working-tree] ratio 只在同画像内可比，相对门禁不在此机上评估，也不降级为通过。\n' +
      '[bench:working-tree] CI 偶然分到新型号：先重跑该 job 一次；同一型号反复出现再补冻（契约 §3.1）。\n' +
      '[bench:working-tree] 补冻（所在提交须先在已冻结画像上过相对门禁）：\n' +
      '[bench:working-tree]   CI：推注解 tag `git tag -a bench-freeze/<日期> -m "理由"`，或手动触发 bench-freeze workflow；\n' +
      '[bench:working-tree]   本机：node --experimental-strip-types benchmarks/freeze-working-tree-reference.ts --new-profile "理由"'
  );
};

/**
 * 绝对门禁：只在 `--release` 且 profile 匹配时评估（契约 §3.2）。
 *
 * @param measurements - 本次测量
 * @param reference - 与本机同画像的 reference
 * @param environment - 本次运行环境
 * @returns 全部通过返回 `true`
 *
 * @remarks
 * profile 不匹配时返回 `false` 并打印 {@link ENVIRONMENT_MISMATCH_CODE}：契约明写着
 * 「不得伪装成性能回归，也不得因此降级为通过」，于是既不能把它记成某一项 FAIL，
 * 也不能 `return true`。
 *
 * `commit` 用的是 reference 冻结的绝对中位数而不是 100 ms——已批准的宪法例外，见契约 §4。
 */
const evaluateAbsoluteGate = (
  measurements: readonly BenchMeasurement[],
  reference: BenchReference,
  environment: BenchEnvironment
): boolean => {
  console.log('\n[bench:working-tree] === 绝对门禁（仅发布）===');
  if (environment.runnerProfileHash !== reference.runnerProfileHash) {
    console.error(
      `  ${ENVIRONMENT_MISMATCH_CODE}: 本机 profile ${environment.runnerProfileHash.slice(0, 12)} ` +
        `≠ reference ${reference.runnerProfileHash.slice(0, 12)}。绝对门禁不在此机上评估。`
    );
    return false;
  }
  const budgets: Readonly<Record<string, number>> = {
    status: ABSOLUTE_BUDGET_MS,
    diff: ABSOLUTE_BUDGET_MS,
    restore: RESTORE_ABSOLUTE_BUDGET_MS,
    commit: reference.frozenAbsolute.commit
  };
  let passed = true;
  for (const measurement of measurements) {
    const budget = budgets[measurement.id];
    if (budget === undefined) {
      console.log(`  [${measurement.id}] 无绝对预算，跳过`);
      continue;
    }
    const ok = measurement.p95 <= budget;
    if (!ok) passed = false;
    console.log(
      `  [${measurement.id}] p95=${measurement.p95.toFixed(2)}ms (上限 ${budget.toFixed(2)}ms) → ${ok ? '✓ PASS' : '✗ FAIL'}`
    );
  }
  return passed;
};

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/** 把报告写进 {@link LATEST_PATH}。 */
const archiveReport = async (report: WorkingTreeBenchReport): Promise<void> => {
  await mkdir(dirname(LATEST_PATH), { recursive: true });
  await writeFile(LATEST_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\n[bench:working-tree] 报告已写入 → ${LATEST_PATH}`);
};

/**
 * 跑完一次完整 benchmark 并返回报告。
 *
 * @param references - 已冻结的全部 reference；报告里只记与本机同画像的那一份
 */
const runBenchmark = async (references: readonly BenchReference[]): Promise<WorkingTreeBenchReport> => {
  const environment = collectEnvironment();
  console.log(`[bench:working-tree] ${environment.runtime} / ${environment.cpuModel} / ${environment.os}`);
  console.log(`[bench:working-tree] ratioProfile=${environment.ratioProfile}`);
  console.log(`[bench:working-tree] runnerProfileHash=${environment.runnerProfileHash}`);

  const plan = buildWorkingTreeFixturePlan();
  console.log(`[bench:working-tree] fixture contentHash=${plan.contentHash}`);

  console.log('[bench:working-tree] 建对照库（无工作树插件，同规模 10,000 行）…');
  const control = await createControlDatabase(plan);

  console.log('[bench:working-tree] 建被测库并灌 fixture（100 次提交，耗时以分钟计）…');
  const database = await createWorkingTreeFixtureDatabase();
  await seedWorkingTreeFixture(database, plan);

  const measurements = await runMeasurements(database, control, plan);
  await database.disconnectAll();
  await control.database.disconnectAll();

  return {
    schemaVersion: SCHEMA_VERSION,
    fixture: {
      entities: plan.entities,
      commits: plan.commits,
      unitsPerCommit: plan.unitsPerCommit,
      uncommittedUnits: plan.uncommittedUnits,
      contentHash: plan.contentHash
    },
    environment,
    sampling: { warmup: WARMUP, samples: SAMPLES },
    measurements,
    reference: selectReference(references, environment.ratioProfile)
  };
};

/** `--release` 打开绝对门禁；`--no-gate` 只产数字不判定，供 T097 的冻结脚本使用。 */
const releaseMode = process.argv.includes('--release');
const gatingDisabled = process.argv.includes('--no-gate');
// 先读 reference 再开跑：坏掉的 reference 应该在第一秒让门禁变红，而不是在六七分钟之后。
const references = await readReferences(REFERENCE_DIR);
const report = await runBenchmark(references);

console.log('\n[bench:working-tree] === 测量 ===');
for (const measurement of report.measurements) {
  console.log(
    `  [${measurement.id}] p50=${measurement.p50.toFixed(2)}ms p95=${measurement.p95.toFixed(2)}ms ` +
      `max=${measurement.max.toFixed(2)}ms | ${measurement.controlId} p95=${measurement.controlP95.toFixed(2)}ms ` +
      `| ratio=${measurement.ratio.toFixed(3)}`
  );
}

await archiveReport(report);

if (gatingDisabled) {
  // 冻结跑的就是「还没有 reference」那一刻的场景，而 reference 文件此刻可能已经存在
  // （重新冻结）。不跳过的话，第一次跑就会拿旧 reference 判定新基线——正是 §3.1 禁止的
  // 「失败后重算基线」的镜像。
  console.log('\n[bench:working-tree] --no-gate：只产出数字，不做门禁判定。');
  process.exit(0);
}

const decision = decideRelativeGate(references, report.environment.ratioProfile, report.measurements);
if (decision.kind === 'unfrozen') {
  console.log(
    '\n[bench:working-tree] 还没有冻结的 reference（reports/working-tree-reference/）——' +
      '本次只产出数字，不做门禁判定。冻结用 benchmarks/freeze-working-tree-reference.ts。'
  );
  process.exit(0);
}
if (decision.kind === 'mismatch') {
  printProfileMismatch(decision);
  console.log('\n[bench:working-tree] 总判定：✗ FAIL');
  process.exit(1);
}

printRelativeVerdicts(decision.verdicts);
const relativePassed = decision.passed;
const absolutePassed =
  releaseMode ? evaluateAbsoluteGate(report.measurements, decision.reference, report.environment) : true;
if (!releaseMode) console.log('\n[bench:working-tree] 绝对门禁未评估（非 --release）。');

const overall = relativePassed && absolutePassed;
console.log(`\n[bench:working-tree] 总判定：${overall ? '✓ PASS' : '✗ FAIL'}`);
if (!overall) process.exit(1);
