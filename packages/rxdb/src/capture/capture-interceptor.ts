/**
 * @fileoverview 四个捕获挂载点的**安装层**：把 `RxDBAdapterLocalBase` 上的五个写原语包成
 * 可拦截的实例方法（adapter-contract.md §1）。
 *
 * @remarks
 * **为什么是包装而不是「基类里写一个具体方法调 protected abstract 原语」。**
 * 那个模板方法形态需要把抽象原语改名（`transaction` → `runTransaction` 之类），而
 * `capture-mount-points.spec.ts` 的漂移比对读的是 `rxdb-adapter.ts` 的**真实源码文本**：
 * 它要求 `RxDBAdapterLocalBase` 上仍然存在形参名逐字为 `(fun, transactionLog)` 的两条
 * `abstract transaction` 声明。改名之后那条比对查不到声明，而它恰恰是「挂载点没被悄悄摘掉」
 * 的唯一机器化证据。所以抽象声明**一个字都不动**，拦截发生在实例上。
 *
 * **为什么不让六个适配器各自调用一句捕获。**
 * 那等于把「有没有挂」变成六份人工约定：少写一次、写晚一次（在业务写之后才校验 token）都没有
 * 任何东西能发现，而这正是 adapter-contract.md §2「判定实现只有一份」要排除的形态。
 *
 * **未安装钩子时逐字节退化成没有这个特性。** {@link installWorkingTreeCapture} 只在启用提交能力
 * 时被调用；没调用过的库，五个原语连一层包装都没有。FR-046 的零行为差异因此是结构性的，
 * 而不是靠一个运行时判断维持的。
 *
 * **本文件归核心，不随 `@aiao/rxdb-plugin-working-tree` 走。** 它是`RxDBAdapterLocalBase`
 * 自己的装卸机制——`setWorkingTreeCaptureHook()` 直接调 {@link installWorkingTreeCapture}，
 * 搬进插件就等于核心 import 插件。{@link WorkingTreeCaptureHook} 因此只列**核心真正会调的**
 * 成员：四个挂载点、一次认领、两道转交门。域与实体归类不在其列——本文件一次都不读它们，
 * 列进来只会让核心替捕获语义的形状背书。插件那侧的实现类照常在契约之外多长成员
 * （`domain` / `targetClassOf`），那是它自己和它自己的套件之间的事。
 */

import type { Observable } from 'rxjs';
import type { SwitchBranchOptions, TransactionFun } from '../rxdb-adapter.js';
import type { SwitchVersionActions } from '../sync-contract/VersionManager.interface.js';
import type { RxDBChange } from '../system/change.js';

/**
 * 被拦截的批量写方法。
 *
 * @remarks
 * 这个集合随核心的写原语变，所以它归核心——`@aiao/rxdb-plugin-working-tree` 的
 * `BulkWriteOperation` 是本类型的**别名**，不是平行的第二份声明。加第四个批量写原语时，
 * 改这里一处，插件侧按操作键的查找表会因穷尽性检查一并变红。
 */
export type InterceptedBulkWrite = 'upsert_many' | 'delete_by_ids';

/**
 * 一次写调用的**宿主**：真实适配器本身，或事务内的 executor 门面
 *
 * @remarks
 * 两者是同一个类的两副面孔，区别只在 `runInTransaction`：真实适配器上它新开一个排队事务，
 * 门面上它被特判成 `executor.run()`——复用当前事务且**绝不重新入队**。捕获运行时要写工作树行
 * 就必须有一个 executor，而「该新开还是该复用」只有宿主知道，所以取事务的唯一正确写法是
 * 问宿主要，不是自己调 `adapter.transaction()`。
 *
 * 写原语的 `this` 也必须是宿主：`mergeChanges` 会把收到的 adapter 一路传给内部 helper，
 * 绑到真实适配器会让它们的 query 走队列——而此刻队列唯一的槽位正被当前事务占着，即自锁。
 */
export interface WorkingTreeWriteHost {
  /** 新开（真实适配器）或复用（executor 门面）一个事务 */
  runInTransaction<T extends TransactionFun>(fun: T, transactionLog?: boolean): Promise<Awaited<ReturnType<T>>>;
}

/**
 * 未经拦截的五个写原语
 *
 * @remarks
 * 安装时原样留存，供两类调用方使用：**引导期**（`bootstrapTransaction` —— 建表与迁移不属于
 * 任何用户变更，捕获它们会在工作树里凭空长出整库的行），以及**捕获运行时自己**
 * （钩子要在原语外面加一层，必须能拿到不含自己的那一层，否则递归）。
 *
 * 这里的五个函数都**绑死在安装宿主上**。需要按调用宿主重新绑定的那一个（`mergeChanges`）由
 * {@link MergeChangesNext} 单独提供，不走这里。
 */
