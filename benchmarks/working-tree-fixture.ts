/**
 * @fileoverview T094 —— 工作树 benchmark 的固定 fixture（contracts/benchmark-report.md §1）。
 *
 * @remarks
 * 形状由契约钉死，不是可调参数：10,000 实体 / 100 commit（每 commit 100 单元）/
 * 当前工作树 100 个未提交单元。
 *
 * **为什么 fixture 要有内容 hash，而不是只记行数。** 契约 §1 的原话是「只固定总行数不算
 * 固定 fixture——行数相同而内容分布不同会让 ratio 漂移几十个百分点，且看不出来」。
 * 一份「10,000 行、每行 title 3 个字符」的库和一份「10,000 行、每行 title 300 个字符」的库
 * 行数一模一样，而 diff 要搬的字节差两个数量级。于是这里把**将要写进库的每一个值**摊进
 * 一份规划（{@link WorkingTreeFixturePlan}），再对规划整体取 SHA-256——报告里的
 * `fixture.contentHash` 就是它。
 *
 * **规划是纯的，先于数据库存在。** 建库、写入、提交都读同一份规划，因此「这次跑的是不是
 * 同一份 fixture」可以在一次数据库调用都没发生之前回答。反过来写（先建库、再从库里算
 * hash）的话，hash 变了只能说明「库不一样」，说不出是 fixture 改了还是实现写坏了。
 *
 * **随机但不随时间变。** 全部内容出自一个固定种子的 mulberry32，跑十次得到同一串字节
 * ——这正是 T097 的「10 次独立运行取 median ratio」能成立的前提：十次运行的 contentHash
 * 必须相等，否则十个中位数来自十份不同的库，取中位数没有意义。`Math.random()` 与
 * `Date.now()` 一个都不许出现在内容里（库名里可以，那不是内容）。
 *
 * **实体 id 也是确定的。** `EntityBase.id` 声明成 `PropertyType.uuid`，PGlite 会把它建成
 * Postgres 的 `uuid` 列并在插入时校验格式，所以种子产出的不是任意字符串而是形状合法的
 * v4 UUID。让 id 随机的话，同一份规划在两次运行里会落到不同的 B-tree 位置上，而索引局部性
 * 恰恰是 status / diff 在测的东西之一。
 *
 * 唯一不进 hash 的是 `createdAt` / `updatedAt` / `createdBy` / `updatedBy` 这四个簿记列：
 * 前两个由框架按墙钟生成，任何一次运行都不可能复现上一次的值。它们的**长度**恒定
 * （ISO 串 / 固定用户名），因此不改变要搬的字节数——这是排除它们的理由，不是让步。
 *
 * 运行环境固定为 Node + PGlite **memory**（契约 §1）：不选盘上后端，是因为绝对数字一旦
 * 掺进磁盘抖动就没法在 CI 上比。
 *
 * @see docs/working-tree/contracts/benchmark-report.md
 */

import { createHash } from 'node:crypto';

import type { UUID } from '@aiao/rxdb';
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import type { CommitOptions, WorkingTreeCredentials } from '@aiao/rxdb-plugin-working-tree';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import {
  ConformanceNote,
  WORKING_TREE_CONFORMANCE_ENTITIES,
  WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER,
  WORKING_TREE_CONFORMANCE_USER_ID
} from '@aiao/rxdb-plugin-working-tree/testing';
import { firstValueFrom } from 'rxjs';

// ---------------------------------------------------------------------------
// 契约钉死的形状
// ---------------------------------------------------------------------------

/** 实体总数（契约 §1） */
export const FIXTURE_ENTITIES = 10_000;

/** 提交总数（契约 §1） */
export const FIXTURE_COMMITS = 100;

/** 每个 commit 的变更单元数（契约 §1）；乘积恰为 {@link FIXTURE_ENTITIES} */
export const FIXTURE_UNITS_PER_COMMIT = 100;

/** 建完 fixture 后停留在工作树里的未提交单元数（契约 §1） */
export const FIXTURE_UNCOMMITTED_UNITS = 100;

