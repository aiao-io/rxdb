import type { Observable } from 'rxjs';
import type { WorkingTreeCaptureHook } from './capture/capture-interceptor.js';
import { installWorkingTreeCapture, uninstallWorkingTreeCapture } from './capture/capture-interceptor.js';
import type { RawWriteContext } from './capture/raw-write-gate.js';
import { EntityType } from './entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from './entity/metadata-options.interface.js';
import type { EntityMetadata } from './entity/metadata.interface.js';
import type { RuleGroup } from './repository/query.interface.js';
import { IRepository } from './repository/repository.interface.js';
import type { Repository } from './repository/Repository.js';
import { RxDB } from './RxDB.js';
import { SwitchVersionActions } from './sync-contract/VersionManager.interface.js';
import { RxDBChange } from './system/change.js';
import { IRxDBChange, RemoteChange } from './system/system.interface.js';
import type { TransactionExecutor } from './transaction/transaction-executor.interface.js';

/**
 * 一次批量拉取里针对**单个实体**的水位线请求
 *
 * @remarks
 * 之所以按实体各带一个 `sinceId` 而不是全库共用一个：变更日志是全局单调 id，
 * 但各实体的同步进度并不齐平（有的表刚建、有的已经追到最新）。共用最小水位
 * 会把已经拿过的变更重新下载一遍，共用最大水位则会漏掉落后表的变更。
 *
 * `namespace` 省略时由适配器按当前库的默认命名空间解析。
 */
export interface PullBatchRequest {
  namespace?: string;
  entity: string;
  sinceId: number;
}

/**
 * 远端合并一批本地变更之后回传的结果
 *
 * @remarks
 * 两个字段都可省——远端实现可以只回传其中之一，甚至都不回传（那种情况下调用方按
 * 「无映射」处理，见 `push-repository.ts`）。
 *
 * `changeIdMapping` 是本地变更 id 到远端分配 id 的对照表：本地变更在推送前就已落盘，
 * 带的是本地自增 id，而远端有自己的一套。拿到映射才能把本地变更日志标上 `remoteId`，
 * 后续拉取时据此认出「这条是我自己推上去的」而不是当成新的远端变更再落一遍。
 */
export interface RemoteMergeResult {
  maxChangeId?: number;
  changeIdMapping?: Array<{ localId: number; remoteId: number }>;
}

/**
 * 仓库构造函数类型 —— 必须可实例化（具体类），不能是抽象类；支持带额外泛型参数的仓库
 */
export interface RepositoryInstance<T extends EntityType = EntityType> {
  readonly EntityType: T;
}

/**
 * 门面仓储的构造器类型（由 `RxDB.repository()` 登记）
 *
 * @remarks
 * 两条构造签名不是重载而是**放宽手段**：第一条 `new (...args: never[])` 让带额外泛型形参的
 * 仓储子类也能赋值进来（那些子类的构造参数与第二条并不精确相同），第二条声明真正的调用形态。
 * 参数是 `never[]` 而不是 `any[]`，因此它只放宽赋值、不放宽调用——没人能真的按第一条构造。
 *
 * 与 {@link AdapterRepositoryConstructor} 的区别在于**第一个参数**：门面仓储拿 {@link RxDB}，
 * 适配器仓储拿适配器实例。两条轴各自注册，不要混用。
 */
export interface RepositoryConstructor<RT extends RepositoryInstance = RepositoryInstance> {
  new (...args: never[]): RT;
  new (rxdb: RxDB, EntityType: RT['EntityType']): RT;
}

/**
 * 适配器仓储的构造器类型（由 `RxDBAdapterBase.repository()` 登记）
 *
 * @remarks
 * 与 {@link RepositoryConstructor} 是**两条平行的轴**：门面轴决定 `getRepository(E)` 返回什么类，
 * 适配器轴决定那个类底下由谁执行 SQL。`Adapter` 形参默认 `RxDBAdapterBase`，
 * 适配器包传自己的类进来，于是自定义仓储能直接用到该适配器的私有能力而不必向下转型。
 */
export type AdapterRepositoryConstructor<
  Adapter extends { readonly rxdb: RxDB } = RxDBAdapterBase,
  RT extends RepositoryInstance = RepositoryInstance
> = new (adapter: Adapter, EntityType: EntityType) => RT;

/**
 * 一次事务内要落库的全部变更，按「建 / 删 / 改」分好组
 *
 * @remarks
 * 用 `Set` 而不是数组：同一个实体实例在一次刷写里可能被多条路径收集到（级联、关系反向维护），
 * 去重靠身份而不是靠调用方自律，否则同一行会被写两遍。
 *
 * 三组的执行顺序由适配器决定而不是由本结构表达——外键约束要求建在引用之前、删在被引用之后，
 * 那是适配器 `mutations()` 实现的职责。
 */
export interface RxDBMutationsMap<T extends EntityType = EntityType> {
  create: Map<T, Set<InstanceType<T>>>;
  remove: Map<T, Set<InstanceType<T>>>;
  update: Map<T, Set<InstanceType<T>>>;
}

/**
 * 事务回调函数。
 *
 * @remarks
 * 参数是本次事务的 {@link TransactionExecutor} —— 持有它才算「在本事务内」。
 * 零参回调仍然兼容（TS 允许形参更少的函数）。
 */
export type TransactionFun = (executor: TransactionExecutor) => Promise<unknown>;

