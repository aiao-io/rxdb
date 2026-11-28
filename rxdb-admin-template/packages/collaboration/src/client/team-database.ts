import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  getEntityMetadata,
  SyncType,
  type EntityType,
  type RxDB,
  type RxDBIdentity
} from '@aiao/rxdb';
import type { VersionManager } from '@aiao/rxdb-plugin-history';
import {
  rxDBPluginWorkingTree,
  type CommitExchangeRecord,
  type CommitExportOptions,
  type CommitExportPage,
  type CommitImportOptions,
  type CommitImportResult,
  type CommitLogEntry,
  type CommitLogOptions,
  type CommitOptions,
  type CommitResult,
  type WorkingTreeBranchFromCommitRejection,
  type WorkingTreeDiscardOptions,
  type WorkingTreeDiscardResult,
  type WorkingTreeRestoreOptions,
  type WorkingTreeRestoreResult,
  type WorkingTreeRestoreTarget,
  type WorkingTreeStatus
} from '@aiao/rxdb-plugin-working-tree';
import { demand, type DataRow, type Records } from '../model.js';

/** 团队库的作用域：用户 × 团队 × 应用。不同作用域绝不共用一个库（ADMIN-US-204 的本机隔离）。 */
export interface TeamScope {
  /** 当前登录用户的 ID（Supabase 用户 ID）；团队任务提交的作者与记录的创建者都是他。 */
  readonly userId: string;
  /** 团队 ID。 */
  readonly teamId: string;
  /** 应用 ID。 */
  readonly appId: string;
}

/**
 * 应用提供的团队库工厂（ADMIN-US-221）：按作用域返回一个**尚未初始化**（没有调用过 `init()` / `connect()`）的 RxDB。
 *
 * @param scope - 用户 × 团队 × 应用
 * @param identity - 本机库的身份（ADMIN-US-222）：后端标识取自全局会话，主体就是 `scope.userId`
 *
 * @remarks
 * 约定（三端应用的实现逐条相同）：
 * - 库名用 {@link teamDatabaseName}，前缀由应用给出（例如它的本机库名），作用域的三项经散列进库名；
 * - `identity` 原样交给 `RxDBOptions.identity`：库记下它属于谁，换了身份就打不开（平台 US-035）；
 * - `context.userId` 是 `scope.userId`：团队任务里新建、修改记录的审计字段与提交的作者都是这个真实用户；
 * - 实体是应用业务实体经 `cloneEntityClasses()` 克隆出的新类：同一个实体类不能注册到两个 RxDB 实例，匿名工作台已注册了原类，
 *   每次调用都要克隆一份新的（切换团队时旧库关闭、新库打开）；
 * - 本地适配器与匿名工作台相同（三端都是 sqlite-wasm 的 `vfs: 'idb'`），库级同步为 `SyncType.None`：
 *   导入远端提交拒绝写走通用同步的实体，团队库的数据只经协作命令交换；
 * - 装上 `@aiao/rxdb-plugin-history`：切分支与从提交建分支依赖它的 `versionManager`。
 *
 * working-tree 插件由协作包在连接前装上并启用（{@link openTeamDatabase}），工厂不要装，也不要调用 `init()`：
 * 带系统贡献的插件必须在 `init()` 之前登记，而 `enable()` 是库级、不可逆的开关，因此团队库与匿名工作台分库。
 */
export type TeamDatabaseFactory = (scope: TeamScope, identity: RxDBIdentity) => RxDB;

/**
 * 团队库名的长度上限。sqlite-wasm 的 IndexedDB 文件系统（wa-sqlite 的 `FacadeVFS`）的 `mxPathname` 是 64：
 * 打开的文件是 `<库名>@0_1.sqlite.db`（RxDB 给库名加 `@0_1`，适配器加 `.sqlite`，IndexedDB 存储再加 `.db`），
 * 回滚日志再加 `-journal`；日志路径超过上限时 `sqlite3_open_v2` 直接失败（浏览器实测：日志路径 62 字节可以、65 字节不行），
 * 所以库名至多 41 个字符，日志路径不超过 63 字节。
 */
const teamDatabaseNameLimit = 41;

/**
 * 团队库的库名：`<前缀>-<作用域的 80 位散列>`（20 位十六进制）。用户、团队、应用三项按 JSON 数组参与散列，
 * 切分方式不同的组合不会混为一谈；同一作用域永远得到同一个库名，刷新、离线冷启动都打开同一个库。
 *
 * @remarks
 * 不把三项原样拼进库名：两个 UUID 加应用 ID 远超 sqlite-wasm 的路径上限（见 {@link teamDatabaseNameLimit}），
 * 而且文件系统用 `new URL(库名, 'file://')` 解析路径，带冒号的库名会被当成 URL 协议。散列不用于防伪：
 * 一台设备上只有寥寥几个作用域，80 位的意外碰撞概率可以忽略，不同作用域因此不会共库（ADMIN-US-204）。
 * 前缀太长、放不下散列（三端的前缀至多 20 个字符）或含冒号时抛出 `configuration`。
 * @param prefix 应用给出的前缀，通常是它的本机库名；不能含冒号。
 * @param scope 用户 × 团队 × 应用。
 */