/** 每条 `title` 的字符数；恒定，于是 patch 的字节数不随内容漂移 */
export const FIXTURE_TITLE_LENGTH = 40;

/** 每条非空 `body` 的字符数 */
export const FIXTURE_BODY_LENGTH = 120;

/** `title` 头部留给轮次编号的字符数，见 {@link fixtureUpdateTitle} */
export const FIXTURE_REVISION_SLOT = 4;

/**
 * 内容种子。
 *
 * @remarks
 * 改它等于换一份 fixture：`contentHash` 会变，冻结的 reference 不再可比。此时契约 §3.1
 * 要求重新冻结 reference，而不是拿新 fixture 的 ratio 去撞旧阈值。
 */
export const FIXTURE_SEED = 0x5f3a91c7;

/** 提交作者；落进不可变历史的 `Commit.author` */
const FIXTURE_AUTHOR_ID = 'benchmark-author';

// ---------------------------------------------------------------------------
// 确定性内容生成
// ---------------------------------------------------------------------------

/**
 * mulberry32：32 位状态的确定性 PRNG。
 *
 * @param seed - 初始状态
 * @returns 每次调用返回 `[0, 1)` 区间内的下一个数
 *
 * @remarks
 * 选它而不是 `Math.random()` 的理由只有一条：后者不可复现，而契约要求十次运行跑的是同一份
 * fixture。选它而不是加密级 PRNG，则是因为这里要的是「可复现的分布」而不是不可预测性。
 */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

/** 正文字符集：只用 ASCII，免得多字节编码差异混进「要搬多少字节」这个量里。 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789 ';

/** 生成固定长度的确定性文本；`charAt` 而不是下标取字符，返回类型才是 `string`。 */
const text = (next: () => number, length: number): string => {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET.charAt(Math.floor(next() * ALPHABET.length));
  return out;
};

/** 生成 `length` 个确定性十六进制字符。 */
const hex = (next: () => number, length: number): string => {
  let out = '';
  for (let i = 0; i < length; i++) out += Math.floor(next() * 16).toString(16);
  return out;
};

/** UUID 变体位的合法取值。 */
const UUID_VARIANTS = '89ab';

/**
 * 生成一个形状合法的 v4 UUID。
 *
 * @param next - PRNG
 * @returns 形如 `xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx` 的 `UUID`
 *
 * @remarks
 * 版本位 `4` 与变体位必须对：`id` 在 PGlite 上是真的 `uuid` 列，插入时走 `string_to_uuid`
 * 校验，形状不对整份 fixture 在第一行就崩。
 */
const uuidFrom = (next: () => number): UUID => {
  const variant = UUID_VARIANTS.charAt(Math.floor(next() * UUID_VARIANTS.length));
  return `${hex(next, 8)}-${hex(next, 4)}-4${hex(next, 3)}-${variant}${hex(next, 3)}-${hex(next, 12)}`;
};

// ---------------------------------------------------------------------------
// 规划
// ---------------------------------------------------------------------------

/** 一行业务数据的全部可写内容。 */
export interface FixtureNotePlan {
  /** 主键；确定性 v4 UUID。用 `UUID` 而不是 `string`：`repository.get()` 只收前者 */
  readonly id: UUID;

  /** tracked 列；长度恒为 {@link FIXTURE_TITLE_LENGTH} */
  readonly title: string;

  /** 可空的 tracked 列；约五分之一为 `null`，让 patch 大小有分布而不是恒定 */
  readonly body: string | null;
}

/** 一次提交要写的 100 行，以及它的提交信息。 */
export interface FixtureCommitPlan {
  /** 第几次提交，从 0 起 */
  readonly index: number;

  /** 提交信息 */
  readonly message: string;

  /** 本次提交写入的行；长度恒为 {@link FIXTURE_UNITS_PER_COMMIT} */
  readonly notes: readonly FixtureNotePlan[];
}