/**
 * {@link SwitchBranchOptions.prepare} 拿到的上下文。
 *
 * @remarks
 * 两个字段都不可省。`executor` 是**切换事务本身**的执行器——回调在它上面读到的与写下的，
 * 与接下来那次切换同生共死；`targetBranchId` 是适配器**解析之后**的目标分支，
 * 而不是调用方那份可省的 {@link SwitchBranchOptions.branchId}：省略那一支上，
 * 前置校验要看的是库里当前激活的那条分支，不是一个 `undefined`。
 */
export interface SwitchBranchPrepareContext {
  /** 切换事务的执行器；回调在这里做的读写与本次切换在同一个事务内 */
  readonly executor: TransactionExecutor;
  /** 解析之后的目标分支 id；{@link SwitchBranchOptions.branchId} 省略时是库里当前激活的那条 */
  readonly targetBranchId: string;
}

/**
 * `adapter.switchBranch()` 的参数
 *
 * @remarks
 * 这个原语同时承担两件事：**切换激活分支**，以及**批量套用
 * {@link SwitchVersionActions}**（历史回放只要后者，省略 {@link SwitchBranchOptions.branchId}
 * 即可让 actions 落在当前分支上）。两件事共用一个事务，这正是它不拆成两个方法的原因——
 * 拆开就会在两者之间留出一个没人守着的窗口。
 */
export interface SwitchBranchOptions {
  /**
   * 目标分支 id。
   *
   * @remarks
   * 省略表示「作用于当前激活分支」——由适配器在切换事务**内部**解析，激活分支保持不变。
   * 历史子系统（redo 失效、undo/redo 回放）借本方法批量套用 {@link SwitchVersionActions}，
   * 它们从不想改分支；若由调用方先查当前分支再传进来，两次 await 之间发生的真实切换会让这条
   * 迟到的调用把 `activated` 与全部变更日志触发器倒回旧分支，之后的写入全被错标。
   */
  branchId?: string;

  /**
   * 本次切换要在同一个事务里套用的版本动作（撤销/重做的写回、redo 栈作废等）。
   *
   * @remarks
   * 必填但可以为空动作集。与分支切换同事务是有意的：动作改的是变更日志的可见性，
   * 而分支切换改的是触发器指向，两者分属两个事务时中间的写会被错标。
   */
  actions: SwitchVersionActions;

  /**
   * 切换事务内的前置钩子：适配器在解析出目标分支之后、动第一行之前 await 它。
   *
   * @remarks
   * **适配器一侧的义务**：解析完 `branchId`、在删触发器/改 `activated`/套用 actions 之前调用，
   * 每次切换恰好一次。抛出的东西原样上抛，由事务回滚——不要 catch，也不要「记下来稍后再说」。
   *
   * **调用方一侧的义务**：必填。分支切换的前置条件（工作树是否干净、提交图是否可达损坏、
   * 代际凭据是否过期）以前跑在**另一个只读事务**里，那个事务与这次切换之间的窗口没有任何东西守着：
   * 校验说「干净」，窗口里的一次写让它变脏，切换照样完成。放进这里之后，
   * 「校验通过」与「切换完成」不再是两件可以分开发生的事。
   *
   * 做成必填而不是 `?`，与 `RxDBSystemContribution` 七个贡献点一个都不带 `?` 是同一条理由：
   * `?` 让「不需要」与「忘了」变成同一种东西，而这里忘了的症状是切换照常成功、只是没校验过。
   * 真的不需要校验的调用点（历史回放只借本方法批量套用 actions，从不改分支）写一个显式空实现，
   * 那一行是一句「我确实不需要」。
   */
  prepare: (context: SwitchBranchPrepareContext) => Promise<void>;
}

/**
 * 显式表态「这次调用没有分支要校验」的空实现
 *
 * @remarks
 * **只有不改分支的调用点能用它。** `switchBranch` 同时是「切分支」和「批量套用
 * {@link SwitchVersionActions}」两件事的原语；历史回放（undo/redo、作废 redo 栈）只要后者，
 * 省略 {@link SwitchBranchOptions.branchId} 让 actions 落在当前分支上，激活分支一动不动。
 * 分支没换，就没有「切过去的那条分支的历史可不可重放」可问，也没有代际要推进。
 *
 * 会改分支的调用点用它等于把守卫关掉：目标分支的提交图不验、调用方提的条件不判、
 * 激活代际不推进，而切换照样完成——那正是把 {@link SwitchBranchOptions.prepare} 做成必填
 * 要拦的情形。
 *
 * 做成具名导出而不是让各调用点各写一个 `async () => {}`：这样「谁豁免了前置校验」
 * 是一次 grep 就能数清的一张表，而匿名空箭头只能靠读全文发现。
 */
export const SKIP_BRANCH_SWITCH_PREPARE: SwitchBranchOptions['prepare'] = async () => {
  // 空体就是语义本身：这一次切换不做任何前置校验。
};

/**
 * {@link IRxDBAdapter.rawQuery} 的返回形态
 *
 * @remarks
 * 行是**二维数组**而不是对象数组：裸查询的列名由 SQL 自己决定，适配器没有元数据可据以命名，
 * 列名单独放在 `columns` 里、与每行的下标一一对应。调用方要对象形态得自己 zip。
 *
 * 写语句（UPDATE / DELETE）只填 `rowsAffected`，`rows` 与 `columns` 为空。
 */
export interface RawQueryResult {
  rowsAffected: number;
  rows: unknown[][];
  columns: string[];
}

/**
 * RxDB 数据库适配器接口
 */