export interface RawWritePrimitives {
  /** 未拦截的 {@link RxDBAdapterLocalBase.transaction} */
  transaction(fun: TransactionFun, transactionLog?: boolean): Promise<unknown>;

  /** 未拦截的本地 `mergeChanges` 重载 */
  mergeChanges(
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers?: boolean
  ): Promise<number | void>;

  /** 未拦截的 `switchBranch` */
  switchBranch(options: SwitchBranchOptions): Promise<void>;

  /** 未拦截的 `upsertMany` */
  upsertMany<T>(entityName: string, data: T[]): Observable<void>;

  /** 未拦截的 `deleteByIds` */
  deleteByIds(entityName: string, ids: string[]): Observable<void>;
}

/**
 * 可重新绑定宿主的未拦截 `mergeChanges`
 *
 * @remarks
 * 挂载点 2 唯一需要它的地方：捕获要和业务写落在**同一个事务**里，于是运行时先问宿主要一个
 * executor，再把业务写发到那个 executor 的门面上。`host` 形参就是这次要当 `this` 的对象，
 * 少了它就只能用安装时绑定的真实适配器，而那条路径在事务内必然自锁。
 */
export type MergeChangesNext = (
  host: WorkingTreeWriteHost,
  actions: SwitchVersionActions,
  localChanges?: Omit<RxDBChange, 'id'>[],
  disableTriggers?: boolean
) => Promise<number | void>;

/**
 * 捕获运行时接管四个挂载点的转交口
 *
 * @remarks
 * 每个方法都收一个 `next`——**还没被调用的**原语。于是「先判定 / 先取水位线，再执行业务写」
 * 在类型上就是唯一写法，`gateBulkWrite` 所要求的「返回 Observable 之前同步拒绝」也才有地方
 * 落实：{@link interceptBulkWrite} 的返回类型是裸的 `Observable<void>`，它拿到的 `next`
 * 可以一次都不调用。
 *
 * 每个方法还都收一个 `host`——本次调用的实际 `this`。挂载点装在**实例**上，而同一个实例会经
 * executor 门面被再次调用（`executor.mergeChanges` 就是
 * `adapter.mergeChanges.call(facade, …)`）；把 `host` 丢掉就等于把事务内的调用改写成事务外的
 * 调用，后果是自锁而不是报错。
 */
export interface WorkingTreeCaptureHook {
  /**
   * 认领安装宿主与它那份未拦截原语；{@link installWorkingTreeCapture} 之后立刻调用一次
   *
   * @param target - 被装上挂载点的适配器实例；同时是适配器级写意图声明的作用域键
   * @param raw - 未经拦截的五个原语
   *
   * @remarks
   * 两样东西都只有安装方知道，而两样运行时都要：`target` 是
   * {@link declareTrustedWrite} 用的作用域身份——挂载点 2 / 3 的调用方把意图声明在适配器上，
   * 运行时得拿同一个对象才查得到；`raw` 则是捕获自己发写的唯一安全入口，
   * 走被拦截的那份会立刻递归回挂载点自己。
   */
  bindMountTarget(target: WorkingTreeCaptureMountTarget, raw: RawWritePrimitives): void;

  /** 挂载点 1：整事务共享一个 `unitId` 的原子边界 */
  interceptTransaction(
    host: WorkingTreeWriteHost,
    next: RawWritePrimitives['transaction'],
    fun: TransactionFun,
    transactionLog?: boolean
  ): Promise<unknown>;

  /** 挂载点 2：本地 `mergeChanges`（远端同名重载不在此列，它在 `RxDBAdapterRemoteBase` 上） */
  interceptMergeChanges(
    host: WorkingTreeWriteHost,
    next: MergeChangesNext,
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers?: boolean
  ): Promise<number | void>;

  /** 挂载点 3：分支物化 / redo 失效 / undo-redo 应用 */
  interceptSwitchBranch(
    host: WorkingTreeWriteHost,
    next: RawWritePrimitives['switchBranch'],
    options: SwitchBranchOptions
  ): Promise<void>;

  /** 挂载点 4：`upsertMany` / `deleteByIds` 的门禁 */
  interceptBulkWrite(
    host: WorkingTreeWriteHost,
    next: () => Observable<void>,
    entityName: string,
    operation: InterceptedBulkWrite
  ): Observable<void>;