/**
 * 停在工作树里的一次未提交更新。
 *
 * @remarks
 * 只有 `titleSuffix` 而没有完整的 `title`：真正写进库的标题由
 * {@link fixtureUpdateTitle} 把轮次编号拼在前面组成。这样规划里的每一个字节都是会被写进
 * 库的字节，反过来说——库里出现的每一个字节也都来自规划加上一个显式的轮次号。
 */
export interface FixtureUpdatePlan {
  /** 被改的行；一定是某次提交里已经写过的行 */
  readonly id: UUID;

  /** 标题的后 36 个字符；前 4 个字符是轮次槽 */
  readonly titleSuffix: string;

  /** 改后的 `body` */
  readonly body: string | null;
}

/**
 * 一份完整的 fixture 规划：写进库之前就已经完全确定。
 *
 * @remarks
 * 报告 JSON 的 `fixture` 段（契约 §2）直接由前五个字段构成。
 */
export interface WorkingTreeFixturePlan {
  /** 实体总数 */
  readonly entities: number;

  /** 提交总数 */
  readonly commits: number;

  /** 每次提交的单元数 */
  readonly unitsPerCommit: number;

  /** 未提交单元数 */
  readonly uncommittedUnits: number;

  /** 内容 hash；**不是**行数的 hash，见本文件头 */
  readonly contentHash: string;

  /** 生成种子，写进报告以便复现 */
  readonly seed: number;

  /** 100 次提交，数组顺序即写入顺序 */
  readonly commitPlans: readonly FixtureCommitPlan[];

  /** 100 个未提交更新 */
  readonly uncommittedUpdates: readonly FixtureUpdatePlan[];
}

/**
 * 某一轮里真正写进 `title` 的字符串。
 *
 * @param update - 更新规划
 * @param revision - 轮次，从 0 起
 * @returns 长度恒为 {@link FIXTURE_TITLE_LENGTH} 的标题
 * @throws `Error` 轮次超出四位 base36 能表示的范围
 *
 * @remarks
 * **轮次号必须在，而且必须不改变长度。** 采样 `commit` 时每个 sample 都要一份「与已提交
 * 状态确实不同」的工作树：把同一批 title 原样再写一遍的话，第二轮起捕获会折叠成零个单元，
 * 下一次 `commit()` 直接抛 `empty_commit`，而那是被测实现在正确工作时的行为——门禁会把
 * 它读成 fixture 坏了。反过来，把轮次号**追加**在尾部会让第 1000 轮的 patch 比第 0 轮多
 * 几个字节，于是 ratio 随采样序号缓慢上移。占一个定长槽两件事同时成立。
 */
export const fixtureUpdateTitle = (update: FixtureUpdatePlan, revision: number): string => {
  const slot = revision.toString(36).padStart(FIXTURE_REVISION_SLOT, '0');
  if (slot.length > FIXTURE_REVISION_SLOT)
    throw new Error(`fixture 轮次 ${revision} 超出 ${FIXTURE_REVISION_SLOT} 位槽`);
  return `${slot}${update.titleSuffix}`;
};

/**
 * 对规划的**内容**取 SHA-256。
 *
 * @param commitPlans - 100 次提交的全部行
 * @param uncommittedUpdates - 100 个未提交更新
 * @returns 64 位十六进制摘要
 *
 * @remarks
 * 按数组顺序喂而不是序列化成对象：数组顺序就是写入顺序，而写入顺序影响页分布，属于内容的
 * 一部分。用对象的话键序由引擎决定，同一份 fixture 在两个 Node 版本上可能算出两个 hash
 * ——门禁会把它读成「fixture 变了」。
 *
 * `null` 写成 `<null>` 而不是空串：`<` 不在 {@link ALPHABET} 里，因此这个记号不可能与
 * 一个真实的 body 撞上，「没有正文」和「正文是空串」在摘要里保持可分。
 */