export interface IRxDBAdapter {
  /** 适配器名，与 `RxDB.adapter()` 登记时用的键同值；错误消息与 `getAdapter()` 都按它认人 */
  readonly name: string;

  /**
   * 建立连接并把系统表补到当前水位。
   *
   * @returns 自身，便于链式使用
   *
   * @remarks
   * 建表与系统迁移都在这里发生（见 `isCurrentRxDBSystemVersion`），因此它可能很慢，
   * 也可能因为库比本进程新而抛 `UnsupportedRxDBSystemVersionError`。
   */
  connect(): Promise<IRxDBAdapter>;

  /**
   * 断开连接并释放底层句柄。
   *
   * @remarks
   * 与 `RxDB.destroy()` 不同，断开是**可逆**的：同一个适配器实例之后还能再 `connect()`。
   * 实现须幂等——未连接时调用是空操作而不是抛错。
   */
  disconnect(): Promise<void>;

  /**
   * 底层数据库引擎的版本号（如 SQLite 的 `3.45.0`），用于诊断与能力判断。
   *
   * @remarks
   * 与系统表水位号（`RXDB_SYSTEM_SCHEMA_VERSION`）无关，那是 RxDB 自己的号。
   */
  version(): Promise<string>;

  /**
   * 取该实体在**本适配器**上的仓储实例。
   *
   * @remarks
   * 返回的是适配器轴的仓储（见 {@link AdapterRepositoryConstructor}），
   * 与用户通常拿到的门面仓储 `RxDB.getRepository()` 不是同一个对象。
   */
  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT;

  /**
   * 批量写入实体（不存在则插入，存在则更新）。
   *
   * @returns 落库后的实体；主键、数据库端默认值等由库回填的字段在这里才有值
   */
  saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]>;

  /**
   * 批量删除实体。
   *
   * @returns 被删除的实体
   */
  removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]>;

  /**
   * 批量修改实体（创建/更新/删除）
   */
  mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]>;

  /**
   * 该实体对应的表在库里是否已存在。
   *
   * @remarks
   * 问的是**物理表**，不是元数据里有没有登记这个实体。
   */
  isTableExisted(EntityType: EntityType): Promise<boolean>;

  /**
   * 执行原始 SQL 查询（条件 UPDATE 等绕过 ORM 的场景）
   *
   * @remarks
   * **可选方法**，这一点有后果：核心包没法像四个写原语那样替适配器包住它，
   * 于是启用提交能力的库上，raw 写的门禁只能由各适配器自己的实现调用
   * `gateRawWrite(sql, ctx, …)` 来完成（`ctx` 取自
   * {@link RxDBAdapterLocalBase.workingTreeRawWriteContext}）。漏掉那一句
   * 等于这条路径上的写全部绕过变更捕获。
   *
   * 走这里的写不经过实体 Proxy，因此也不会产生实体事件，缓存里的实例不会自动刷新。
   */
  rawQuery?(sql: string, params?: unknown[]): Promise<RawQueryResult>;
}

/**
 * 本地适配器的完整形态：接口契约 + 本地基类能力。
 *
 * @remarks
 * `localAdapter$` 这一支发出的对象同时满足两者，调用方也总是两边的成员混着用，
 * 因此「交集」才是这条链上的真实类型，而不是某一半。
 *
 * 给它一个名字而不是在每处签名里重抄 `IRxDBAdapter & RxDBAdapterLocalBase`，除了少抄
 * 二十遍，还有一条编译期的硬理由：这个交集会经**推断**出来的返回类型跨包传播，而匿名
 * 交集在下游包做声明发射时没法经 `@aiao/rxdb` 命名——`@aiao/source` 条件把裸说明符解析
 * 到 `src/index.ts`，发射器于是退回一条指向 `packages/rxdb/src/` 的相对路径，把核心包源码
 * 拽进下游的编译程序（ng-packagr 给每个入口点强制 `rootDir`，当场判 TS6059）。具名别名
 * 让发射器有一个可经 barrel 命名的符号，逃逸不再发生。
 */
export type LocalRxDBAdapter = IRxDBAdapter & RxDBAdapterLocalBase;

/**
 * 远端适配器的完整形态：接口契约 + 远端基类能力。
 *
 * @remarks
 * 与 {@link LocalRxDBAdapter} 对称，存在理由相同。
 */
export type RemoteRxDBAdapter = IRxDBAdapter & RxDBAdapterRemoteBase;

/**
 * 数据库适配器基类
 */
export abstract class RxDBAdapterBase {
  protected readonly repository_map = new Map<string, AdapterRepositoryConstructor<this>>();
  protected readonly repository_cache = new Map<EntityType, RepositoryInstance>();

  constructor(public readonly rxdb: RxDB) {}

  public abstract getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT;

  protected repository<RT extends RepositoryInstance>(
    repositoryName: string,
    RepositoryClass: AdapterRepositoryConstructor<this, RT>
  ): void {
    this.repository_map.set(repositoryName, RepositoryClass);
  }
}

/**
 * 恢复被删除实体的参数
 *
 * @remarks
 * 只对**删除**成立：`changeId` 必须指向 `rxdb_change` 里一条 DELETE 变更，
 * 恢复靠重放它的 `inversePatch` 把行重新插回去，因此日志被裁剪过、
 * 或 id 指向的是 CREATE / UPDATE 时都恢复不了。要回到某次修改之前的形态请走 undo/redo。
 *
 * 恢复本身会再产生一条新的变更记录（可被推送到远端），而不是把那条 DELETE 抹掉——
 * 变更日志是只追加的。
 */
