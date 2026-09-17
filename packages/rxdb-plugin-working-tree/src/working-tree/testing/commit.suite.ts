/**
 * @fileoverview `workingTreeCommitConformanceSuite` —— 提交侧一致性套件。
 *
 * @remarks
 * 覆盖范围见 `specs/001-working-tree-commits/contracts/conformance-suites.md` §2：
 * commit 图与 HEAD 持久化、一次性启用迁移、两类 CAS 分开断言、commit 原子性、
 * 损坏守卫三入口、restore、分支隔离与跨 realm 冲突。
 *
 * US-305 的 commit 图与迁移断言**并入本套件**，不另起第三个套件名——第三个名字会让
 * 「哪套是权威」重新变成开放问题。
 *
 * **T042 填入 §2.1 / §2.2 / §2.5，T085 补上 §2.3 / §2.4**（两类 CAS 分开断言、commit
 * 原子性），**T108 补上 §2.6**（restore），§2.7 在 US-308（T122）填。
 *
 * §2.3 / §2.4 要演的是「另一个 Tab 存了一下」与「高并发普通 CRUD」，而本套件**不走
 * `entity.save()`**，走的是 `save()` 最终落到的那个原语 `captureChanges()`——换一条更浅的
 * 路径（比如直接 INSERT 一行 `WorkingTreeEntry`）会绕开 `bumpWorkingTreeRevision()` 那个
 * 读改写，而它正是「第二类 CAS」本身。
 *
 * **六个调用点只注册 {@link ConformanceNote} 一个业务实体，而且一次都不写它。** 注册的理由
 * 在 FR-038：`writeCommit` 会拿每个变更单元的 `namespace` / `entity` 去 `schemaManager` 解析
 * 目标元数据（要知道哪几列是加密列），解析不到就 fail-closed 地抛
 * （`commit/commit-codec.ts` 的 `assertCommitUnitsEncryptedAtRest`）。所以套件里全部单元的
 * 身份都取自那个真注册过的实体（{@link UNIT_TARGET}）——继续手写 `conformance.Note` 这种
 * 字面量，六个调用点会一起撞在那条 fail-closed 上，而那正是生产里「提交一个没注册的实体」
 * 应有的下场。捕获侧清单里的另一个实体（声明了 `SyncType.QueryCache` 的那个）**不注册**：
 * 它会连带要求三个插件与一个远端适配器名，而提交侧一条断言都用不到它。
 *
 * **§2.2 有两条断言不在这里，是有理由的，不是遗漏。**「注入任一分支初始化失败 → 整条迁移
 * 回滚」与「未启用的数据库行为与未安装本特性逐字节一致（FR-046）」说的都是**启用之前**的
 * 状态，而 {@link WorkingTreeConformanceSuiteContext} 契约上交还的是一个**已启用**的库。
 * 要在这里断言它们，只能先把库改回未启用态——那测的就不再是适配器行为，而是套件自己伪造
 * 出来的中间态。两条分别落在 `src/__tests__/system/working-tree-commits-migration.spec.ts`
 * （用例「任一分支初始化失败时错误穿出 `up()`，不被吞掉」）与
 * `src/__tests__/commit/legacy-compat.spec.ts`，本套件不重复。
 *
 * 那条回滚用例的**判据是 `__rxdb_capability__:workingTree:…` 那一行认领行不留下**，不是核心的
 * `RXDB_SYSTEM_SCHEMA_VERSION`：抽包之后本包的迁移一步都不动核心的系统 schema 号（它归核心，
 * 今天在 6）。契约 §2.2 一度把判据写成「那个号停在 3」，已随抽包一并更正——两处说的始终是
 * 同一件事「没落地就不认领」，只是认领物从核心的号变成了本包自己的行。
 *
 * **每条用例一个全新数据库。** 契约 §0 明说工厂每次返回全新实例，套件内共享实例会让上一条
 * 用例的残留变成下一条的隐藏前置；本套件里「注入一条父链成环的分支」这种用例更是会把库
 * 弄脏到不能复用。契约里没有 teardown 钩子，所以代价（6 个后端 × 十余条用例各建一次库）
 * 只能接受，不能靠共享实例省掉。
 *
 * @module @aiao/rxdb-plugin-working-tree/testing
 */

import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import type { IRxDBAdapter, RxDB, RxDBAdapterLocalBase, TransactionExecutor } from '@aiao/rxdb';
import { getEntityMetadata, RxDBBranch, RxDBChange, uuid } from '@aiao/rxdb';
import type { CommitChangeUnitContent } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { createCommitWriteContext } from '../../commit/commit-context.js';
import {
  assertCommitGraphIntact,
  CommitGraphCorruptedError,
  markBranchCorrupted
} from '../../commit/commit-graph-guard.js';
import { Commit } from '../../commit/commit.entity.js';
import { BranchNotMaterializableError } from '../../commit/enable-migration.js';
import { getCommitDetail, listCommits, readCommitBranchRef } from '../../commit/list-commits.js';
import type { WriteCommitOutcome } from '../../commit/write-commit.js';
import { writeCommit } from '../../commit/write-commit.js';
import * as workingTreePublicSurface from '../../index.js';
import type { ChangeCaptureSource } from '../capture-runtime.js';
import { captureChanges, readActiveBranchToken } from '../capture-runtime.js';
import type { CommitResult } from '../commit-command.js';
import { commitWorkingTree } from '../commit-command.js';
import type { WorkingTreeCredentials } from '../commit-conflict.js';
import { discardWorkingTree } from '../discard-command.js';
import type { WorkingTreeRestoreResult } from '../restore-command.js';
import { readActiveRestoreSession, restoreWorkingTree } from '../restore-command.js';
import type { WorkingTreeStatus } from '../status.js';
import { assertWorkingTreeEntryCountIntact, readWorkingTreeStatus } from '../status.js';
import { WorkingTreeEntry } from '../working-tree-entry.entity.js';
import { WorkingTreeManager } from '../working-tree-facade.js';
import { WorkingTreeRestoreSession } from '../working-tree-restore-session.entity.js';
import { WorkingTreeState } from '../working-tree-state.entity.js';
import { ConformanceNote } from './conformance-entities.js';
import type { WorkingTreeConformanceSuiteContext } from './suite-context.js';

/**
 * 一个损坏守卫的调用入口。
 *
 * @remarks
 * §2.5 要求 `commit()` / `restore()` / switch-to **三条入口各自**给出同一个结论。写成
 * 一张表而不是三段复制的断言，是因为三段复制里漏掉一条不会有任何编译错误——那一条
 * 入口就此裸奔。T085（`commit()`）/ T108（`restore()`）/ T122（switch-to）各自往这张表里
 * 加一行，下面那四条断言自动覆盖到新入口。
 *
 * 表里第一行是三条入口共用的那份守卫本身（T038）：先把它的行为钉死，后加的入口只需证明
 * 「确实调了它」。今天还有 `commit()`（T085）与 `restore()`（T108）两行，switch-to 那行
 * 等 T122。
 */
interface CommitCorruptionEntryPoint {
  /** 入口名，进 `it` 标题，让失败输出能直接定位到是哪条入口 */
  readonly name: string;

  /** 在调用方自己的写事务内跑这条入口；命中损坏时必须拒绝 */
  readonly invoke: (context: CommitCorruptionEntryContext) => Promise<void>;
}

/**
 * 跑一条损坏守卫入口要的全部上下文。
 *
 * @remarks
 * 收成一个对象而不是三个位置形参：只用得上 `executor` 的那一行不必给 `database` 编一个
 * 下划线形参，而 T108 / T122 往表里加行时也不用再改一次签名——签名每动一次，已经写好的
 * 那几行都得跟着改，而「不用改已有的行」正是这张表存在的理由。
 */
interface CommitCorruptionEntryContext {
  /** 本条用例的数据库 */
  readonly database: RxDB;

  /** 开出 {@link CommitCorruptionEntryContext.executor} 的那个本地适配器 */
  readonly adapter: IRxDBAdapter & RxDBAdapterLocalBase;

  /** 调用方那个写事务的执行器 */
  readonly executor: TransactionExecutor;

  /** 目标分支 */
  readonly branchId: string;
}

/** 取当前库的本地适配器；提交上下文与写事务都从它来。 */
const localAdapterOf = (database: RxDB): Promise<IRxDBAdapter & RxDBAdapterLocalBase> =>
  firstValueFrom(database.localAdapter$);