  /**
   * 转交门 1：一条 raw 写语句（adapter-contract.md §2 的 5 步判定）
   *
   * @typeParam T - 语句执行体的返回类型；放行时原样透传
   * @param sql - 待判定的语句原文
   * @param execute - **还没被调用的**执行体
   * @returns `execute()` 的返回值本身
   * @throws 目标落在版本化业务表且不满足任何放行条件时抛出；此时 `execute` 一次都不会被调用
   *
   * @remarks
   * `rawQuery?()` 是适配器接口上的**可选方法**，核心包没法像四个挂载点那样替适配器包住它，
   * 判定只能由各适配器自己的实现调用 {@link gateRawWrite}。而那个函数在核心里只剩一句分派：
   * 能力位为假直接放行，为真转交到这里。**判定实现一个字都不在核心**——它认的是语句词法、
   * 表名的六种物理形态与受信意图，三样都随捕获规则变。
   */
  gateRawWrite<T>(sql: string, execute: () => Promise<T> | T): Promise<T>;

  /**
   * 转交门 2：一次 `notifyExternalUpdate()`（写入口语义矩阵行 11）
   *
   * @typeParam T - 通知体的返回类型；放行时原样透传
   * @param entityName - 被通知的实体名
   * @param namespace - 已知时直接用；`rxdb` 即系统表
   * @param notify - **还没被调用的**通知体
   * @returns `notify()` 的返回值本身
   * @throws 目标是版本化业务实体时抛出；此时一条事件都不会派发
   *
   * @remarks
   * 与 {@link gateRawWrite} 同一个理由挂在这张契约上：核心的 `notifyExternalUpdate()` 拦得住
   * 自己，却回答不了「这个实体归哪一类」——那要问域，而域是捕获的。核心因此只交出实体身份，
   * 把「归哪类、这一类在行 11 上是放是拒」整段留给运行时。
   *
   * **门包着通知体，不是通知之后补的一句断言**：拿到的是还没被调用的回调，「先判定」于是在
   * 类型上就是唯一写法；写成先派发再检查的话，拒绝也阻止不了事件已经发出去。
   */
  gateExternalNotify<T>(entityName: string, namespace: string | undefined, notify: () => T): T;
}

/** {@link installWorkingTreeCapture} 要改写的那个对象所需的最小面。 */
export type WorkingTreeCaptureMountTarget = RawWritePrimitives & WorkingTreeWriteHost;

/** 安装前五个方法各自的属性描述符；`undefined` 表示当时是从原型上继承来的。 */
type SavedDescriptors = Readonly<Record<keyof RawWritePrimitives, PropertyDescriptor | undefined>>;

/** 被改写的五个方法名；安装与卸载共用一份，少写一个就是一个永久敞口。 */
const PRIMITIVE_NAMES = ['transaction', 'mergeChanges', 'switchBranch', 'upsertMany', 'deleteByIds'] as const;

/** 安装时留存的属性描述符；卸载要按「当时是自有属性还是继承来的」分别还原。 */
const SAVED = new WeakMap<WorkingTreeCaptureMountTarget, SavedDescriptors>();

/** 把一个函数装成实例自有属性；原型上的同名方法保持不动，`super.x()` 仍然通到未拦截的那份。 */
const define = (target: object, name: string, value: unknown): void => {
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
};

/**
 * 在一个本地适配器实例上装好四个捕获挂载点
 *
 * @param target - 适配器实例
 * @param hook - 接管四个挂载点的捕获运行时
 * @returns 未经拦截的五个写原语；交给捕获运行时的 {@link WorkingTreeCaptureHook.bindMountTarget}
 *
 * @remarks
 * **安装时机是「装钩子的那一刻」，不是构造函数。** 构造函数里装会被子类的类字段覆盖回去——
 * 类字段的赋值排在 `super()` 之后，`transaction = vi.fn()` 这种写法会把刚装好的包装整个冲掉，
 * 而且此刻 `this.transaction` 本身还是 `undefined`，连原语都绑不到。装在钩子到位时，对象
 * 已经构造完毕，两个问题一起消失。
 *
 * **五个包装都是 `function` 而不是箭头函数。** 事务内的调用经 executor 门面到达同一个实例
 * （`adapter.mergeChanges.call(facade, …)`），`this` 就是「这次写该落在哪个事务里」的全部信息。
 * 箭头函数把它丢掉，于是事务内的合并会被当成事务外的合并去排队——而队列唯一的槽位正被本事务
 * 占着，表现为永久挂起而不是报错。
 *
 * `upsertMany` / `deleteByIds` 的包装是**同步**转发，中间没有 `async`：包成 async 会把同步
 * 抛出的拒绝变成 rejected promise，而 adapter-contract.md §1.1 要的正是「调用方手里没有
 * Observable 可以订阅」。
 *
 * @example
 * ```ts
 * setWorkingTreeCaptureHook(hook: WorkingTreeCaptureHook): void {
 *   hook.bindMountTarget(this, installWorkingTreeCapture(this, hook));
 * }
 * ```
 */