export interface RestoreEntityOptions {
  /** DELETE 类型的 `rxdb_change` 记录 id；实现按 `Number()` 解析，所以只能是十进制整数字符串 */
  changeId: string;
}

/**
 * 提交能力未启用时的 raw 写判定上下文
 *
 * @remarks
 * 这一支**结构上没有 `gate` 成员**（见 {@link RawWriteContext}），于是「能力位判断被挪到分派
 * 之后」在类型上就不成立。旧实现靠的是一个读 `domain` 即抛的取值器加一条「第 1 步一定排在它
 * 前面」的人工约定——约定写在注释里，而注释不参与编译。
 *
 * 单例而不是每次新建：它不持有任何 per-adapter 状态，而共享一个实例能让「同一个未启用形态」
 * 在测试里可直接比对。
 */
const CAPABILITY_DISABLED_RAW_WRITE_CONTEXT: RawWriteContext = Object.freeze({ capabilityEnabled: false });

/**
 * 数据库适配器基类（本地）
 */
export abstract class RxDBAdapterLocalBase extends RxDBAdapterBase {
  #workingTreeCaptureHook: WorkingTreeCaptureHook | undefined;

  /**
   * 启用态的 raw 写判定上下文；与 {@link RxDBAdapterLocalBase.workingTreeCaptureHook} 同生同灭。
   *
   * @remarks
   * 建在装载那一刻而不是每次取值：取值器在**每一条 raw 语句**上被调用，而这个对象不持有
   * 任何 per-call 状态——它只是「把语句转给这一个运行时」这件事本身。两个字段一起赋值、
   * 一起清空，于是「装了运行时却交出旧上下文」在结构上不成立。
   */
  #workingTreeRawWriteContext: RawWriteContext = CAPABILITY_DISABLED_RAW_WRITE_CONTEXT;

  /**
   * 捕获运行时；未启用提交能力的库上恒为 `undefined`。
   *
   * @internal
   */
  get workingTreeCaptureHook(): WorkingTreeCaptureHook | undefined {
    return this.#workingTreeCaptureHook;
  }

  /**
   * 本适配器当前的 raw 写判定上下文（adapter-contract.md §2）
   *
   * @remarks
   * `rawQuery?()` 是这张接口上的**可选方法**（见上方 `IRxDBAdapter`），核心包没法像四个挂载点
   * 那样替适配器包住它——判定只能由各适配器自己的 `rawQuery` 实现调用 `gateRawWrite(sql, ctx, …)`。
   * 那句调用要的 `ctx` 由这里交出来，于是六个适配器需要写对的只有「把它转给判定」这一句，
   * 「能力位怎么算」「域从哪来」两个真正容易写歪的问题一次都不会落到它们头上。
   *
   * 能力位直接由**捕获运行时装没装上**决定，不另存一个布尔：运行时只在能力位为真时被装上
   * （`RxDB.connect()` 读到真、或 `workingTree.enable()` 刚翻开）。再存一份就是第二份真相，
   * 而两份不同步的后果是单向的——门禁以为没开，raw 写全部放行。上下文对象本身在
   * `setWorkingTreeCaptureHook()` 里与运行时**同一句赋值**建好，不是每次取值新建：取值器在每条
   * raw 语句上都被调用，而它不含 per-call 状态。两个字段只在那一处一起变，「装了新运行时却
   * 交出绑着旧运行时的闭包」因此不是一种可达状态。
   *
   * 交出去的是**判定入口本身**，不是判定要看的那些东西（域、列集、受信意图）。核心因此不必
   * 复述捕获认什么，也就不存在「拷了一份域出来、插件后续登记的派生索引列只落进其中一份」这类
   * 双份清单——判定自始至终在运行时手上那一份上跑。
   *
   * @internal
   */
  get workingTreeRawWriteContext(): RawWriteContext {
    return this.#workingTreeRawWriteContext;
  }