/**
 * 开一个写事务跑一段命令体，语义与门面 `runEnabled()` 走的是同一条路。
 *
 * @remarks
 * 适配器一并交给命令体，与门面 `WorkingTreeManager.#runInTransaction` 同形：提交路径要的
 * {@link createCommitWriteContext} 是从适配器建出来的，而在命令体里重新订阅一次
 * `localAdapter$` 可能拿到**另一个纪元**的实例——那时上下文与事务就不属于同一个库了。
 */
const withTransaction = async <T>(
  database: RxDB,
  run: (executor: TransactionExecutor, adapter: IRxDBAdapter & RxDBAdapterLocalBase) => Promise<T>
): Promise<T> => {
  const adapter = await localAdapterOf(database);
  return adapter.transaction(async executor => run(executor, adapter));
};

/**
 * 断言这个 promise 被拒绝，并把拒因原样交出来。
 *
 * @remarks
 * 不用 `rejects.toThrow(...)`：那条断言只看得到错误文案，而本套件要断言的是**判别位**
 * （`reason` / `code` / 构造器）。文案是会被改的，判别位不是。
 */
const captureRejection = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    resolved => {
      throw new Error(`期望这次调用被拒绝，实际返回了 ${String(resolved)}`);
    },
    (caught: unknown) => caught
  );

/** 把一行 commit 摊成一个可比较的串；`createdAt` 一并进来，时间被改写也算改动。 */
const commitSignatureOf = (row: Commit): string =>
  JSON.stringify({
    parentIds: row.parentIds,
    firstParentId: row.firstParentId,
    kind: row.kind,
    message: row.message,
    author: row.author,
    operationId: row.operationId,
    changeSetCount: row.changeSetCount,
    contentFingerprint: row.contentFingerprint,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)
  });

/** 读 `rxdb_commit` 全表，**不按可达性收窄**：只追加是对全表说的，孤儿行也不许被改。 */
const readAllCommits = async (executor: TransactionExecutor): Promise<Commit[]> =>
  executor.getRepository(Commit).find({ where: { combinator: 'and', rules: [] } });

/** 读 `rxdb_commit_branch_ref` 全表。 */
const readAllRefs = async (executor: TransactionExecutor): Promise<CommitBranchRef[]> =>
  executor.getRepository(CommitBranchRef).find({ where: { combinator: 'and', rules: [] } });

/** 全表快照：commit id → 内容签名。 */
const snapshotCommits = async (executor: TransactionExecutor): Promise<Map<string, string>> => {
  const rows = await readAllCommits(executor);
  return new Map(rows.map(row => [row.id, commitSignatureOf(row)]));
};

/**
 * 断言两份快照之间只发生过追加。
 *
 * @remarks
 * 一次比较同时盖住 UPDATE（签名变了）与 DELETE（新快照里取不到）：分成两条断言写，
 * 「行没了」会先被「签名不等」报出来，成因反而看不清。
 */
const expectAppendOnly = (before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): void => {
  const changed = [...before.keys()].filter(id => after.get(id) !== before.get(id));
  expect(changed, '既有 commit 行被 UPDATE 或 DELETE 了').toEqual([]);
};

/**
 * 套件里全部变更与变更单元共用的目标实体身份。
 *
 * @remarks
 * 取自真注册进库的那个实体，理由见本文件 fileoverview 第三段。读类上的装饰器元数据而不是
 * 抄一份 `{ namespace: 'public', name: 'ConformanceNote' }`：`namespace` 的缺省值由核心的
 * `transitionMetadata()` 填，抄一份就等于把那个缺省值复制到了一个改不动核心时不会跟着走的
 * 地方。
 */
const UNIT_TARGET = getEntityMetadata(ConformanceNote);

/** 造一个变更单元；同一条用例里要复用的那份必须建一次、传两遍（指纹依赖 `unitId`）。 */
const buildUnit = (overrides: Partial<CommitChangeUnitContent> = {}): CommitChangeUnitContent => ({
  unitId: uuid(),
  transactionId: null,
  namespace: UNIT_TARGET.namespace,
  entity: UNIT_TARGET.name,
  entityId: 'note-1',
  operation: 'update',
  patch: { title: '改后' },
  inversePatch: { title: '改前' },
  origin: 'local',
  ...overrides
});

/** 读当前激活分支的 id。 */
const readActiveBranchId = async (database: RxDB): Promise<string> =>
  withTransaction(database, async executor => {
    const branches = await executor.getRepository(RxDBBranch).find({ where: { combinator: 'and', rules: [] } });
    // `activated` 在 JS 侧过滤而不是下推进 WHERE：布尔字面量在六个后端上写法不一，
    // 下推等于让套件自己长出后端分支。
    const active = branches.find(branch => branch.activated);
    if (!active) throw new Error('这个库没有激活分支，套件的全部前置都无从谈起');
    return active.id;
  });

/** {@link readRefSnapshot} 交出的那三项；全是原始值，拷完就与库里那一行脱钩。 */
interface CommitBranchRefSnapshot {
  /** 快照那一刻的 HEAD */
  readonly headCommitId: string | null;
  /** 快照那一刻的 HEAD 修订号 */
  readonly headRevision: number;
  /** 快照那一刻的分支健康位 */
  readonly status: CommitBranchRef['status'];
}

/**
 * 读一次分支 ref，并把要断言的那几项**拷成普通对象**。
 *
 * @remarks
 * 一定要拷：`readCommitBranchRef()` 交还的是身份映射里那一行，同一个库上两次读拿到的是
 * **同一个 JS 对象**，而提交路径的 `syncRowsAfterCommit()` 会就地把它推到新值上。于是
 * 「动作前读一行、动作后再读一行、两行对比」这种写法在这里是一句空话——两个变量自始至终
 * 是一个对象，`toEqual` 恒成立，HEAD 真被挪了也照样绿。本套件每一条「HEAD 前后如何」的
 * 断言都走这里，正是为了不留下那种永远不会红的断言。
 */
const readRefSnapshot = async (database: RxDB, branchId: string): Promise<CommitBranchRefSnapshot> => {
  const ref = await withTransaction(database, executor => readCommitBranchRef(executor, branchId));
  return { headCommitId: ref.headCommitId, headRevision: ref.headRevision, status: ref.status };
};

/** 各开一个事务提交一次；`operationId` 与 `units` 由调用方给，重放时原样再传一遍。 */
const commitOnce = async (
  database: RxDB,
  options: { branchId: string; operationId: string; message: string; units: readonly CommitChangeUnitContent[] }
): Promise<WriteCommitOutcome> =>
  withTransaction(database, async (executor, adapter) => {
    const ref = await readCommitBranchRef(executor, options.branchId);
    return writeCommit(executor, createCommitWriteContext(adapter), {
      branchId: options.branchId,
      branchGeneration: ref.generation,
      expectedHeadRevision: ref.headRevision,
      kind: 'normal',
      message: options.message,
      author: 'conformance-suite',
      operationId: options.operationId,
      units: options.units
    });
  });

/** 取一次成功提交的 commit；拿到别的出口就直接炸，免得后续断言在 `undefined` 上继续。 */
const expectCommitted = (outcome: WriteCommitOutcome): Commit => {
  if (outcome.status !== 'committed') throw new Error(`期望本次提交落库，实际出口是 ${outcome.status}`);
  return outcome.commit;
};

/**
 * 注入一条父链自环的本地分支。
 *
 * @returns 注入分支的 id
 *
 * @remarks
 * 用**自环**而不是悬挂 `parentId`：`RxDBBranch` 声明了 `parent` 这条 MANY_TO_ONE 自关联，
 * 悬挂指针在会把它落成数据库级外键的后端上压根插不进去，于是这条用例在一部分后端上测的
 * 是「插入失败」而不是「迁移全有或全无」。自环只需一条 INSERT，任何时刻外键都指向一条
 * 存在的行，而 `find_branch_path_to_root()` 第一步就判出环。
 */
const injectCyclicBranch = async (database: RxDB): Promise<string> => {
  const branchId = `conformance-cycle-${uuid()}`;
  await withTransaction(database, async executor => {
    const branch = database.entityManager.instantiate(RxDBBranch);
    branch.id = branchId;
    branch.parentId = branchId;
    branch.activated = false;
    branch.local = true;
    branch.remote = false;
    branch.fromChangeId = null;
    await executor.saveMany([branch]);
  });
  return branchId;
};