export function teamDatabaseName(prefix: string, scope: TeamScope): string {
  const name = `${prefix}-${scopeHash(JSON.stringify([scope.userId, scope.teamId, scope.appId]))}`;
  demand(name.length <= teamDatabaseNameLimit && !prefix.includes(':'), 'configuration', '团队库配置不正确');
  return name;
}

/**
 * 字符串的 80 位散列（20 位十六进制）：cyrb128（四路 `Math.imul` 混合，逐个 UTF-16 码元输入）的前 80 位，同步计算，
 * 浏览器与 Node 结果相同。只用来把作用域压成短库名，不是密码学散列。
 */
function scopeHash(text: string): string {
  let [h1, h2, h3, h4] = [1779033703, 3144134277, 1013904242, 2773480762];
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  return [h1, h2, h3]
    .map(word => (word >>> 0).toString(16).padStart(8, '0'))
    .join('')
    .slice(0, 20);
}

/** 协作读的工作树摘要：当前分支、未提交条目数、恢复会话与三个捕获位。 */
export type TreeStatus = Pick<
  WorkingTreeStatus,
  'branchId' | 'entryCount' | 'restoring' | 'conflicted' | 'activationRevision' | 'headRevision' | 'workingTreeRevision'
>;
/** 协作读的提交历史条目（子先于父）。 */
export type TreeLogEntry = Pick<
  CommitLogEntry,
  'commitId' | 'parentIds' | 'kind' | 'message' | 'authorId' | 'createdAt'
>;

/**
 * 协作用到的 working-tree 成员：平台 `db.workingTree`（`WorkingTreeManager`）的子集，入参与结果的类型取自平台，
 * 结果只声明协作读的字段，真实的门面因此可以直接赋给它，单测的桩也不必伪造用不到的字段。
 */
export interface TeamWorkingTree {
  /** 当前分支的工作树摘要。 */
  status(): Promise<TreeStatus>;
  /** 把工作树的全部条目提交成一个普通提交。 */
  commit(message: string, options: CommitOptions): Promise<CommitResult>;
  /** 工作树整体退回 HEAD，业务表逐行一起退回（US-320）。 */
  discard(options: WorkingTreeDiscardOptions): Promise<WorkingTreeDiscardResult>;
  /** 把业务表恢复成一个历史提交的数据，差异作为未提交改动（US-320）。 */
  restore(target: WorkingTreeRestoreTarget, options: WorkingTreeRestoreOptions): Promise<WorkingTreeRestoreResult>;
  /** 把服务端下发的一段提交原样导入当前分支并快进（US-319）。 */
  importCommits(commits: readonly CommitExchangeRecord[], options: CommitImportOptions): Promise<CommitImportResult>;
  /** 当前分支某个提交之后的提交（父先于子），交换记录形态。 */
  exportCommits(options: CommitExportOptions): Promise<Pick<CommitExportPage, 'headCommitId' | 'commits'>>;
  /** 从当前分支历史里的一个提交建分支（不切换）。 */
  createBranchFromCommit(
    branchId: string,
    commitId: string
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: WorkingTreeBranchFromCommitRejection }>;
  /** 当前分支的头与从头沿父链可达的提交历史（子先于父）。 */
  listCommits(
    options?: CommitLogOptions
  ): Promise<{ readonly headCommitId: string | null; readonly entries: readonly TreeLogEntry[] }>;
}

/**
 * 协作对团队库的全部依赖：working-tree 的提交与工作树、history 的分支、按记录写入，以及本地写入的通知。
 * 生产里由 {@link openTeamDatabase} 包装真实的 RxDB，单测里换成内存桩（`team.testing.ts`）。
 */
export interface TeamDatabase {
  /** 作用域。 */
  readonly scope: TeamScope;
  /** 交给应用渲染编辑界面的 RxDB 实例（已连接、已启用 working-tree）。 */
  readonly rxdb: RxDB;
  /** working-tree 的提交与工作树。 */
  readonly tree: TeamWorkingTree;
  /** 当前分支 ID。 */
  currentBranch(): Promise<string>;
  /** 切到另一条分支；不要求当前分支干净（工作树属于分支，切回来时原样还在）。 */
  switchBranch(branchId: string): Promise<void>;
  /**
   * 把一批记录作为普通编辑写进当前分支（经 RxDB 写入，因此进入工作树）：记录标识保留，`order` 给出实体的写入顺序
   * （被引用的实体在前），同一个事务里写完。
   */
  writeRecords(records: Records, order: readonly string[]): Promise<void>;
  /** 订阅本地写入（新建、修改、删除记录）；返回取消订阅函数。工作树没有变更流，界面靠它重读状态。 */
  onWrite(listener: () => void): () => void;
  /** 关闭团队库：断开连接、释放实例。之后不能再用。 */
  close(): Promise<void>;
}