const hashPlan = (
  commitPlans: readonly FixtureCommitPlan[],
  uncommittedUpdates: readonly FixtureUpdatePlan[]
): string => {
  const digest = createHash('sha256');
  const bodyOf = (body: string | null): string => (body === null ? '<null>' : body);
  for (const commit of commitPlans) {
    digest.update(`C ${commit.index} ${commit.message}\n`);
    for (const note of commit.notes) digest.update(`N ${note.id} ${note.title} ${bodyOf(note.body)}\n`);
  }
  for (const update of uncommittedUpdates) {
    digest.update(`U ${update.id} ${update.titleSuffix} ${bodyOf(update.body)}\n`);
  }
  return digest.digest('hex');
};

/**
 * 造一份 fixture 规划。纯函数，一次数据库调用都不发。
 *
 * @returns 见 {@link WorkingTreeFixturePlan}
 * @throws `Error` 契约常数之间互相矛盾，或取样步长把下标算飞
 *
 * @remarks
 * 未提交的 100 个更新**跨整个 10,000 行等距取样**（步长 `entities / uncommittedUnits`），
 * 不取最后 100 行：最后写入的那 100 行此刻还躺在最热的页上，只改它们会把 diff 测成
 * 「全在缓存里」，而真实用户改的行散落在整张表里。
 */
export const buildWorkingTreeFixturePlan = (): WorkingTreeFixturePlan => {
  if (FIXTURE_COMMITS * FIXTURE_UNITS_PER_COMMIT !== FIXTURE_ENTITIES) {
    throw new Error(`fixture 常数矛盾：${FIXTURE_COMMITS} × ${FIXTURE_UNITS_PER_COMMIT} ≠ ${FIXTURE_ENTITIES}`);
  }

  const next = mulberry32(FIXTURE_SEED);
  const commitPlans: FixtureCommitPlan[] = [];
  const allNotes: FixtureNotePlan[] = [];

  for (let index = 0; index < FIXTURE_COMMITS; index++) {
    const notes: FixtureNotePlan[] = [];
    for (let unit = 0; unit < FIXTURE_UNITS_PER_COMMIT; unit++) {
      const note = {
        id: uuidFrom(next),
        title: text(next, FIXTURE_TITLE_LENGTH),
        body: next() < 0.2 ? null : text(next, FIXTURE_BODY_LENGTH)
      };
      notes.push(note);
      allNotes.push(note);
    }
    commitPlans.push({ index, message: `fixture commit ${index}: ${text(next, 24)}`, notes });
  }

  const stride = Math.floor(FIXTURE_ENTITIES / FIXTURE_UNCOMMITTED_UNITS);
  const uncommittedUpdates: FixtureUpdatePlan[] = [];
  for (let i = 0; i < FIXTURE_UNCOMMITTED_UNITS; i++) {
    const cursor = i * stride;
    if (cursor >= allNotes.length) throw new Error(`fixture 取样越界：第 ${cursor} 行不存在`);
    uncommittedUpdates.push({
      id: allNotes[cursor].id,
      titleSuffix: text(next, FIXTURE_TITLE_LENGTH - FIXTURE_REVISION_SLOT),
      body: next() < 0.2 ? null : text(next, FIXTURE_BODY_LENGTH)
    });
  }

  return {
    entities: FIXTURE_ENTITIES,
    commits: FIXTURE_COMMITS,
    unitsPerCommit: FIXTURE_UNITS_PER_COMMIT,
    uncommittedUnits: FIXTURE_UNCOMMITTED_UNITS,
    contentHash: hashPlan(commitPlans, uncommittedUpdates),
    seed: FIXTURE_SEED,
    commitPlans,
    uncommittedUpdates
  };
};

// ---------------------------------------------------------------------------
// 落库
// ---------------------------------------------------------------------------