/** 往 `rxdb_change` 里塞一行旧变更，让「删光它」这条断言不是空转。 */
const seedLegacyChange = async (database: RxDB, branchId: string): Promise<void> => {
  await withTransaction(database, async executor => {
    const change = database.entityManager.instantiate(RxDBChange);
    change.id = 900001;
    change.branchId = branchId;
    change.type = 'UPDATE';
    change.namespace = UNIT_TARGET.namespace;
    change.entity = UNIT_TARGET.name;
    change.entityId = 'note-1';
    await executor.saveMany([change]);
  });
};

/** 删光 `rxdb_change`，返回删掉的行数。 */
const deleteAllChanges = async (database: RxDB): Promise<number> =>
  withTransaction(database, async executor => {
    const repository = executor.getRepository(RxDBChange);
    const rows = await repository.find({ where: { combinator: 'and', rules: [] } });
    for (const row of rows) await repository.remove(row);
    return rows.length;
  });

/**
 * 一段真能过适配器那个 at-rest 判定器的信封串。
 *
 * @remarks
 * 分段长度不是随手取的：`@aiao/rxdb-adapter-encrypted` 的 `ENVELOPE_REGEX` 逐段卡死
 * `kid` 11 字符、`iv` 16 字符、`tag` 22 字符（8 / 12 / 16 字节的 base64url）。写成
 * `repeat()` 拼接而不是一串字面量，是为了让「这一段有几个字符」在代码里看得见——
 * 手数字符的写法一旦少一位，断言就悄悄变成恒为 `false`，而它本该是恒为 `true` 的那一半。
 */
const AT_REST_ENVELOPE = ['1', 'AGCM256', 'A'.repeat(11), 'B'.repeat(16), 'C'.repeat(8), 'D'.repeat(22)].join('|');

/** §2.3 第二类 CAS 用例并发发出的普通写笔数；小到不至于把六个后端跑慢，大到能撞上竞态。 */
const CONCURRENT_WRITES = 8;

/** {@link crashOnClear} 注入的那次崩溃；用专门的类是为了让断言认判别位，而不是认文案。 */
class InjectedCommitCrash extends Error {
  constructor() {
    super('注入：commit() 写完 changeSet、正要清空工作树时崩溃');
    this.name = 'InjectedCommitCrash';
    Object.setPrototypeOf(this, InjectedCommitCrash.prototype);
  }
}

/**
 * 把 executor 包一层，让 `commit()` 在「清空工作树」那一步崩掉。
 *
 * @param executor - 真实执行器
 * @returns 除 `removeMany` 之外逐字转发的代理
 *
 * @remarks
 * §2.4 要的注入点是「写完 changeSet **之后**」，而 `commit()` 在那之后做的第一件事就是
 * `executor.removeMany()` 清条目（`working-tree/commit-command.ts` 的 `finishCommit`）。
 * 让这一次调用抛，等于在四步的正中间断电。
 *
 * **不为此在生产代码里开一个「注入故障」的钩子**：那个钩子在真实构建里也会在，而它能做的事
 * 正是这条用例要证明不会发生的事。也不退化成「自己调一遍 `writeCommit()` 再 throw」——
 * 那样测的是事务本身会回滚，而不是 `commit()` 把四步放进了同一个事务：把清条目挪去另一个
 * 事务的实现，在那种写法下照样全绿。
 *
 * 方法逐个 `bind(target)` 而不是把代理当 `receiver` 交回去：`Reflect.get(target, p, proxy)`
 * 会让访问器与私有字段在代理这一侧解析，而六个后端的 executor 实现都带私有字段。
 */
const crashOnClear = (executor: TransactionExecutor): TransactionExecutor =>
  new Proxy(executor, {
    get: (target, property) => {
      if (property === 'removeMany') return () => Promise.reject(new InjectedCommitCrash());
      const value: unknown = Reflect.get(target, property);
      return typeof value === 'function' ? (value as (...args: never[]) => unknown).bind(target) : value;
    }
  });

/** 造一条待捕获的变更日志；内容不重要，能折成一个工作树单元就够。 */
const changeOf = (entityId: string): ChangeCaptureSource => ({
  id: null,
  type: 'UPDATE',
  transactionId: null,
  namespace: UNIT_TARGET.namespace,
  entity: UNIT_TARGET.name,
  entityId,
  patch: { title: '改后' },
  inversePatch: { title: '改前' }
});

/**
 * 在调用方那个事务里走一次**普通业务写**的捕获路径。
 *
 * @param database - 本条用例的数据库，同时充当捕获宿主（它就带着 `entityManager`）
 * @param executor - 调用方那个写事务的执行器
 * @param entityId - 被写的实体主键；同一个 id 会被折叠进同一条条目
 *
 * @remarks
 * 这是 `entity.save()` 最终落到的那个原语（fileoverview 里说的那条）。它会走
 * `bumpWorkingTreeRevision()`——读当前值、`+1`、写回，全在本事务内，**不收任何期望值**。
 * §2.3 的两条断言分别盯着这件事的两面：另一个事务走过它之后，捕获型凭据必须失效；
 * 而它自己在并发下**不得**失败。
 */
const captureOneWrite = async (database: RxDB, executor: TransactionExecutor, entityId: string): Promise<void> => {
  const token = await readActiveBranchToken(executor);
  await captureChanges(executor, database, {
    token,
    unitId: uuid(),
    origin: 'local',
    changes: [changeOf(entityId)],
    shouldCapture: () => true
  });
};

/** 读一次工作树摘要，各开一个事务——这正是调用方捕获那三个位的那一次读。 */
const readStatus = (database: RxDB): Promise<WorkingTreeStatus> => withTransaction(database, readWorkingTreeStatus);

/** 把一次 `status()` 折成 `commit()` 要的三个捕获位。 */
const credentialsOf = (status: WorkingTreeStatus): WorkingTreeCredentials => ({
  expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
  expectedHeadRevision: status.headRevision,
  expectedWorkingTreeRevision: status.workingTreeRevision
});

/** 拿一组捕获位提交一次；每次各开一个事务，与真实调用点同形。 */
const commitWithCredentials = (
  database: RxDB,
  credentials: WorkingTreeCredentials,
  message: string
): Promise<CommitResult> =>
  withTransaction(database, (executor, adapter) =>
    commitWorkingTree(executor, createCommitWriteContext(adapter), message, {
      ...credentials,
      authorId: 'conformance-suite',
      operationId: uuid()
    })
  );

/** 把一次 `commit()` 摊成可直接 `toEqual` 的形状；失败时冲突原样进输出，不塌成一个 `false`。 */
const commitShapeOf = (result: CommitResult): unknown =>
  result.ok ? { ok: true, changeSetCount: result.changeSetCount } : { ok: false, conflict: result.conflict };

/** 数一遍某分支真实的未提交条目行；与 `entryCount` 冗余列对照用。 */
const countEntries = (database: RxDB, branchId: string): Promise<number> =>
  withTransaction(database, executor =>
    executor.getRepository(WorkingTreeEntry).count({
      where: { combinator: 'and', rules: [{ field: 'branchId', operator: '=', value: branchId }] }
    })
  );

/** 数一遍 `rxdb_commit_change_set` 全表行数。 */
const countChangeSets = (database: RxDB): Promise<number> =>
  withTransaction(database, executor =>
    executor.getRepository(CommitChangeSet).count({ where: { combinator: 'and', rules: [] } })
  );

/** 把被拒的并发写摊成可读文案；`toEqual([])` 失败时打出来的就是它。 */
const rejectionsOf = (settled: readonly PromiseSettledResult<unknown>[]): string[] =>
  settled.filter(outcome => outcome.status === 'rejected').map(outcome => String(outcome.reason));

/** 恢复到某个 commit；捕获位由调用方给，与真实调用点同形。 */
const restoreWithCredentials = (
  database: RxDB,
  commitId: string,
  credentials: WorkingTreeCredentials
): Promise<WorkingTreeRestoreResult> =>
  withTransaction(database, (executor, adapter) =>
    restoreWorkingTree(executor, createCommitWriteContext(adapter), { commitId }, credentials)
  );