/**
 * 打开团队库：调用应用的工厂，在连接前装上 working-tree 插件，连接本地适配器，空库上启用提交能力（`enableIfEmpty()`）。
 * 身份的主体不是作用域里的用户时不调用工厂；工厂返回的库不合约定（已初始化、没按交给它的身份绑定、`context.userId` 不是当前用户、
 * 库级同步不是 `SyncType.None`、没装 history 插件）、或库里已有不在任何提交里的内容（`not_empty`）时抛出 `configuration`，
 * 并关闭已打开的连接。库里绑定的是别的身份时，连接按平台 US-035 报身份不匹配，本地数据不动。
 * @param identity 本机库的身份（ADMIN-US-222），主体必须是 `scope.userId`。
 */
export async function openTeamDatabase(
  factory: TeamDatabaseFactory,
  scope: TeamScope,
  identity: RxDBIdentity
): Promise<TeamDatabase> {
  demand(identity.subject === scope.userId, 'configuration', '团队库配置不正确');
  const rxdb = factory(scope, identity);
  demand(!rxdb.initialized, 'configuration', '团队库配置不正确');
  const bound = rxdb.config.identity;
  demand(bound?.scope === identity.scope && bound.subject === identity.subject, 'configuration', '团队库配置不正确');
  demand(rxdb.config.context?.userId === scope.userId, 'configuration', '团队库配置不正确');
  demand(rxdb.config.sync.type === SyncType.None, 'configuration', '团队库配置不正确');
  const adapter = rxdb.config.sync.local?.adapter;
  demand(adapter, 'configuration', '团队库配置不正确');
  rxdb.use(rxDBPluginWorkingTree);
  try {
    await rxdb.connect(adapter);
    // history 插件在连接纪元内挂载 versionManager；没装时读到的是 undefined（核心不做兜底）
    const versions: VersionManager | undefined = rxdb.versionManager;
    demand(versions, 'configuration', '团队库配置不正确');
    const enabled = await rxdb.workingTree.enableIfEmpty();
    demand(enabled.kind !== 'not_empty', 'configuration', '团队库配置不正确');
  } catch (error) {
    await rxdb.destroy();
    throw error;
  }
  return rxdbTeamDatabase(rxdb, scope);
}

/** 本地写入事件：实体新建、修改与删除成功之后各发一次。 */
const writeEvents = [ENTITY_LOCAL_CREATE_EVENT, ENTITY_LOCAL_UPDATE_EVENT, ENTITY_LOCAL_REMOVE_EVENT] as const;

/** 已连接、已启用 working-tree 的 RxDB 包装成 {@link TeamDatabase}。 */
function rxdbTeamDatabase(rxdb: RxDB, scope: TeamScope): TeamDatabase {
  return {
    scope,
    rxdb,
    tree: rxdb.workingTree,
    async currentBranch() {
      const branch = await rxdb.versionManager.getCurrentBranch();
      demand(branch, 'internal', '服务暂时不可用，请稍后按原请求重试');
      return branch.id;
    },
    switchBranch: branchId => rxdb.versionManager.switchBranch(branchId),
    async writeRecords(records, order) {
      const instances = order.flatMap(entity => {
        const type = entityType(rxdb, entity);
        return Object.entries(records)
          .filter(([, row]) => row.entity === entity)
          .map(([id, row]) => rxdb.entityManager.instantiate(type, initialData(id, row)));
      });
      if (instances.length) await rxdb.entityManager.saveMany(instances);
    },
    onWrite(listener) {
      for (const type of writeEvents) rxdb.addEventListener(type, listener);
      return () => {
        for (const type of writeEvents) rxdb.removeEventListener(type, listener);
      };
    },
    close: () => rxdb.destroy()
  };
}

/** 团队库里按实体名找实体类（应用注册的克隆）；找不到说明记录不属于这个应用，按请求不合法拒绝。 */
function entityType(rxdb: RxDB, entity: string): EntityType {
  const found = rxdb.config.entities.find(type => getEntityMetadata(type).name === entity);
  demand(found, 'invalid', '实体不受支持');
  return found;
}

/** 新实体的初始数据：记录标识与记录字段原样交给实体（取值是落库形态，适配器按列类型写入）。 */
function initialData(id: string, row: DataRow): Record<string, unknown> {
  return { ...row.fields, id };
}