  /**
   * 装上或卸下捕获运行时（adapter-contract.md §1 的四个挂载点）。
   *
   * @param hook - 接管四个挂载点的运行时；`undefined` 卸载
   *
   * @remarks
   * 挂载装在**这里**而不是让六个适配器各自在自己的 `transaction()` 里插一句：少写一次、
   * 写晚一次（在业务写之后才校验 token）都没有任何东西能发现，而那正是 §2「判定实现只有
   * 一份」要排除的形态。
   *
   * 调用方是 `RxDB.connect()`（确认能力位为真之后）与 `workingTree.enable()`（翻位成功
   * 之后）。未启用的库上一次都不会被调用，于是四个写原语连一层转发都没有。
   *
   * 幂等：已经装过就先卸下再装，不会叠成两层。
   *
   * @internal
   */
  setWorkingTreeCaptureHook(hook: WorkingTreeCaptureHook | undefined): void {
    uninstallWorkingTreeCapture(this);
    this.#workingTreeCaptureHook = hook;
    if (!hook) {
      this.#workingTreeRawWriteContext = CAPABILITY_DISABLED_RAW_WRITE_CONTEXT;
      return;
    }
    this.#workingTreeRawWriteContext = {
      capabilityEnabled: true,
      gate: <T>(sql: string, execute: () => Promise<T> | T): Promise<T> => hook.gateRawWrite(sql, execute)
    };
    const installed = installWorkingTreeCapture(this, hook);
    hook.bindMountTarget(this, installed);
  }

  /**
   * 判定一个落库值是否已处于「加密后的 at-rest 形态」（FR-038）。
   *
   * @param value - 落库列里的值；调用方保证它既非 `null` 也非 `undefined`
   * @returns 是加密后的落库形态时为 `true`
   *
   * @remarks
   * **缺席是契约允许的形态**，与 {@link RxDBAdapterLocalBase.reconcileEntityIndexes} 同一
   * 口径：不支持列加密的适配器不实现它。缺席**不等于放行**——调用方（提交写路径）拿不到
   * 判定器却确实有加密列要判时，fail-closed 地抛错，而不是跳过检查。
   *
   * 声明在这里、实现留给适配器，是因为权威判定器是 `@aiao/rxdb-adapter-encrypted` 的
   * `isEnvelope`，而 `@aiao/rxdb` **不能**依赖它：后者 peer-depend 前者，依赖方向是反的。
   * 一个 `PropertyType.string` 的加密列，明文与密文都是字符串，核心自己猜形状等于装一个
   * 会看走眼的门卫。
   *
   * 与 {@link RxDBAdapterLocalBase.setWorkingTreeCaptureHook} 同属「可选能力槽位」：核心
   * 只声明位置与语义，不替六个后端决定有没有。
   */
  isEncryptedAtRest?(value: unknown): boolean;

  /**
   * 一张实体表在本适配器发出的 SQL 里可能被写成的全部名字。
   *
   * @param metadata - 实体元数据；答案只由它决定，不读任何实例状态
   * @returns 未归一化、不带 schema 限定的物理表名；至少一个
   *
   * @remarks
   * **命名规则归写表的那一方所有。** 在这条能力之前，
   * `@aiao/rxdb-plugin-working-tree` 的版本化域自己按 `'$'` 把 sqlite 家族的折叠规则重拼了
   * 一遍。抄来的规则不会因为原件改了而报错，它只是开始算错——而算错的后果是单向的：
   * raw 写门禁认不出某张受版本控制的表，于是**静默放行**一条绕过捕获的写。
   *
   * 默认实现交出逻辑名、一个字都不猜。替后端猜一个「常见」形态（比如把 sqlite 家族的
   * `namespace$table` 写成默认）只是把抄规则这件事从插件挪到核心，而且从此没有任何一个
   * 后端会因为忘了覆写而被发现——它会一直拿着别人的规则算自己的表名。
   *
   * **有默认实现而不是 `abstract`**，与 {@link RxDBAdapterLocalBase.migrateSystemSchema}
   * 同一口径：这是一次对既有基类的扩展，`abstract` 会让仓外每一个自建适配器在升级时直接
   * 编译不过，而它们里面**不折叠命名空间的那一批本来就是对的**。代价是「忘了覆写」与
   * 「确实不需要」在类型上同形；折叠命名空间的后端（sqlite 家族）必须自己覆写。
   *
   * 不带 schema 限定：`"public"."post"` 这种形态在 raw 判定的限定剥离一步里已经被还原成
   * 逻辑名了，这里再登记一遍只是同一个名字的第二种写法。要登记的是**剥不掉**的那一种。
   */
  physicalTableNames(metadata: EntityMetadata): readonly string[] {
    return [metadata.tableName];
  }

  /**
   * 在应用迁移或仓储运行前升级 RxDB 拥有的表。
   * 不需要持久化系统 schema 状态的 adapter 保持默认的 no-op 实现。
   */
  migrateSystemSchema(): Promise<void> {
    return Promise.resolve();
  }

  abstract isTableExisted(EntityType: EntityType): Promise<boolean>;

  abstract transaction<T extends TransactionFun>(fun: T, transactionLog?: boolean): Promise<Awaited<ReturnType<T>>>;
  abstract transaction(fun: TransactionFun, transactionLog?: boolean): Promise<unknown>;

  /**
   * 执行 **引导期**（表结构尚未就绪）的事务。
   *
   * @param fun 事务回调函数
   * @param transactionLog 是否写事务日志。默认 `true`；纯 DDL / 元数据引导应显式传 `false`
   *
   * @remarks
   * 与 {@link transaction} 的唯一区别是**跳过「引导已完成」就绪门**。适配器的就绪门等的正是
   * `RxDB.connect()`，而引导期的调用方就在那个 promise 里面 —— 走 {@link transaction} 会等自己，
   * 永久挂起。此时表可能尚未建出，调用方自己负责顺序。
   *
   * 调用方限于两类：`RxDB.connect()` 自身的引导链路（水位线、建表、迁移），以及
   * **在 `connect()` 内部被安装的插件**（它们的 `install()` 同样跑在那条 promise 里，
   * 见 `@aiao/rxdb-plugin-search` 的 FTS 安装）。业务代码一律用 {@link transaction}。
   *
   * `transactionLog` 必须在这里就能传：引导期的 DDL 不属于任何用户变更，写日志会白白触发
   * 一次分支号读取与全量触发器重建。默认实现直接委托 {@link transaction}，
   * 只有自带就绪门的适配器需要覆写。
   *
   * @internal
   */
  bootstrapTransaction<T extends TransactionFun>(fun: T, transactionLog?: boolean): Promise<Awaited<ReturnType<T>>> {
    return this.transaction(fun, transactionLog);
  }

  /**
   * 新开一个事务，**或者**复用调用方已经在的那个。
   *
   * @param fun - 事务工作，参数是本次事务的 executor
   * @param transactionLog - 是否写事务日志
   * @returns `fun` 的返回值
   *
   * @remarks
   * 与 {@link transaction} 的差别不在这个方法体里，而在 `this` 是谁：真实适配器上两者同义，
   * 都新开一个排队事务；而事务内的调用方拿到的是 executor 门面，门面把本方法特判成
   * `executor.run()`——复用当前事务且**绝不重新入队**。SQLite family 与 PGlite 各自的覆写只是
   * 在这一句前面加了断连 / 只读断言，语义与此处逐字相同。
   *
   * 捕获运行时要写工作树行就必须有一个 executor，而「该新开还是该复用」只有调用宿主知道。
   * 直接调 `transaction()` 的话，事务内的那一半调用会去排队等一个自己正占着的槽位——表现为
   * 永久挂起而不是报错。
   */
  runInTransaction<T extends TransactionFun>(fun: T, transactionLog?: boolean): Promise<Awaited<ReturnType<T>>> {
    return this.transaction(fun, transactionLog);
  }

  /**
   * 关闭**引导窗**：`RxDB.connect()` 完成建表后调用一次。
   *
   * @remarks
   * 自带就绪门的适配器（SQLite family / PGlite）在引导窗内让 `query()` / `rawQuery()` /
   * `createTables()` 跳过就绪门 —— 那道门等的正是尚未 settle 的 `RxDB.connect()`。
   * 本方法把状态翻到 `ready`，此后所有入口一律走正常的就绪等待。
   * 没有就绪门的 adapter 保持默认的 no-op 实现。
   *
   * @internal
   */
  completeBootstrap(): void {
    // no-op：默认适配器没有引导窗
  }

  abstract createTables(EntityTypes: EntityType[], entities?: InstanceType<EntityType>[]): Promise<boolean>;

  /** 在用户迁移和缺表补建后幂等收敛实体索引。 */
  reconcileEntityIndexes?(EntityTypes: EntityType[]): Promise<void>;

  abstract switchBranch(options: SwitchBranchOptions): Promise<void>;

  abstract getRxDBChangeSequence(): Promise<number>;

  /**
   * 应用压缩后的变更到本地实体表
   *
   * 实现策略（SQLite）：
   * 1. 将 actions 转换为 SQL 操作
   * 2. 在事务中：
   *    a) 执行 SQL 操作实体表（INSERT/UPDATE/DELETE）
   *    b) 批量插入 localChanges 到 RxDBChange 表（用于历史追踪）
   * 3. 发送本地事件通知 UI 更新
   *
   * @param actions - 压缩后的变更操作集合（从远程 pull 来的）
   * @param localChanges - 需要保存到本地 RxDBChange 表的记录（可选）
   * @param disableTriggers - 是否禁用触发器（用于 pull 等操作，避免创建 RxDBChange）
   */
  abstract mergeChanges(
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers?: boolean
  ): Promise<number | void>;

  /**
   * 获取指定 ID 列表的元数据（QueryCache 专用）
   *
   * 用于本地缓存新鲜度检查，返回 ID → updatedAt 映射。
   *
   * @param entityName - 实体名称
   * @param ids - 实体 ID 列表
   * @returns Observable<Map<string, string>> - ID → updatedAt 映射
   *
   * @example
   * ```typescript
   * adapter.getMetadataByIds('Product', ['p1', 'p2'])
   *   .subscribe(map => {
   *     // map: Map { 'p1' => '2026-01-12T10:00:00Z', 'p2' => '2026-01-12T09:30:00Z' }
   *   });
   * ```
   */
  abstract getMetadataByIds(entityName: string, ids: string[]): Observable<Map<string, string>>;

  /**
   * 批量 upsert 数据（QueryCache 专用）
   *
   * 执行 INSERT OR REPLACE 语义，用于缓存远程拉取的数据。
   *
   * @param entityName - 实体名称
   * @param data - 要写入的数据列表
   * @returns Observable<void>
   *
   * @example
   * ```typescript
   * adapter.upsertMany('Product', [product1, product2]).subscribe();
   * ```
   */
  abstract upsertMany<T>(entityName: string, data: T[]): Observable<void>;

  /**
   * 按 ID 列表批量删除（QueryCache 专用）
   *
   * 用于清理本地缓存中已被远程删除的数据。
   *
   * @param entityName - 实体名称
   * @param ids - 要删除的 ID 列表
   * @returns Observable<void>
   *
   * @example
   * ```typescript
   * adapter.deleteByIds('Product', ['p1', 'p2']).subscribe();
   * ```
   */
  abstract deleteByIds(entityName: string, ids: string[]): Observable<void>;
}