/**
 * 拿刚读到的捕获位恢复一次，并要求它确实落库。
 *
 * @remarks
 * 后面几条用例断言的全是「恢复之后」的状态，一次被拒的恢复会让它们在一棵空工作树上继续跑，
 * 然后以一堆看不出成因的 `0 !== 1` 结束。在这里就把出口摊开报出来。
 */
const restoreOnce = async (database: RxDB, commitId: string): Promise<WorkingTreeRestoreResult> => {
  const result = await restoreWithCredentials(database, commitId, credentialsOf(await readStatus(database)));
  if (!result.ok) throw new Error(`期望这次恢复落库，实际出口是 ${result.reason}`);
  return result;
};

/**
 * 拿刚读到的捕获位丢弃一次。
 *
 * @remarks
 * 捕获位在**事务外**读完再进去：`readStatus()` 自己要开一个事务，而六个后端里已有一个
 * 写事务在手时再开一个只会等到超时。这也正是真实调用点的形状——用户先看 `status()`，
 * 再决定丢不丢。
 */
const discardWithFreshCredentials = async (database: RxDB): Promise<unknown> => {
  const credentials = credentialsOf(await readStatus(database));
  return withTransaction(database, executor => discardWorkingTree(executor, credentials));
};

/** 读 `rxdb_working_tree_restore_session` 全表；终态行也要数进来，「删掉了没有」全靠它。 */
const readRestoreSessions = (database: RxDB): Promise<WorkingTreeRestoreSession[]> =>
  withTransaction(database, executor =>
    executor.getRepository(WorkingTreeRestoreSession).find({ where: { combinator: 'and', rules: [] } })
  );

/** 把会话行摊成可直接 `toEqual` 的形状：终态转换要盯的恰好是这两列。 */
const sessionShapeOf = (rows: readonly WorkingTreeRestoreSession[]): unknown[] =>
  rows.map(row => ({ status: row.status, activeKey: row.activeKey }));

/** 把一次 `status()` 的两位恢复标志摊出来；两位一起断言，免得「都为真」漏过去。 */
const restoreBitsOf = (status: WorkingTreeStatus): unknown => ({
  restoring: status.restoring,
  conflicted: status.conflicted
});

/** 按 id 在一批 commit 行里找它的 message；找不到就是 `null`。 */
const messageOfCommit = (rows: readonly Commit[], commitId: string | null): string | null =>
  rows.find(row => row.id === commitId)?.message ?? null;

/** 铺一条两节点的历史，返回较老的那个——它就是后面每条用例的恢复目标。 */
const seedTwoCommits = async (database: RxDB, branchId: string): Promise<Commit> => {
  const older = expectCommitted(
    await commitOnce(database, { branchId, operationId: uuid(), message: '被恢复的那一版', units: [buildUnit()] })
  );
  expectCommitted(
    await commitOnce(database, { branchId, operationId: uuid(), message: '当前 HEAD', units: [buildUnit()] })
  );
  return older;
};

/** 见 {@link CommitCorruptionEntryPoint}。 */
const CORRUPTION_ENTRY_POINTS: readonly CommitCorruptionEntryPoint[] = [
  {
    name: 'assertCommitGraphIntact（三条入口共用的那一份）',
    invoke: ({ executor, branchId }) => assertCommitGraphIntact(executor, branchId)
  },
  {
    name: 'commit()',
    invoke: async ({ adapter, database, executor }) => {
      // 先让工作树变脏：干净分支上 `commit()` 会撞 `empty_commit`，那时下面四条用例测的是
      // 「空提交被拒」，损坏守卫一次都没跑到。捕获排在前面不影响结论——守卫是 `commit()`
      // 的第一步，命中损坏时整个事务连这条捕获一起回滚。
      await captureOneWrite(database, executor, `corruption-${uuid()}`);
      // 这三个位刚在**同一个事务**里读出来，所以 CAS 必然命中。这不是 commit-conflict.ts
      // 第 2 条批的那种写法（那说的是 `commit()` 自己去读），而是这张表要把变量压到
      // 只剩「损坏与否」一个——CAS 本身由 §2.3 单独盯。
      const status = await readWorkingTreeStatus(executor);
      const result = await commitWorkingTree(executor, createCommitWriteContext(adapter), '损坏守卫用例', {
        ...credentialsOf(status),
        authorId: 'conformance-suite',
        operationId: uuid()
      });
      if (!result.ok) throw new Error(`期望这次提交跑到损坏守卫，实际先撞上 ${result.conflict.kind} 冲突`);
    }
  },
  {
    name: 'restore()',
    invoke: async ({ adapter, executor, branchId }) => {
      const ref = await readCommitBranchRef(executor, branchId);
      if (!ref.headCommitId) throw new Error('这个分支还没有 HEAD，恢复目标无从谈起');
      // 目标取 **HEAD 自己**：健康分支上它是一次语义 no-op（重放路径为空），于是这一行
      // 与 `commit()` 那一行一样，把变量压到只剩「损坏与否」——守卫是 `restore()` 的第一步，
      // 排在可达性、脏检查与预检**全部之前**，损坏分支上它一条都跑不到。
      const status = await readWorkingTreeStatus(executor);
      const result = await restoreWorkingTree(
        executor,
        createCommitWriteContext(adapter),
        { commitId: ref.headCommitId },
        credentialsOf(status)
      );
      if (!result.ok) throw new Error(`期望这次恢复跑到损坏守卫，实际先撞上 ${result.reason}`);
    }
  }
];

/**
 * 注册提交侧一致性用例。
 *
 * @param context - 适配器名与数据库工厂，见 {@link WorkingTreeConformanceSuiteContext}
 *
 * @public
 */