export function installWorkingTreeCapture(
  target: WorkingTreeCaptureMountTarget,
  hook: WorkingTreeCaptureHook
): RawWritePrimitives {
  const original = {
    transaction: target.transaction,
    mergeChanges: target.mergeChanges,
    switchBranch: target.switchBranch,
    upsertMany: target.upsertMany,
    deleteByIds: target.deleteByIds
  };
  SAVED.set(target, {
    transaction: Object.getOwnPropertyDescriptor(target, 'transaction'),
    mergeChanges: Object.getOwnPropertyDescriptor(target, 'mergeChanges'),
    switchBranch: Object.getOwnPropertyDescriptor(target, 'switchBranch'),
    upsertMany: Object.getOwnPropertyDescriptor(target, 'upsertMany'),
    deleteByIds: Object.getOwnPropertyDescriptor(target, 'deleteByIds')
  });

  const raw: RawWritePrimitives = {
    transaction: original.transaction.bind(target),
    mergeChanges: original.mergeChanges.bind(target),
    switchBranch: original.switchBranch.bind(target),
    upsertMany: original.upsertMany.bind(target),
    deleteByIds: original.deleteByIds.bind(target)
  };

  define(
    target,
    'transaction',
    function (this: WorkingTreeCaptureMountTarget, fun: TransactionFun, transactionLog?: boolean): Promise<unknown> {
      return hook.interceptTransaction(this, original.transaction.bind(this), fun, transactionLog);
    }
  );

  const mergeChangesNext: MergeChangesNext = (host, actions, localChanges, disableTriggers) =>
    original.mergeChanges.call(host as WorkingTreeCaptureMountTarget, actions, localChanges, disableTriggers);

  define(
    target,
    'mergeChanges',
    function (
      this: WorkingTreeCaptureMountTarget,
      actions: SwitchVersionActions,
      localChanges?: Omit<RxDBChange, 'id'>[],
      disableTriggers?: boolean
    ): Promise<number | void> {
      return hook.interceptMergeChanges(this, mergeChangesNext, actions, localChanges, disableTriggers);
    }
  );

  define(
    target,
    'switchBranch',
    function (this: WorkingTreeCaptureMountTarget, options: SwitchBranchOptions): Promise<void> {
      return hook.interceptSwitchBranch(this, original.switchBranch.bind(this), options);
    }
  );

  define(target, 'upsertMany', function <
    T
  >(this: WorkingTreeCaptureMountTarget, entityName: string, data: T[]): Observable<void> {
    return hook.interceptBulkWrite(
      this,
      () => original.upsertMany.call(this, entityName, data),
      entityName,
      'upsert_many'
    );
  });

  define(
    target,
    'deleteByIds',
    function (this: WorkingTreeCaptureMountTarget, entityName: string, ids: string[]): Observable<void> {
      return hook.interceptBulkWrite(
        this,
        () => original.deleteByIds.call(this, entityName, ids),
        entityName,
        'delete_by_ids'
      );
    }
  );

  return raw;
}

/**
 * 卸载捕获挂载点，把五个写原语恢复到安装前的样子
 *
 * @param target - 之前被 {@link installWorkingTreeCapture} 改写过的适配器实例
 *
 * @remarks
 * **还原的是「属性描述符」，不是一律装回绑定函数。** 原语在正常适配器上来自原型，删掉自有属性
 * 就恢复了——而且恢复的是 `this` 多态的那一份，事务内经门面调用仍然落在本事务里。装回
 * `bind(target)` 的版本会把那个多态永久焊死在真实适配器上：卸载之后的 `executor.mergeChanges`
 * 会去排队等一个自己正占着的槽位。类字段形态的实现（测试替身）安装前就有自有属性，此时按
 * 留存的描述符原样写回。
 *
 * **没装过就什么都不做，不接受一份「原语兜底」。** 上一段说明了装回绑定函数正是要避免的那件事，
 * 所以一旦描述符表查不到，唯一正确的动作是不动——此时目标本来就处于安装前的样子。早先的形态
 * 多收一个 `raw` 参数，在查不到时把绑定函数焊上去，等于在唯一能触发它的路径上做恰好相反的事。
 */
export function uninstallWorkingTreeCapture(target: WorkingTreeCaptureMountTarget): void {
  const saved = SAVED.get(target);
  if (!saved) return;
  SAVED.delete(target);
  for (const name of PRIMITIVE_NAMES) {
    const descriptor = saved[name];
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else delete (target as unknown as Record<string, unknown>)[name];
  }
}