/**
 * 数据库适配器基类（远程）
 */
export abstract class RxDBAdapterRemoteBase extends RxDBAdapterBase {
  /**
   * 从远程拉取变更记录
   *
   * @param sinceId - 拉取此 ID 之后的变更（不包含该 ID）
   * @param limit - 最大拉取数量
   * @param repositoryFilter - 可选的实体过滤列表（用于 repository-level sync）
   * @param filter - 可选的行级过滤条件（用于 SyncType.Filter）
   * @param branchId - 可选的分支 ID（只拉取该分支的变更）
   * @returns 变更记录数组，按 id ASC 排序
   *
   * @remarks
   * 当提供 filter 参数时，会通过 JOIN 实体表并应用过滤条件，
   * 只返回满足条件的实体对应的变更记录。
   */
  abstract pullChanges(
    sinceId: number,
    limit?: number,
    repositoryFilter?: string[],
    filter?: RuleGroup,
    branchId?: string
  ): Promise<RemoteChange[]>;

  /**
   * 获取远程变更数量（轻量级，不下载数据）
   *
   * 此方法只查询远程有多少新变更，不返回实际数据。
   * 用于实现 checkRepositoryUpdates() 功能，节省带宽。
   *
   * @param sinceId - 起始 changeId（不包含该 ID）
   * @param repositoryFilter - 可选的实体过滤列表
   * @param branchId - 可选的分支 ID（只计数该分支的变更）
   * @returns 变更数量和最新 changeId
   */
  abstract getChangeCount(
    sinceId: number,
    repositoryFilter?: string[],
    branchId?: string
  ): Promise<{
    count: number;
    latestChangeId: number;
  }>;