/**
 * 建一个已启用工作树能力的 PGlite memory 库。
 *
 * @returns 已 `connect()` 且 `workingTree.enable()` 过的实例
 *
 * @remarks
 * 实体清单、远端占位适配器名与 `context.userId` 全部复用 `@aiao/rxdb-plugin-working-tree/testing` 那一份：
 * benchmark 自己再声明一套实体的话，测的就不是一致性套件跑过的那条路径了。
 *
 * **四个 `use()` 与捕获侧调用点逐条对齐**（`rxdb-adapter-pglite/src/__tests__/working-tree-capture-conformance.spec.ts`），
 * 顺序也一样。它们不是「顺手多装几个」：`WORKING_TREE_CONFORMANCE_ENTITIES` 里的
 * `ConformanceCache` 声明了 `SyncType.QueryCache`，核心的护栏查的是**注册清单**而不是
 * 运行期有没有真的走到，缺 querycache 引擎时 `connect()` 当场抛 `RxDBMissingPluginError`；
 * sync 插件又声明了 `inject: ['plugin:history']`，缺历史插件时宿主**只告警一次、不装它**，
 * 于是症状会伪装成「装了 sync 却报缺 sync」。benchmark 自己缩减实体清单能绕开这三个，
 * 代价是测的不再是一致性套件跑过的那条捕获路径——那正是上一段拒绝的做法。
 *
 * 全部排在 `connect()` **之前**：贡献系统能力的插件晚于 `init()` 注册会被核心当场拒绝
 * （10 张系统表随建表一次建出，那时已经来不及），而 `connect()` 的第一步就是 `init()`。
 *
 * 库名带时间戳与随机后缀——那是**标识**不是内容，不进 `contentHash`；同一次运行里连开两个
 * 库时它们必须互不覆盖。
 */