export const workingTreeCommitConformanceSuite = (context: WorkingTreeConformanceSuiteContext): void => {
  describe(`[${context.name}] 提交图与工作树提交一致性`, () => {
    let database: RxDB;

    beforeEach(async () => {
      database = await context.createDatabase();
    });

    describe('FR-038 at-rest 判定器槽位', () => {
      it('本地适配器实现了槽位：六个后端一个都不许缺', async () => {
        const adapter = await localAdapterOf(database);

        // 槽位在核心上是**可选**的（`RxDBAdapterLocalBase.isEncryptedAtRest?`），缺席的合法
        // 语义只有一条「这个适配器不支持列加密」。六个 v1 后端两族都支持，于是在这里缺席
        // 只可能是漏接线——而漏接线不会让任何既有用例变红：断言只在真有加密列要判时才
        // fail-closed 地抛，普通库上它整条是 no-op，一直安静到某个用户的库里真有一列加密。
        expect(typeof adapter.isEncryptedAtRest).toBe('function');
      });

      it('提交上下文接到的就是那个判定器：信封串认、明文与裸密文都不认', async () => {
        const adapter = await localAdapterOf(database);
        const recognize = createCommitWriteContext(adapter).codec.isEncryptedAtRest;
        if (!recognize) throw new Error('提交上下文没有从适配器拿到 at-rest 判定器');

        // 判的是**形态**不是内容。裸密文字节单列一条：它是 FR-038 真正要拦的那一类——
        // 一段 `Uint8Array` 写进 `PropertyType.json` 的 patch 列会变成 `{"0":222,…}`，
        // 写得进读得回，直到某次解密才炸在完全无关的调用栈里（`commit-codec.ts` 的
        // fileoverview 展开了这条）。
        expect({
          envelope: recognize(AT_REST_ENVELOPE),
          plaintext: recognize('明文标题'),
          rawCiphertext: recognize(Uint8Array.of(0xde, 0xad, 0xbe, 0xef))
        }).toEqual({ envelope: true, plaintext: false, rawCiphertext: false });
      });
    });

    describe('§2.1 commit 图与 HEAD（US-305）', () => {
      it('提交只追加：既有 commit 行一个字节都不动', async () => {
        const branchId = await readActiveBranchId(database);
        const before = await withTransaction(database, snapshotCommits);

        await commitOnce(database, {
          branchId,
          operationId: uuid(),
          message: '第一次提交',
          units: [buildUnit()]
        });

        const after = await withTransaction(database, snapshotCommits);
        expectAppendOnly(before, after);
        expect(after.size).toBe(before.size + 1);
      });

      it('同一个 operationId 重复提交幂等命中现有节点，不产生第二个', async () => {
        const branchId = await readActiveBranchId(database);
        const operationId = uuid();
        // 单元必须是**同一份**：`unitId` 进内容指纹，重建一份等于换了内容，
        // 那时该报的是 CommitOperationMismatchError，测的就不是幂等了。
        const units = [buildUnit()];
        const first = expectCommitted(
          await commitOnce(database, { branchId, operationId, message: '可重放的提交', units })
        );
        const before = await withTransaction(database, snapshotCommits);
        const refBefore = await readRefSnapshot(database, branchId);

        const replay = await commitOnce(database, { branchId, operationId, message: '可重放的提交', units });

        const after = await withTransaction(database, snapshotCommits);
        const refAfter = await readRefSnapshot(database, branchId);
        expect({ status: replay.status, id: replay.status === 'reused' ? replay.commit.id : null }).toEqual({
          status: 'reused',
          id: first.id
        });
        expect(after.size).toBe(before.size);
        // 重放推进 HEAD 的话，同一次提交就被算成了两次修订，别的 Tab 手里的
        // workingTreeRevision 会因为一次什么都没做的重试而集体失效。
        expect(refAfter.headRevision).toBe(refBefore.headRevision);
      });

      it('重启：另开一个事务冷读，HEAD 与整条父链逐字不变', async () => {
        const branchId = await readActiveBranchId(database);
        const first = expectCommitted(
          await commitOnce(database, { branchId, operationId: uuid(), message: '第一次', units: [buildUnit()] })
        );
        const second = expectCommitted(
          await commitOnce(database, { branchId, operationId: uuid(), message: '第二次', units: [buildUnit()] })
        );

        // 冷读：与写入不共享事务，也不共享任何进程内缓存——这正是「刷新一下页面」
        // 在持久层这一侧唯一能被观测到的东西。
        const cold = await withTransaction(database, async executor => ({
          ref: await readCommitBranchRef(executor, branchId),
          history: await listCommits(executor, { branchId })
        }));

        expect(cold.ref.headCommitId).toBe(second.id);
        expect(cold.history.map(commit => commit.id).slice(0, 2)).toEqual([second.id, first.id]);
        expect(cold.history[0].parentIds).toEqual([first.id]);
      });

      it('崩溃：事务体抛出之后零残留，HEAD 不动', async () => {
        const branchId = await readActiveBranchId(database);
        const before = await withTransaction(database, snapshotCommits);
        const refBefore = await readRefSnapshot(database, branchId);

        const crash = withTransaction(database, async (executor, adapter) => {
          const ref = await readCommitBranchRef(executor, branchId);
          await writeCommit(executor, createCommitWriteContext(adapter), {
            branchId,
            branchGeneration: ref.generation,
            expectedHeadRevision: ref.headRevision,
            kind: 'normal',
            message: '写到一半就崩',
            author: 'conformance-suite',
            operationId: uuid(),
            units: [buildUnit()]
          });
          throw new Error('模拟崩溃');
        });
        await expect(crash).rejects.toThrow('模拟崩溃');

        const after = await withTransaction(database, snapshotCommits);
        const refAfter = await readRefSnapshot(database, branchId);
        // 半个 commit 比没有 commit 糟得多：HEAD 指向一个没有 ChangeSet 的节点时，
        // 守卫会把整条分支判成损坏，而用户只是关了一次标签页。
        expect([...after.keys()]).toEqual([...before.keys()]);
        expect({ head: refAfter.headCommitId, revision: refAfter.headRevision }).toEqual({
          head: refBefore.headCommitId,
          revision: refBefore.headRevision
        });
      });

      it('删光 rxdb_change 之后，历史仍然完整可重放', async () => {
        const branchId = await readActiveBranchId(database);
        await seedLegacyChange(database, branchId);
        const units = [buildUnit(), buildUnit({ entityId: 'note-2', operation: 'insert', inversePatch: null })];
        const commit = expectCommitted(
          await commitOnce(database, { branchId, operationId: uuid(), message: '带两个单元', units })
        );
        const before = await withTransaction(database, (executor, adapter) =>
          getCommitDetail(executor, createCommitWriteContext(adapter).codec, commit.id)
        );

        const deleted = await deleteAllChanges(database);

        const after = await withTransaction(database, (executor, adapter) =>
          getCommitDetail(executor, createCommitWriteContext(adapter).codec, commit.id)
        );
        const history = await withTransaction(database, executor => listCommits(executor, { branchId }));
        expect(deleted).toBeGreaterThan(0);
        // CommitChangeSet 自带完整恢复数据（data-model.md §2.4）：change 行会被
        // 「删分支级联 / 压缩合并 / 回滚标记 / 失效标记」四条既有路径清掉，
        // 历史若挂在它上面，用户会在某次清理之后发现旧提交恢复不回来了。
        // 直接比两份单元内容，不再逐列挑：`getCommitDetail` 现在交的是解码后的变更单元
        // （纯对象），而不是带代理的落库行——挑列的那种写法会让日后新增的字段自动躲开比较。
        expect(after.units).toEqual(before.units);
        expect(history.map(row => row.id)).toContain(commit.id);
        await expect(
          withTransaction(database, executor => assertCommitGraphIntact(executor, branchId))
        ).resolves.toBeUndefined();
      });

      it('CommitChangeSet 结构上不引用 rxdb_change（静态断言）', () => {
        const metadata = getEntityMetadata(CommitChangeSet);
        const changeEntityName = getEntityMetadata(RxDBChange).name;
        const propertyNames = metadata.properties.map(property => property.name);

        // 上一条用例只能证明「今天这个库里删掉 change 行没事」；引用一旦被加回来，
        // 那条用例要等到某个后端真的级联删除时才红。结构断言当场就红。
        expect(propertyNames).toContain('patch');
        expect(propertyNames).toContain('inversePatch');
        expect(metadata.relations.map(relation => relation.mappedEntity)).not.toContain(changeEntityName);
        expect(propertyNames.filter(name => /change(id)?$/i.test(name))).toEqual([]);
      });

      it('firstParentId 恒等于 parentIds[0] ?? null', async () => {
        const branchId = await readActiveBranchId(database);
        await commitOnce(database, { branchId, operationId: uuid(), message: '第一次', units: [buildUnit()] });
        await commitOnce(database, { branchId, operationId: uuid(), message: '第二次', units: [buildUnit()] });

        const rows = await withTransaction(database, readAllCommits);

        // 冗余列就是第二份真相的温床：它一旦漂移，走索引的祖先遍历与走 parentIds 的
        // 损坏判定会对同一个库给出两条不同的历史。
        const drifted = rows.filter(row => row.firstParentId !== (row.parentIds[0] ?? null));
        expect(drifted.map(row => row.id)).toEqual([]);
      });
    });

    describe('§2.2 一次性启用迁移（US-305）', () => {
      it('每个既存分支都有 ref / state 初始行，且 generation 互不相同', async () => {
        const rows = await withTransaction(database, async executor => ({
          branches: await executor.getRepository(RxDBBranch).find({ where: { combinator: 'and', rules: [] } }),
          refs: await executor.getRepository(CommitBranchRef).find({ where: { combinator: 'and', rules: [] } }),
          states: await executor.getRepository(WorkingTreeState).find({ where: { combinator: 'and', rules: [] } })
        }));

        const branchIds = [...rows.branches.map(branch => branch.id)].sort();
        expect([...rows.refs.map(ref => ref.id)].sort()).toEqual(branchIds);
        expect([...rows.states.map(state => state.id)].sort()).toEqual(branchIds);
        // generation 撞号 = 幂等键撞号：删掉分支再建同名分支之后，新分支的第一次提交
        // 会被判成旧分支那次提交的重放，直接返回旧节点。
        expect(new Set(rows.refs.map(ref => ref.generation)).size).toBe(rows.refs.length);
      });

      it('enable() 之后每条本地分支都有一个 baseline 根节点', async () => {
        const branchId = await readActiveBranchId(database);

        const cold = await withTransaction(database, async executor => ({
          ref: await readCommitBranchRef(executor, branchId),
          history: await listCommits(executor, { branchId })
        }));

        // 「为每个分支补根」被写成「为激活分支补根」时，单分支库上两种写法完全一致，
        // 要到用户切到第二条分支那天才炸：那时库已经 enabled，而那条分支的 ref 还是
        // 空 HEAD，commit() 会往一个没有根的分支上挂节点。
        expect(cold.ref.headCommitId).not.toBeNull();
        expect(cold.history.map(commit => commit.kind)).toContain('baseline');
      });

      it('重复 enable() 幂等：不产生第二个根，HEAD 不动', async () => {
        const branchId = await readActiveBranchId(database);
        const before = await withTransaction(database, snapshotCommits);
        const refBefore = await readRefSnapshot(database, branchId);

        await database.workingTree.enable();

        const after = await withTransaction(database, snapshotCommits);
        const refAfter = await readRefSnapshot(database, branchId);
        expectAppendOnly(before, after);
        expect(after.size).toBe(before.size);
        expect({ head: refAfter.headCommitId, revision: refAfter.headRevision }).toEqual({
          head: refBefore.headCommitId,
          revision: refBefore.headRevision
        });
      });

      it('enable() 之后新建的分支自带 ref / state，且代际不与既有分支撞号', async () => {
        const refsBefore = await withTransaction(database, readAllRefs);

        await database.versionManager.createBranch('feature-fresh');

        const refsAfter = await withTransaction(database, readAllRefs);
        const states = await withTransaction(database, async executor =>
          executor.getRepository(WorkingTreeState).find({ where: { combinator: 'and', rules: [] } })
        );
        const fresh = refsAfter.find(ref => ref.id === 'feature-fresh');
        // 只写 rxdb_branch 一行的话，这条分支在 readCommitBranchRef() 上一读就抛——
        // 下一次 enable() 整体回滚，而 facade 承诺的「补根」对它永远失效。
        expect({ branchId: fresh?.branchId, head: fresh?.headCommitId, revision: fresh?.headRevision }).toEqual({
          branchId: 'feature-fresh',
          head: null,
          revision: 0
        });
        expect(states.map(state => state.id)).toContain('feature-fresh');
        // 代际取自单调源而非分支数：删过分支之后「数一数加一」会复用旧号（ABA）。
        expect(refsBefore.map(ref => ref.generation)).not.toContain(fresh?.generation);
      });

      it('新建分支后再 enable() 一次，新分支拿到自己的 baseline', async () => {
        await database.versionManager.createBranch('feature-fresh');

        await database.workingTree.enable();

        const history = await withTransaction(database, executor =>
          listCommits(executor, { branchId: 'feature-fresh' })
        );
        // 这正是 `working-tree-facade.ts` 对用户的承诺：漏掉根的分支，再调一次 enable() 就能补上。
        expect(history.map(commit => commit.kind)).toEqual(['baseline']);
      });

      it('全有或全无：任一分支不可物化时整体回滚，健康分支零变化', async () => {
        const branchId = await readActiveBranchId(database);
        const cyclicBranchId = await injectCyclicBranch(database);
        const before = await withTransaction(database, snapshotCommits);
        const refBefore = await readRefSnapshot(database, branchId);

        const error = await captureRejection(database.workingTree.enable());

        const after = await withTransaction(database, snapshotCommits);
        const refAfter = await readRefSnapshot(database, branchId);
        expect(error).toBeInstanceOf(BranchNotMaterializableError);
        expect((error as BranchNotMaterializableError).branchId).toBe(cyclicBranchId);
        expect((error as BranchNotMaterializableError).reason).toBe('corrupt_branch_history');
        // 逐分支边判边写的形态会在第三条分支上炸掉时留下前两条的 baseline，
        // 重试时它们被当成「已初始化」跳过，库永久停在半启用且没有任何报错。
        expect([...after.keys()]).toEqual([...before.keys()]);
        expect({ head: refAfter.headCommitId, revision: refAfter.headRevision }).toEqual({
          head: refBefore.headCommitId,
          revision: refBefore.headRevision
        });
      });
    });

    describe('§2.3 两类 CAS 分开（FR-031/FR-032、SC-008）', () => {
      it('调用方捕获型：status() 与 commit() 之间插进一次写，提交被拒且一个字节都没落地', async () => {
        const branchId = await readActiveBranchId(database);
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-a'));
        // 调用方捕获：界面拿到的就是这三个位，此后不再刷新。
        const captured = await readStatus(database);
        // 「另一连接 save()」：只动工作树、不动 HEAD——只比 headRevision 的实现在这里是绿的，
        // 而用户提交的正是他没看过的那条变更（SC-008 点名的就是这一格）。
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-b'));
        const before = await withTransaction(database, snapshotCommits);

        const result = await commitWithCredentials(database, credentialsOf(captured), '拿着旧凭据提交');

        const after = await withTransaction(database, snapshotCommits);
        const status = await readStatus(database);
        expect(commitShapeOf(result)).toEqual({
          ok: false,
          conflict: {
            kind: 'working_tree_revision',
            expected: captured.workingTreeRevision,
            actual: captured.workingTreeRevision + 1,
            branchId
          }
        });
        // 被拒的提交要是推进了 headRevision，别的 Tab 手上的凭据会因为一次什么都没提交的
        // 调用集体失效（commit-conflict.ts 第 3 条）。
        expect([...after.keys()]).toEqual([...before.keys()]);
        expect({ head: status.headRevision, entries: status.entryCount }).toEqual({
          head: captured.headRevision,
          entries: 2
        });
      });

      it('冲突不入库：重读一次 status() 再提一次就过，中间没有「清除冲突」这一步', async () => {
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-a'));
        const stale = await readStatus(database);
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-b'));
        const rejected = await commitWithCredentials(database, credentialsOf(stale), '拿着旧凭据提交');

        const retried = await commitWithCredentials(database, credentialsOf(await readStatus(database)), '复核后重提');

        const status = await readStatus(database);
        expect(rejected.ok).toBe(false);
        // 上一次的冲突要是被记进了某张表，这一次会带着它继续被拒——而库里没有任何 API
        // 能清掉它（contracts/core-api.md §4.1）。两条变更一起进这一次提交：
        // 没有暂存区，commit() 提交的就是当前工作树的全部（硬裁决 1）。
        expect(commitShapeOf(retried)).toEqual({ ok: true, changeSetCount: 2 });
        expect({ clean: status.clean, entries: status.entryCount }).toEqual({ clean: true, entries: 0 });
      });

      it('事务内读改写型：并发普通写一笔都不因并发失败（FR-032 回归）', async () => {
        const branchId = await readActiveBranchId(database);
        const before = await readStatus(database);

        const settled = await Promise.allSettled(
          Array.from({ length: CONCURRENT_WRITES }, (_ignored, index) =>
            withTransaction(database, executor => captureOneWrite(database, executor, `note-concurrent-${index}`))
          )
        );

        const after = await readStatus(database);
        // 防回归：谁要是给普通 CRUD 也安上「调用方捕获 + 条件 UPDATE」，这批写里就会有一部分
        // 因为 rowsAffected === 0 被拒——而普通写的调用方（一次 Ctrl+S）根本没有凭据可给，
        // 它除了重试别无出路，重试又会撞上下一个并发者。FR-032 禁的就是这条路。
        expect(rejectionsOf(settled), 'FR-032：普通 CRUD 不得因并发失败').toEqual([]);
        expect({
          entries: after.entryCount - before.entryCount,
          revision: after.workingTreeRevision - before.workingTreeRevision
        }).toEqual({ entries: CONCURRENT_WRITES, revision: CONCURRENT_WRITES });
        // 每笔写各自读改写一次：丢掉其中任何一次的自增，冗余列就与行数对不上了。
        await withTransaction(database, executor => assertWorkingTreeEntryCountIntact(executor, branchId));
      });
    });

    describe('§2.4 commit 原子性（FR-011、SC-007）', () => {
      it('写完 changeSet 之后崩溃：要么全有要么全无，工作树不会被清掉一半', async () => {
        const branchId = await readActiveBranchId(database);
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-a'));
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-b'));
        const captured = await readStatus(database);
        const before = await withTransaction(database, snapshotCommits);
        const changeSetsBefore = await countChangeSets(database);

        const error = await captureRejection(
          withTransaction(database, (executor, adapter) =>
            commitWorkingTree(crashOnClear(executor), createCommitWriteContext(adapter), '写完 changeSet 就崩', {
              ...credentialsOf(captured),
              authorId: 'conformance-suite',
              operationId: uuid()
            })
          )
        );

        const after = await withTransaction(database, snapshotCommits);
        const status = await readStatus(database);
        expect(error).toBeInstanceOf(InjectedCommitCrash);
        // 「全无」是对四步一起说的：commit 行、changeSet 行、HEAD 指针、被清掉的条目，
        // 少回滚哪一步都会留下一个有两份真相的库——最糟的一种是条目已清而历史没写，
        // 那批变更就此永久消失（commit-command.ts 第 4 条）。
        expect([...after.keys()]).toEqual([...before.keys()]);
        expect(await countChangeSets(database)).toBe(changeSetsBefore);
        expect({
          head: status.headRevision,
          revision: status.workingTreeRevision,
          entries: status.entryCount,
          rows: await countEntries(database, branchId)
        }).toEqual({
          head: captured.headRevision,
          revision: captured.workingTreeRevision,
          entries: 2,
          rows: 2
        });
        await withTransaction(database, executor => assertWorkingTreeEntryCountIntact(executor, branchId));
      });

      it('entryCount 与实际行数在任何时刻一致：捕获后、被拒后、提交后各校一遍', async () => {
        const branchId = await readActiveBranchId(database);
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-a'));
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-b'));
        const stale = await readStatus(database);
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-c'));
        await withTransaction(database, executor => assertWorkingTreeEntryCountIntact(executor, branchId));

        // 被拒的那一次：三次比较全排在任何写入之前，所以它连冗余列都不该碰。
        await commitWithCredentials(database, credentialsOf(stale), '拿着旧凭据提交');
        await withTransaction(database, executor => assertWorkingTreeEntryCountIntact(executor, branchId));
        expect(await countEntries(database, branchId)).toBe(3);

        const committed = await commitWithCredentials(
          database,
          credentialsOf(await readStatus(database)),
          '干净的提交'
        );

        const status = await readStatus(database);
        expect(commitShapeOf(committed)).toEqual({ ok: true, changeSetCount: 3 });
        // 「全有」的另一半：条目表真的空了，而不是只把计数改成 0——`status()` 的「干净」
        // 全压在那一列上，两者一分岔，用户会看到一个报干净、提交起来却吐出三个单元的库。
        expect({
          entries: status.entryCount,
          rows: await countEntries(database, branchId),
          clean: status.clean
        }).toEqual({ entries: 0, rows: 0, clean: true });
        await withTransaction(database, executor => assertWorkingTreeEntryCountIntact(executor, branchId));
      });
    });

    describe('§2.5 损坏守卫（三入口同一份）', () => {
      for (const entryPoint of CORRUPTION_ENTRY_POINTS) {
        it(`${entryPoint.name}：健康分支放行`, async () => {
          const branchId = await readActiveBranchId(database);
          await commitOnce(database, {
            branchId,
            operationId: uuid(),
            message: '健康的一次提交',
            units: [buildUnit()]
          });

          await expect(
            withTransaction(database, (executor, adapter) =>
              entryPoint.invoke({ adapter, database, executor, branchId })
            )
          ).resolves.toBeUndefined();
        });

        it(`${entryPoint.name}：HEAD 被篡改时拒绝，且不改指针、不删记录`, async () => {
          const branchId = await readActiveBranchId(database);
          const head = expectCommitted(
            await commitOnce(database, { branchId, operationId: uuid(), message: '会被篡改', units: [buildUnit()] })
          );
          await withTransaction(database, async executor => {
            const rows = await readAllCommits(executor);
            const target = rows.find(row => row.id === head.id);
            if (!target) throw new Error('刚写下的 HEAD 读不回来');
            await executor.getRepository(Commit).update(target, { contentFingerprint: 'tampered-fingerprint' });
          });
          const refBefore = await readRefSnapshot(database, branchId);
          const before = await withTransaction(database, snapshotCommits);

          const error = await captureRejection(
            withTransaction(database, (executor, adapter) =>
              entryPoint.invoke({ adapter, database, executor, branchId })
            )
          );

          const refAfter = await readRefSnapshot(database, branchId);
          const after = await withTransaction(database, snapshotCommits);
          expect(error).toBeInstanceOf(CommitGraphCorruptedError);
          expect((error as CommitGraphCorruptedError).reason).toBe('fingerprint_mismatch');
          // fail-closed：回退到上一个校验通过的 commit、或清空历史，都能让界面继续转，
          // 代价是用户的数据在他不知情的时候被换掉了。
          expect({ head: refAfter.headCommitId, status: refAfter.status }).toEqual({
            head: refBefore.headCommitId,
            status: refBefore.status
          });
          expect([...after.keys()]).toEqual([...before.keys()]);
        });

        it(`${entryPoint.name}：已标记 corrupted_read_only 的分支继续拒绝，HEAD 仍在原处`, async () => {
          const branchId = await readActiveBranchId(database);
          const head = expectCommitted(
            await commitOnce(database, {
              branchId,
              operationId: uuid(),
              message: '标记之前的提交',
              units: [buildUnit()]
            })
          );
          // 标记走的是**另一个**事务：写在命中损坏那个事务里会跟着回滚一起消失，
          // 用户看到操作失败、库里却什么记录都没留。
          await withTransaction(database, executor =>
            markBranchCorrupted(executor, new CommitGraphCorruptedError(branchId, head.id, 'fingerprint_mismatch'))
          );

          const error = await captureRejection(
            withTransaction(database, (executor, adapter) =>
              entryPoint.invoke({ adapter, database, executor, branchId })
            )
          );

          const ref = await withTransaction(database, executor => readCommitBranchRef(executor, branchId));
          expect((error as CommitGraphCorruptedError).reason).toBe('branch_marked_corrupted');
          expect({ head: ref.headCommitId, status: ref.status }).toEqual({
            head: head.id,
            status: 'corrupted_read_only'
          });
        });

        it(`${entryPoint.name}：孤立损坏只被隔离，不影响健康分支`, async () => {
          const branchId = await readActiveBranchId(database);
          await commitOnce(database, {
            branchId,
            operationId: uuid(),
            message: '健康的一次提交',
            units: [buildUnit()]
          });
          await withTransaction(database, async executor => {
            const orphan = database.entityManager.instantiate(Commit);
            orphan.id = uuid();
            orphan.parentIds = [];
            orphan.firstParentId = null;
            orphan.kind = 'normal';
            orphan.message = '谁都够不到的坏记录';
            orphan.author = 'conformance-suite';
            orphan.operationId = uuid();
            orphan.changeSetCount = 7;
            orphan.contentFingerprint = 'orphan-broken-fingerprint';
            await executor.saveMany([orphan]);
          });

          // 表里有一条坏记录 ≠ 这个分支坏了。CAS 输掉的那次提交、被删分支留下的节点，
          // 行都还在却没有任何 ref 指向它们；把它们算进去，一条谁都够不到的坏记录
          // 会让整个库停摆，而它对任何一次重放都没有影响。
          await expect(
            withTransaction(database, (executor, adapter) =>
              entryPoint.invoke({ adapter, database, executor, branchId })
            )
          ).resolves.toBeUndefined();
        });
      }

      it('不依赖重放的读取不受影响：损坏分支上 listCommits / getCommitDetail 照常返回', async () => {
        const branchId = await readActiveBranchId(database);
        const head = expectCommitted(
          await commitOnce(database, { branchId, operationId: uuid(), message: '标记之前的提交', units: [buildUnit()] })
        );
        await withTransaction(database, executor =>
          markBranchCorrupted(executor, new CommitGraphCorruptedError(branchId, head.id, 'fingerprint_mismatch'))
        );

        const read = await withTransaction(database, async (executor, adapter) => ({
          history: await listCommits(executor, { branchId }),
          detail: await getCommitDetail(executor, createCommitWriteContext(adapter).codec, head.id)
        }));

        // 诊断导出与当前投影读取是排查这次损坏**唯一**的入口。让它们跟着一起拒绝，
        // 等于告诉用户「你的库坏了，而且不许看」。
        expect(read.history.map(commit => commit.id)).toContain(head.id);
        expect(read.detail.units).toHaveLength(1);
      });
    });

    describe('§2.6 restore（US-307）', () => {
      it('恢复写回的是新的未提交变更：HEAD 不动、历史一条都不改', async () => {
        const branchId = await readActiveBranchId(database);
        const older = await seedTwoCommits(database, branchId);
        const refBefore = await readRefSnapshot(database, branchId);
        const before = await withTransaction(database, snapshotCommits);

        const result = await restoreOnce(database, older.id);

        const refAfter = await readRefSnapshot(database, branchId);
        const after = await withTransaction(database, snapshotCommits);
        const status = await readStatus(database);
        // 恢复不是 `checkout`：它把旧版本的内容写成**新的未提交变更**，HEAD 留在原处。
        // 挪 HEAD 的实现在这条断言下会当场红——而那种实现会让「恢复完再提交」变成一次
        // 把两个节点之间的历史整段丢掉的强制推送。
        expect({ head: refAfter.headCommitId, headRevision: refAfter.headRevision }).toEqual({
          head: refBefore.headCommitId,
          headRevision: refBefore.headRevision
        });
        expectAppendOnly(before, after);
        expect([...after.keys()], '恢复往历史里加了节点').toEqual([...before.keys()]);
        expect({
          restoredCount: result.ok ? result.restoredCount : null,
          hasSession: result.ok && result.sessionId !== null,
          entries: await countEntries(database, branchId),
          clean: status.clean
        }).toEqual({ restoredCount: 1, hasSession: true, entries: 1, clean: false });
      });

      it('公开面上没有 checkout()，也没有 detached HEAD 那类符号', async () => {
        // 这条断言与后端无关，仍然留在套件里：它守的是**公开面**，而公开面正是六个调用点
        // 共同承诺的那张表。放进某一个 `__tests__` 里的话，它只在那一个包的本地测试里跑，
        // 而契约 §2.6 要求的是每个适配器各自证明自己没有偷偷长出第二套 HEAD 语义。
        const exported = Object.keys(workingTreePublicSurface).filter(name => /checkout|detach/i.test(name));
        const methods = Object.getOwnPropertyNames(WorkingTreeManager.prototype).filter(name =>
          /checkout|detach/i.test(name)
        );
        // `restore()` 在公开面上必须仍然在——否则上面两个空数组用「把整块特性删掉」也能满足。
        expect({ exported, methods, hasRestore: 'restore' in WorkingTreeManager.prototype }).toEqual({
          exported: [],
          methods: [],
          hasRestore: true
        });
        await Promise.resolve();
      });

      it('CommitConflict 不会让 status().conflicted 变真', async () => {
        const branchId = await readActiveBranchId(database);
        const stale = credentialsOf(await readStatus(database));
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-conflict'));

        const rejected = await commitWithCredentials(database, stale, '拿过期凭据提交');

        const status = await readStatus(database);
        // 两件事共用一个词但不是一回事：`CommitConflict` 是**这一次调用**的返回值，不入库；
        // `status().conflicted` 描述的是库里那个仍然存在的恢复会话。把前者也算进后者，
        // 用户会在一次普通的 CAS 落空之后看到一个他永远清不掉的「冲突中」——而恢复会话
        // 压根不存在，没有任何入口能结束它。
        expect({ committed: rejected.ok, bits: restoreBitsOf(status) }).toEqual({
          committed: false,
          bits: { restoring: false, conflicted: false }
        });
        expect(await readRestoreSessions(database)).toEqual([]);
        expect(branchId).toBe(status.branchId);
      });

      it('会话捕获的 revision 分叉之后，restoring 灭、conflicted 亮', async () => {
        const branchId = await readActiveBranchId(database);
        const older = await seedTwoCommits(database, branchId);
        await restoreOnce(database, older.id);
        const restoring = await readStatus(database);

        // 另一个 Tab 存了一下：`captureChanges()` 会推 `workingTreeRevision`，于是会话捕获的
        // 那一对与当前值分叉。
        await withTransaction(database, executor => captureOneWrite(database, executor, 'note-another-tab'));

        const diverged = await readStatus(database);
        expect({ before: restoreBitsOf(restoring), after: restoreBitsOf(diverged) }).toEqual({
          before: { restoring: true, conflicted: false },
          after: { restoring: false, conflicted: true }
        });
        // 分叉不销毁会话——它仍然占着唯一索引，仍然要被这个人处理掉。
        expect(sessionShapeOf(await readRestoreSessions(database))).toEqual([
          { status: 'active', activeKey: branchId }
        ]);
      });

      it('一分支至多一个未结束会话：唯一索引拒绝第二行', async () => {
        const branchId = await readActiveBranchId(database);
        const older = await seedTwoCommits(database, branchId);
        await restoreOnce(database, older.id);

        const rejection = await captureRejection(
          withTransaction(database, async executor => {
            const duplicate = database.entityManager.instantiate(WorkingTreeRestoreSession);
            duplicate.id = uuid();
            duplicate.branchId = branchId;
            duplicate.targetCommitId = older.id;
            duplicate.expectedHeadRevision = 0;
            duplicate.expectedWorkingTreeRevision = 0;
            duplicate.status = 'active';
            duplicate.activeKey = branchId;
            await executor.saveMany([duplicate]);
          })
        );

        // 判据落在**数据库**上而不是某个入口的前置检查上：`restore()` 今天确实会先被
        // `dirty_working_tree` 挡住，但那道检查是应用层的一句 `if`，六个后端谁都可以绕过去
        // （比如别的入口、比如将来的批量导入）。「一分支至多一个未结束会话」要成立，
        // 只能由那条可空唯一索引来保证。
        expect(rejection).toBeInstanceOf(Error);
        expect(sessionShapeOf(await readRestoreSessions(database))).toEqual([
          { status: 'active', activeKey: branchId }
        ]);
      });

      it('commit() 把会话推进 committed 并让出 activeKey，新节点挂在原 HEAD 之后', async () => {
        const branchId = await readActiveBranchId(database);
        const older = await seedTwoCommits(database, branchId);
        await restoreOnce(database, older.id);
        const refBefore = await readRefSnapshot(database, branchId);
        const before = await withTransaction(database, snapshotCommits);

        const result = await commitWithCredentials(database, credentialsOf(await readStatus(database)), '提交恢复结果');

        const rows = await withTransaction(database, readAllCommits);
        const created = rows.find(row => result.ok && row.id === result.commitId);
        const status = await readStatus(database);
        const after = await withTransaction(database, snapshotCommits);
        // 被恢复的那个节点一个字节都没动：恢复产生的是新提交，不是对旧节点的重写（FR-015）。
        expectAppendOnly(before, after);
        // 三个位置全部按 **message** 比而不是按 id：三个 uuid 在失败输出里长得一模一样，
        // 而这条断言真正要说的是「新节点挂在**当前 HEAD** 之后，不是挂在**被恢复的那一版**之后」。
        expect({
          committed: result.ok,
          created: messageOfCommit(rows, result.ok ? result.commitId : null),
          parent: messageOfCommit(rows, created?.firstParentId ?? null),
          headBefore: messageOfCommit(rows, refBefore.headCommitId),
          bits: restoreBitsOf(status),
          clean: status.clean,
          session: await withTransaction(database, executor => readActiveRestoreSession(executor, branchId))
        }).toEqual({
          committed: true,
          created: '提交恢复结果',
          parent: '当前 HEAD',
          headBefore: '当前 HEAD',
          bits: { restoring: false, conflicted: false },
          clean: true,
          session: null
        });
        // 行还在，只是让出了唯一键——「这个分支上提交过几次恢复」从这里数得出来。
        expect(sessionShapeOf(await readRestoreSessions(database))).toEqual([{ status: 'committed', activeKey: null }]);
      });

      it('discard() 把会话整行删掉，工作树回到干净', async () => {
        const branchId = await readActiveBranchId(database);
        const older = await seedTwoCommits(database, branchId);
        await restoreOnce(database, older.id);
        const before = await withTransaction(database, snapshotCommits);

        const result = await discardWithFreshCredentials(database);

        const status = await readStatus(database);
        const after = await withTransaction(database, snapshotCommits);
        expectAppendOnly(before, after);
        expect([...after.keys()], 'discard 动了历史').toEqual([...before.keys()]);
        expect({
          result,
          bits: restoreBitsOf(status),
          clean: status.clean,
          entries: await countEntries(database, branchId)
        }).toEqual({
          result: { ok: true, discardedCount: 1, workingTreeRevision: status.workingTreeRevision },
          bits: { restoring: false, conflicted: false },
          clean: true,
          entries: 0
        });
        // 丢弃**不留终态行**：什么都没提交，一行 `committed` 会让上一条用例数出来的那个数字失真。
        expect(await readRestoreSessions(database)).toEqual([]);
      });
    });
  });
};