  /**
   * 应用压缩后的变更到远程实体表
   *
   * 实现策略（Supabase）：
   * 1. 将 actions (Map) 转换为 RemoteChange 记录
   * 2. 在事务中：
   *    a) 写入远程 RemoteChange 表（用于其他客户端 pull）
   *    b) 直接操作远程实体表（INSERT/UPDATE/DELETE）
   *
   * @param actions - 压缩后的变更操作集合（从本地 push 来的）
   * @param branchId - 分支 ID（用于在远程变更记录中设置 branchId）
   * @param changes - 完整的原始变更记录（可选，用于保留完整的变更历史）
   * @returns 创建的远程 RxDBChange 的最大 ID（用于更新 lastPullRemoteChangeId）
   *
   * @remarks
   * 提供 `changes` 时，实现必须以客户端 ID 和本地 change ID 作为幂等键。相同批次重试时不得重复执行
   * 实体副作用，并且必须为每个本地 change ID 返回首次提交得到的同一个远端 ID。
   */
  abstract mergeChanges(
    actions: SwitchVersionActions,
    branchId?: string,
    changes?: IRxDBChange[]
  ): Promise<RemoteMergeResult | number | void>;

  /**
   * 批量拉取多个实体的变更记录（单次 HTTP 请求）
   *
   * 每个实体可以有不同的 sinceId（水位线），通过服务端 OR 过滤
   * 实现单次请求获取所有实体的变更。
   *
   * @param requests - 每个实体的拉取请求（namespace + 实体名 + sinceId）
   * @param limit - 最大拉取数量
   * @param branchIds - 分支 ID 列表（支持包含祖先分支）
   * @returns 变更记录数组，按 id ASC 排序
   */
  pullChangesBatch?(requests: PullBatchRequest[], limit: number, branchIds?: string[]): Promise<RemoteChange[]>;

  /**
   * 获取实体元数据，用于新鲜度比较（QueryCache 专用）
   *
   * 只返回 `{ id, updatedAt }` 元数据，网络传输量比完整数据减少 90%+。
   * 这是 QueryCache 同步策略的核心能力。
   *
   * @param entityName - 实体名称
   * @param query - 查询条件
   * @returns Observable<QueryCacheEntityMetadata[]> - 实体 ID 和 updatedAt
   *
   * @example
   * ```typescript
   * adapter.fetchMetadata('Product', { where: { status: 'active' } })
   *   .subscribe(metadata => {
   *     // metadata: [{ id: 'p1', updatedAt: '2026-01-12T10:00:00Z' }, ...]
   *   });
   * ```
   *
   * @remarks
   * 实现必须满足以下两条契约，二者都是调用方**承重**的前提，不是建议（RV-001 / RV-002）：
   *
   * **1. 恰好发射一次全量结果，然后 `complete`。**
   * 分页实现要把所有页拼好再发一次，不能每页一发。原因是两个调用点的语义正好相反：
   * - `QueryCacheEngine`（`#syncQuery` / `#syncAndReadLocal`）用 `forkJoin` —— 只保留**最后一次**
   *   发射，且**不 complete 就永远不产出**。逐页发射会静默丢掉除末页以外的全部元数据，
   *   进而把它们误判成 orphan 并从本地缓存中驱逐。
   * - `query-cache-primary` 的 `#fetchMetadata` 用 `firstValueFrom` —— 只取**第一次**发射。
   *   逐页发射会让它只看到首页。
   *
   * **2. 传输失败必须能被 `isNetworkError` 判 `true`，业务失败必须判 `false`。**
   * 最省事也最可靠的做法是传输失败直接抛 `NetworkOfflineError`（`isNetworkError` 的第 1 条
   * 判据就是 `instanceof`，不依赖任何字符串约定，命中即 `true`）。
   *
   * 抛**其他**错误类型时才要当心数字 `status` 属性：第 2 条判据是「带数字 `status` ⇒ 不是
   * 网络错误」，会在第 3、4、5 条（`errno` / `name` / `TypeError` + 消息正则）之前把它判死。
   * 也就是说传输失败挂 `status` 会被判成业务失败，而业务失败**应当**挂上 `status` ——
   * 那正是 HTTP 适配器让 `HttpResponseError` 带状态码、让 `HttpDisconnectedError` 不带的原因。
   *
   * 分类错了不会报错，只会让 `find({ offlineFallback: true })` 在断网时不返回缓存而是抛异常；
   * 反向错了（把 RLS 拒绝当成离线）则会让调用方拿到陈旧缓存而看不到真正的失败原因。
   */
  abstract fetchMetadata(entityName: string, query: RuleGroup<unknown>): Observable<QueryCacheEntityMetadata[]>;