export const createWorkingTreeFixtureDatabase = async (): Promise<RxDB> => {
  const database = new RxDB({
    dbName: `working-tree-bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    context: { userId: WORKING_TREE_CONFORMANCE_USER_ID },
    entities: [...WORKING_TREE_CONFORMANCE_ENTITIES],
    sync: {
      local: { adapter: 'pglite' },
      remote: { adapter: WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER },
      type: SyncType.None
    }
  });
  database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  database.use(rxDBPluginWorkingTree);
  database.use(rxDBPluginQueryCache);
  database.use(rxDBPluginSync);
  database.use(rxDBPluginHistory);
  await database.connect('pglite');
  await database.workingTree.enable();
  return database;
};

/**
 * 读当前三个捕获位，凑一组调用方凭据。
 *
 * @param database - 已启用工作树的库
 * @returns 见 `WorkingTreeCredentials`
 *
 * @remarks
 * 硬裁决 3：commit 用的是**调用方捕获**的 CAS，不是命令自己在事务里现读的值。因此这里
 * 如实走一次 `status()` 取三个位，而不是从上一次命令的返回值里推算——推算出来的值在并发下
 * 会对，在实现写错时也会对。
 */
export const captureFixtureCredentials = async (database: RxDB): Promise<WorkingTreeCredentials> => {
  const status = await database.workingTree.status();
  return {
    expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
    expectedHeadRevision: status.headRevision,
    expectedWorkingTreeRevision: status.workingTreeRevision
  };
};

/**
 * 把凭据补齐成一次提交的 `CommitOptions`。
 *
 * @param database - 已启用工作树的库
 * @param operationId - 调用方操作 id；同一次逻辑提交的重试必须带同一个值
 * @returns 见 `CommitOptions`
 */
export const fixtureCommitOptions = async (database: RxDB, operationId: string): Promise<CommitOptions> => ({
  ...(await captureFixtureCredentials(database)),
  authorId: FIXTURE_AUTHOR_ID,
  operationId
});

/**
 * 写一行；`id` 由规划给出，于是两次运行落在同一个主键上。
 *
 * @remarks
 * id 经构造函数的 initData 传入而不是建完再赋值：`EntityBase.id` 是 `readonly`，而
 * `@Entity` 增强过的构造函数本来就走「填默认值（`uuid()`）→ 填初始值」两步，第二步正是
 * 给调用方指定主键留的口子。绕过 `readonly` 去写字段则要么被类型拒收，要么得靠一个把
 * 「这个字段其实可写吗」这个问题一起盖掉的断言。
 */
const insertNote = async (database: RxDB, note: FixtureNotePlan): Promise<void> => {
  const row = new ConformanceNote({ id: note.id, title: note.title, body: note.body });
  await database.entityManager.save(row);
};

/**
 * 改一行：读回、改字段、再存。
 *
 * @remarks
 * 必须先读回。`entityManager.save()` 按实例的 local 标记分派 create / update，而一个
 * `new ConformanceNote()` 即使手填了 id 也没有这个标记——直接存会走 INSERT 撞主键。
 * 顺带这也正是真实用户改一行时走的那条路。
 */
const updateNote = async (database: RxDB, update: FixtureUpdatePlan, revision: number): Promise<void> => {
  const repository = database.entityManager.getRepository(ConformanceNote);
  const row = await firstValueFrom(repository.get(update.id));
  row.title = fixtureUpdateTitle(update, revision);
  row.body = update.body;
  await database.entityManager.save(row);
};

/**
 * 把 100 个未提交更新写进工作树。
 *
 * @param database - 已建好历史的库
 * @param plan - 规划
 * @param revision - 轮次；见 {@link fixtureUpdateTitle}
 *
 * @remarks
 * 调用前工作树应当是干净的。本函数不自己检查：两个调用点
 * （{@link seedWorkingTreeFixture} 与 {@link restoreWorkingTreeFixture}）都刚刚确保过，
 * 再查一次只是把同一条断言写两遍。
 */
export const applyUncommittedUnits = async (
  database: RxDB,
  plan: WorkingTreeFixturePlan,
  revision: number
): Promise<void> => {
  for (const update of plan.uncommittedUpdates) await updateNote(database, update, revision);
};

/**
 * 按规划建出整份 fixture：100 次提交 + 100 个未提交单元。
 *
 * @param database - 见 {@link createWorkingTreeFixtureDatabase}
 * @param plan - 见 {@link buildWorkingTreeFixturePlan}
 * @throws `Error` 任何一次提交返回 `ok: false`（单线程建库里出现 CAS 冲突只可能是实现缺陷），
 *   或落库的单元数与规划不符
 *
 * @remarks
 * **一次提交 = 一批 100 行的写入。** v1 没有缓存区，`commit()` 提交当前工作树的**全部**
 * 单元（硬裁决 1），所以「每 commit 恰好 100 单元」只能靠「写 100 行就提交一次」达成，
 * 不能先写满 10,000 行再分 100 次提交——后者在 v1 里根本无法表达。
 */
export const seedWorkingTreeFixture = async (database: RxDB, plan: WorkingTreeFixturePlan): Promise<void> => {
  for (const commit of plan.commitPlans) {
    for (const note of commit.notes) await insertNote(database, note);
    const options = await fixtureCommitOptions(database, `fixture-commit-${commit.index}`);
    const result = await database.workingTree.commit(commit.message, options);
    if (!result.ok) throw new Error(`fixture 第 ${commit.index} 次提交冲突：${JSON.stringify(result.conflict)}`);
    if (result.changeSetCount !== plan.unitsPerCommit) {
      throw new Error(
        `fixture 第 ${commit.index} 次提交落了 ${result.changeSetCount} 个单元，应为 ${plan.unitsPerCommit}`
      );
    }
  }
  await applyUncommittedUnits(database, plan, 0);
  await assertFixtureIntact(database, plan);
};

/**
 * 把工作树清空回 clean HEAD：丢弃当前分支上的一切未提交条目。
 *
 * @param database - 已建好 fixture 的库
 * @throws `Error` 丢弃返回 `ok: false`（单线程 benchmark 里出现 CAS 冲突只可能是实现缺陷）
 *
 * @remarks
 * 两个调用点各要它的一半：{@link restoreWorkingTreeFixture} 拿它当「写新一轮单元之前先
 * 清场」，而 `restore` 测点拿它当**被测项自己的前置**——契约 §3.2 给 `restore` 的口径是
 * 「从 clean HEAD 恢复 `HEAD~1`」，工作树不空时 `restore()` 会直接被
 * `dirty_working_tree` 拒掉，量到的就成了一次前置检查的耗时。
 *
 * 丢弃**顺带结束未结束的恢复会话**（US-307 AC5）。`restore` 测点每一轮都会留下一个 active
 * 会话，下一轮靠这一次丢弃清掉；不清的话，第二轮会撞上「一分支至多一个未结束会话」的
 * 唯一索引。
 */
export const clearWorkingTreeFixture = async (database: RxDB): Promise<void> => {
  const credentials = await captureFixtureCredentials(database);
  const discarded = await database.workingTree.discard(credentials);
  if (!discarded.ok) throw new Error(`fixture 清场时丢弃冲突：${JSON.stringify(discarded.conflict)}`);
};

/**
 * 每个 sample 前在**计时外**把工作树恢复到同一状态（契约 §1「恢复时机」）。
 *
 * @param database - 已建好 fixture 的库
 * @param plan - 规划
 * @param revision - 这一轮要写的轮次号；见 {@link fixtureUpdateTitle}
 * @throws `Error` 丢弃返回 `ok: false`
 *
 * @remarks
 * 恢复的是**工作树**，不是整个库：历史不可变，v1 也不提供删除历史的 API。对 `status` /
 * `diff` 两项被测项这就是完整的恢复——它们读的是「HEAD ↔ 工作树」这一条轴，而轴的两端
 * 每轮都一样。
 *
 * 对 `commit` 不是：提交会往历史里压一层，第 n 个 sample 面对的历史比第 0 个深 n 层。
 * 这一点由 `working-tree.bench.ts` 如实记进报告，而不是在这里假装恢复成了「第 100 次提交
 * 时」的样子——能消掉这层漂移的唯一办法是每个 sample 重建整库，而那是 10,000 行插入乘以
 * 采样数。轮次号保证每轮的 100 个单元确实与已提交状态不同，见 {@link fixtureUpdateTitle}。
 */
export const restoreWorkingTreeFixture = async (
  database: RxDB,
  plan: WorkingTreeFixturePlan,
  revision: number
): Promise<void> => {
  await clearWorkingTreeFixture(database);
  await applyUncommittedUnits(database, plan, revision);
};

/**
 * 建完之后验一遍库真的长成规划的样子。
 *
 * @param database - 待验的库
 * @param plan - 规划
 * @throws `Error` 未提交单元数或历史深度与规划不符
 *
 * @remarks
 * 不验这一下的话，一个「提交时静默少写了一个单元」的实现会让整条 ratio 曲线变快，而门禁
 * 看到的只是「性能变好了」。
 *
 * 数的是 `kind === 'normal'` 而不是历史总深度：`enable()` 会给每条本地可完整物化的分支补一个
 * `baseline` 根节点（FR-021/049），于是 `listCommits()` 返回的是 1 + 100 条。按总深度断言的话
 * 这里恒红，而把期望值改成 101 等于把「根节点有几个」这件事悄悄钉进 benchmark——将来
 * `branch_baseline` 多一个，红的会是 fixture 而不是改动本身。
 *
 * 不传 `limit`：读整条可达历史，于是「多出来的 normal 提交」同样会被数出来。限长只能发现少写。
 */
export const assertFixtureIntact = async (database: RxDB, plan: WorkingTreeFixturePlan): Promise<void> => {
  const status = await database.workingTree.status();
  if (status.entryCount !== plan.uncommittedUnits) {
    throw new Error(`fixture 工作树有 ${status.entryCount} 个未提交单元，应为 ${plan.uncommittedUnits}`);
  }
  const log = await database.workingTree.listCommits();
  const normalCount = log.entries.filter(entry => entry.kind === 'normal').length;
  if (normalCount !== plan.commits) {
    throw new Error(
      `fixture 有 ${normalCount} 次用户提交（历史共 ${log.entries.length} 个节点），应为 ${plan.commits}`
    );
  }
};