  /**
   * 按 ID 列表批量获取完整数据（QueryCache 专用）
   *
   * 用于拉取过时或缺失的数据，避免 N+1 问题。
   *
   * @param entityName - 实体名称
   * @param ids - 需要获取的实体 ID 列表
   * @returns Observable<T[]> - 完整实体数据
   *
   * @example
   * ```typescript
   * adapter.findByIds('Product', ['p1', 'p2', 'p3'])
   *   .subscribe(products => {
   *     // products: [{ id: 'p1', name: 'Product A', ... }, ...]
   *   });
   * ```
   *
   * @remarks
   * 与 {@link RxDBAdapter.fetchMetadata} 同契约：**恰好发射一次**（`ids` 分块查询要合并后再发，
   * 调用方同样用 `forkJoin`）并 `complete`；传输失败要抛能被 `isNetworkError` 判 `true` 的错误。
   */
  abstract findByIds<T>(entityName: string, ids: string[]): Observable<T[]>;

  pushBranches?(branches: Record<string, unknown>[]): Promise<{ synced: number; skipped: string[] }>;

  branchExists?(branchId: string): Promise<boolean>;

  pullBranches?(): Promise<RemoteBranchInfo[]>;
}

/**
 * 远程分支信息
 */
export interface RemoteBranchInfo {
  id: string;
  fromChangeId?: number | null;
  parentId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * 适配器基础配置
 */
export type IRxDBAdapterOptions = object;

/**
 * 适配器工厂：`RxDB.adapter()` 登记的就是它，而不是已经建好的适配器实例
 *
 * @remarks
 * 登记工厂而非实例，是为了让适配器的构造推迟到 `RxDB.connect()`——建实例往往要打开文件、
 * 申请 OPFS 句柄、加载 WASM，这些都不该在模块求值期发生。
 *
 * 返回值允许同步也允许 `Promise`，于是需要 `await import()` 懒加载 WASM 的适配器
 * 和纯同步构造的适配器共用一条登记路径。
 */
export type AdapterFactory = (rxDB: RxDB) => Promise<IRxDBAdapter> | IRxDBAdapter;

/**
 * 已注册适配器的类型注册表
 *
 * @remarks
 * 这个接口**有意为空**：每个适配器包用 `declare module '@aiao/rxdb'` 把自己的名字
 * 与实现类合并进来（`rxdb-adapter-sqlite` / `-sqlite-wasm` / `-wa-sqlite` /
 * `-pglite` / `-sqliteai` 五个包都这么做）。
 *
 * 此前这里带着 `[name: string]: IRxDBAdapter` 索引签名，
 * 于是 `keyof RxDBAdapters` 恒为 `string`、`RxDBAdapters[K]` 恒为 `IRxDBAdapter` ——
 * 那五处 `declare module` **一个都没生效**，`getAdapter('sqlite')` 永远只能拿到基接口。
 * 索引签名已删除；「名字可以是任意字符串」这件事改由
 * {@link RxDBAdapterName} 和 `getAdapter` 的宽松重载承担。
 *
 * @example
 * ```ts
 * declare module '@aiao/rxdb' {
 *   interface RxDBAdapters {
 *     sqlite: RxDBAdapterSqlite;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type -- 声明合并注册表，空是它的正确初始状态
export interface RxDBAdapters {}

/**
 * 适配器名称
 *
 * @remarks
 * `(string & {})` 那一支让任意字符串都能传（未注册类型的适配器照样可用），
 * 同时保留 {@link RxDBAdapters} 已注册键的自动补全 —— 直接写 `string` 会把补全全吃掉。
 */
export type RxDBAdapterName = keyof RxDBAdapters | (string & {});

/**
 * 已注册门面仓储的类型注册表
 *
 * @remarks
 * 门面轴（`@Entity({ repository: 'X' })` → `getRepository(E)` 拿到什么）的名字表。
 * 核心只自带 `Repository` 一项（由 `EntityManager` 的构造函数登记到运行期），
 * 插件包用 `declare module '@aiao/rxdb'` 把自己的门面合并进来，与核心那项同为一等公民
 * （`TreeRepository` 就来自 `@aiao/rxdb-plugin-tree`）。
 *
 * 与 {@link RxDBAdapters} 同一套模板，同一个禁忌：**绝不能加索引签名**。
 * 一旦加上，`keyof RxDBRepositories` 就塌成 `string`，所有 `declare module` 静默失效。
 * 「名字可以是任意字符串」这件事由 {@link RxDBRepositoryName} 的 `(string & {})` 那一支承担。
 *
 * 值写成 `typeof X`（构造器类型）而非实例类型：三个门面的类型形参都无默认值，
 * 实例类型在这里写不出来，而注册表要的本来就是「哪个类」。
 *
 * @example
 * ```ts
 * declare module '@aiao/rxdb' {
 *   interface RxDBRepositories {
 *     GraphRepository: typeof GraphRepository;
 *   }
 * }
 * ```
 */
export interface RxDBRepositories {
  Repository: typeof Repository;
}

/**
 * 门面仓储名称
 *
 * @remarks
 * `(string & {})` 那一支让未注册类型的门面名照样传得进 `@Entity({ repository })`，
 * 同时保留 {@link RxDBRepositories} 已注册键的自动补全。
 *
 * 类型放宽**不代表**运行期放宽：名字没经 `RxDB.repository()` 登记过，
 * `EntityManager.init()` 仍按 `Repository '<name>' not found for entity '<entity>'` 抛错。
 */
export type RxDBRepositoryName = keyof RxDBRepositories | (string & {});
