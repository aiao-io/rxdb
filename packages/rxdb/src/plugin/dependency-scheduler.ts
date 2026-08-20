import type { LifecycleScope } from '@aiao/utils';

import type { IRxDBPlugin, RxDBPluginDependency } from '../rxdb-plugin.js';

/**
 * 插件的激活状态。
 *
 * @remarks
 * 只有 {@link PluginDependencyScheduler} 的 reconcile 循环能改写它。插件包**不得**再维护
 * 第二套标志位——搜索插件此前的 `SearchPluginPhase` 就是这么长出来的，两套状态一旦并存，
 * 「谁是真相」这个问题在每个并发路径上都要重新回答一遍。
 *
 * 迁移路径：`registered → waiting → installing → active | failed`，任一环节都可能因依赖
 * 失效而转入 `disposing`，释放完回到 `waiting`。
 */
export type PluginActivationState = 'registered' | 'waiting' | 'installing' | 'active' | 'failed' | 'disposing';

/**
 * 调度器对宿主的全部要求。
 *
 * @remarks
 * 调度器**不认识** `RxDB`：依赖解析、作用域创建与 `install()` 的实际执行都由宿主提供。
 * 这不是为了抽象而抽象——按实例引用识别「同名新实例」（US-015 INV-3 / AC#6）没有任何
 * 公开 API 能驱动，只有喂一个假宿主才测得了。
 */
export interface PluginSchedulerHost {
  /**
   * 把一个依赖键解析成**当前的实例引用**。
   *
   * @param dependency - 依赖键
   * @returns 就绪时返回实例引用；未就绪返回 `undefined`
   *
   * @remarks
   * 返回的引用即纪元身份。宿主**必须**在同一纪元内返回同一个引用，换了实例就要换引用——
   * 返回名字字符串或布尔位会让「同名新实例」这一类纪元变化整个消失（INV-3）。
   */
  resolveDependency(dependency: RxDBPluginDependency): object | undefined;

  /** 为一次安装派生插件激活作用域并登记。 */
  createScope(plugin: IRxDBPlugin): LifecycleScope;

  /**
   * 释放某次安装的作用域。
   *
   * @remarks
   * 实现方需按 `(plugin, scope)` 身份守卫并**吞掉**清理错误（只记日志）：调用方紧接着
   * 可能要传播安装错误，让清理错误逃出去会把失败原因换成失败后果。
   */
  releaseScope(plugin: IRxDBPlugin, scope: LifecycleScope): Promise<void>;

  /**
   * 执行 `plugin.install(scope)`。
   *
   * @remarks
   * 失败时**不要**自行释放作用域——回滚由调度器统一负责，两边都释放会让「恰好释放一次」
   * 这条断言失去意义。日志与错误传播仍归宿主。
   */
  runInstall(plugin: IRxDBPlugin, scope: LifecycleScope): Promise<void>;
}

/** 无依赖插件的纪元元组，全局共用一个常量，省掉每轮扫描的空数组分配。 */
const EMPTY_EPOCH: readonly object[] = Object.freeze([]);

/** 一个插件的调度记录。字段全部私有于本模块，对外只经 {@link PluginDependencyScheduler} 暴露状态。 */
interface PluginActivation {
  state: PluginActivationState;
  /** 本次安装绑定的依赖实例元组；未安装时为空 */
  deps: readonly object[];
  scope: LifecycleScope | undefined;
  /** `install()` 的返回值；`connect()` 靠它传播安装失败 */
  installPromise: Promise<void> | undefined;
  /** 在飞的异步转移（释放或安装）。有值时本插件跳过扫描——单飞，最新纪元胜出 */
  inFlight: Promise<void> | undefined;
  /** 转移期间来过 reconcile，或转移本身需要后续复查 */
  recheck: boolean;
  /** 已因依赖未满足告警过（INV-5：只警告一次） */
  warned: boolean;
}

/** 一次目标解析的结果。 */
interface DependencyTarget {
  satisfied: boolean;
  deps: readonly object[];
  missing: readonly RxDBPluginDependency[];
}

/** 逐元素引用比较两个纪元元组。 */
const epochEquals = (a: readonly object[], b: readonly object[]): boolean =>
  a.length === b.length && a.every((instance, index) => Object.is(instance, b[index]));

/**
 * 依赖调度器：插件激活状态的唯一持有者。
 *
 * @remarks
 * 解决的是一个具体的死锁：`RxDB.connect()` 要等插件安装完，而插件要等适配器建好表——
 * 插件自己去等就变成等自己。调度器把「等依赖」从插件侧搬到宿主侧，插件只声明
 * {@link IRxDBPlugin.inject}，什么时候装由这里决定。
 *
 * 三条不变量决定了实现形状：
 * - **纪元是身份不是布尔位**：依赖按实例引用记账，同名新实例算一次纪元变化（INV-3）
 * - **只等已经开始的安装**：依赖未满足的插件从不进入 `installing`，因此
 *   {@link PluginDependencyScheduler.startedInstalls} 不会返回它，`connect()` 不会挂起（INV-4）
 * - **不自动重试**：同一纪元内失败就是失败，重试只发生在纪元真的变了的时候（INV-6）
 *
 * 并发模型是「单飞 + 最新目标胜出」：每个插件最多有一件在飞的异步转移，期间到来的
 * reconcile 只置复查位；转移落地后直接对齐**当前**目标，中间纪元一律不启动。
 *
 * 阶段 A 只解析 `adapter:*`。`plugin:*` 依赖在宿主侧恒为未就绪，因此声明它的插件会停在
 * `waiting` 并触发一次告警，而不是静默消失；阶段 B 的 `active` 边界通知挂载点在
 * {@link PluginDependencyScheduler.#applyInstallResult}——此刻没有依赖方需要被唤醒，
 * 所以非 `active` 的状态转移不会引发任何额外扫描。
 */
export class PluginDependencyScheduler {
  readonly #host: PluginSchedulerHost;
  /** 插入序即安装序，与 US-014 的逆插入序拆卸严格对称。 */
  readonly #activations = new Map<IRxDBPlugin, PluginActivation>();
  /** 扫描中标记：转移里同步回调进来的 reconcile 只置脏位，不递归。 */
  #scanning = false;
  #dirty = false;

  constructor(host: PluginSchedulerHost) {
    this.#host = host;
  }

  /**
   * 登记一个插件。重复登记是空操作——同一个实例不会被装两次。
   *
   * @param plugin - 插件实例
   */
  register(plugin: IRxDBPlugin): void {
    if (this.#activations.has(plugin)) return;
    this.#activations.set(plugin, {
      state: 'registered',
      deps: EMPTY_EPOCH,
      scope: undefined,
      installPromise: undefined,
      inFlight: undefined,
      recheck: false,
      warned: false
    });
  }

  /**
   * 按当前依赖状态对齐一遍全部插件。**同步**执行一趟扫描。
   *
   * @remarks
   * 同步是硬要求：`connect()` 紧接着要靠 {@link PluginDependencyScheduler.startedInstalls}
   * 拿到本轮真正开工的安装，扫描要是推到微任务里，那张表在读的时候还是空的。
   * 需要 `await` 的转移（释放作用域、跑 `install()`）只在这里**发起**，不阻塞扫描。
   *
   * 一次调用只扫一趟：多个依赖同时就绪时宿主调一次即可，不会退化成每个依赖一趟。
   */
  reconcile(): void {
    if (this.#scanning) {
      this.#dirty = true;
      return;
    }
    this.#scanning = true;
    try {
      do {
        this.#dirty = false;
        for (const [plugin, activation] of this.#activations) this.#reconcileOne(plugin, activation);
      } while (this.#dirty);
    } finally {
      this.#scanning = false;
    }
  }

  /**
   * 等到没有在飞的转移为止。
   *
   * @returns 调度静止时 resolve；**不**因安装失败而 reject
   *
   * @remarks
   * 安装失败经 {@link PluginDependencyScheduler.startedInstalls} 传播，不从这里出去：
   * 断连路径（INV-7，释放必须早于 `adapter.disconnect()`）同样要 `await` 它，
   * 那条路上没有人该被一个安装错误打断。
   */
  async settle(): Promise<void> {
    // 循环而非一次 allSettled：转移落地后可能立刻发起下一次（释放 → 重装），
    // 「最新纪元胜出」意味着静止点要靠反复确认，不能只看第一批。
    for (;;) {
      const pending = Array.from(this.#activations.values(), activation => activation.inFlight).filter(
        (task): task is Promise<void> => task !== undefined
      );
      if (pending.length === 0) return;
      await Promise.allSettled(pending);
    }
  }

  /**
   * 已经**开始过**安装的插件的安装 Promise。
   *
   * @returns 安装 Promise 列表，含已失败的那些
   *
   * @remarks
   * 依赖未满足的插件从不进入这张表（INV-4 / AC#3）——这正是 `connect('local')` 遇上
   * `inject: ['adapter:remote']` 的插件时不会挂起的原因。
   *
   * 失败的插件**保留**在表里：`install()` 没有幂等契约，重跑会在半成品上再来一遍，
   * 第二次的报错还会盖掉第一次的真实原因。宁可让每次 `connect()` 都用同一个错误明确失败。
   * 解锁点有二：依赖纪元变化（此时是一次合法的重装），或
   * {@link PluginDependencyScheduler.reset}（宿主停机）。
   */
  startedInstalls(): readonly Promise<void>[] {
    return Array.from(this.#activations.values(), activation => activation.installPromise).filter(
      (task): task is Promise<void> => task !== undefined
    );
  }

  /**
   * 查询插件的激活状态。
   *
   * @param plugin - 插件实例
   * @returns 已登记时返回状态，未登记返回 `undefined`
   */
  activationState(plugin: IRxDBPlugin): PluginActivationState | undefined {
    return this.#activations.get(plugin)?.state;
  }

  /**
   * 把全部插件复位到 `registered`，丢弃安装记录与告警记录。
   *
   * @remarks
   * 供宿主停机时调用。作用域不在这里释放——那由宿主的逆序拆卸与连接纪元总闸负责，
   * 此处再释放一遍只会把拆卸顺序搅乱。
   */
  reset(): void {
    for (const activation of this.#activations.values()) {
      activation.state = 'registered';
      activation.deps = EMPTY_EPOCH;
      activation.scope = undefined;
      activation.installPromise = undefined;
      activation.inFlight = undefined;
      activation.recheck = false;
      activation.warned = false;
    }
  }

  /** 单个插件的状态转移。分支全部早返回，避免嵌套。 */
  #reconcileOne(plugin: IRxDBPlugin, activation: PluginActivation): void {
    // 在飞的转移不打断：它落地后会自己对齐当时的最新目标（AC#8，中间纪元不启动）
    if (activation.inFlight !== undefined) {
      activation.recheck = true;
      return;
    }
    const target = this.#resolveTarget(plugin);
    if (!target.satisfied) {
      this.#toWaiting(plugin, activation, target.missing);
      return;
    }
    // active 且纪元未变 = 无事可做；纪元变了要先释放旧作用域再以新实例重装（AC#5 / AC#6）
    if (activation.state === 'active') {
      if (epochEquals(activation.deps, target.deps)) return;
      this.#release(plugin, activation);
      return;
    }
    // 同一纪元内失败不自动重试（INV-6 / D5）；纪元变了才恰好重试一次（AC#9）
    if (activation.state === 'failed' && epochEquals(activation.deps, target.deps)) return;
    this.#startInstall(plugin, activation, target.deps);
  }

  /** 解析插件的全部依赖。任一未就绪即整体未就绪。 */
  #resolveTarget(plugin: IRxDBPlugin): DependencyTarget {
    const declared = plugin.inject;
    if (declared === undefined || declared.length === 0) {
      return { satisfied: true, deps: EMPTY_EPOCH, missing: [] };
    }
    const deps: object[] = [];
    const missing: RxDBPluginDependency[] = [];
    for (const dependency of declared) {
      const instance = this.#host.resolveDependency(dependency);
      if (instance === undefined) missing.push(dependency);
      else deps.push(instance);
    }
    return { satisfied: missing.length === 0, deps, missing };
  }

  /** 依赖不满足：已激活的先释放，其余就地转入等待。 */
  #toWaiting(plugin: IRxDBPlugin, activation: PluginActivation, missing: readonly RxDBPluginDependency[]): void {
    if (activation.state === 'active') {
      this.#release(plugin, activation);
      return;
    }
    // 只在「从未装过」这一步告警：装过又因断连回到等待是正常纪元行为，再喊一遍是噪音（AC#11）
    if (activation.state === 'registered' && !activation.warned) {
      activation.warned = true;
      console.warn(
        `[RxDB] Plugin '${plugin.name}' is not installed: unsatisfied dependencies [${missing.join(', ')}]`
      );
    }
    activation.state = 'waiting';
    activation.deps = EMPTY_EPOCH;
    // 清掉安装记录：依赖纪元已经变了，上一轮的失败不该继续卡住后续 connect()
    activation.installPromise = undefined;
  }

  /** 释放当前作用域并回到等待态，随后复查一次最新目标。 */
  #release(plugin: IRxDBPlugin, activation: PluginActivation): void {
    const scope = activation.scope;
    activation.state = 'disposing';
    activation.scope = undefined;
    activation.deps = EMPTY_EPOCH;
    activation.installPromise = undefined;
    this.#startTransition(activation, async () => {
      if (scope !== undefined) await this.#host.releaseScope(plugin, scope);
      activation.state = 'waiting';
      // 释放期间依赖可能已经以新实例回来了，落地后必须重新对齐（AC#8）
      activation.recheck = true;
    });
  }

  /** 建作用域、发起安装，并把结果对齐到落地时的最新目标。 */
  #startInstall(plugin: IRxDBPlugin, activation: PluginActivation, deps: readonly object[]): void {
    const scope = this.#host.createScope(plugin);
    // 状态先落地再发起安装：`install()` 的同步段可能回调 `use()` → `reconcile()`，
    // 那一趟扫描必须已经看得见本插件正在安装
    activation.state = 'installing';
    activation.scope = scope;
    activation.deps = deps;
    const install = this.#host.runInstall(plugin, scope);
    // 预挂一次空 catch：安装 Promise 可能无人 await（依赖未满足的适配器先断开时），
    // 不挂会变成 unhandled rejection
    void install.then(
      () => undefined,
      () => undefined
    );
    activation.installPromise = install;
    this.#startTransition(activation, async () => {
      const failure = await install.then(
        () => undefined,
        (error: unknown) => ({ error })
      );
      await this.#applyInstallResult(plugin, activation, scope, failure);
    });
  }

  /**
   * 安装落地。
   *
   * @remarks
   * 先验纪元再看成败：`install()` 挂起期间依赖可能已经断开，那一轮的**成功**结果同样必须
   * 丢弃（AC#7）——它登记的东西绑在一条已经没用的连接上。此时插件不进入 `active`，
   * 已登记的作用域恰好释放一次。
   *
   * 阶段 B 的 `active` 边界通知挂在这里：只有跨越 `active` 的那一步需要唤醒依赖方，
   * `waiting → installing` 之类的中间转移不触发任何扫描。
   */
  async #applyInstallResult(
    plugin: IRxDBPlugin,
    activation: PluginActivation,
    scope: LifecycleScope,
    failure: { readonly error: unknown } | undefined
  ): Promise<void> {
    // 记录里已经不是手里这一个作用域 = 本次安装所属的纪元整个作废了（宿主 reset 过，
    // 而且可能已经开始了更晚的一次安装）。此时连结果都不该落地：写回去会把新纪元的
    // `active` 改成旧纪元的 `failed`。旧作用域由宿主的纪元总闸释放，不归这里。
    if (activation.scope !== scope) return;
    const target = this.#resolveTarget(plugin);
    if (!target.satisfied || !epochEquals(activation.deps, target.deps)) {
      activation.state = 'disposing';
      activation.scope = undefined;
      activation.deps = EMPTY_EPOCH;
      activation.installPromise = undefined;
      await this.#host.releaseScope(plugin, scope);
      activation.state = 'waiting';
      activation.recheck = true;
      return;
    }
    if (failure === undefined) {
      activation.state = 'active';
      return;
    }
    // 失败绑定当时的依赖纪元（activation.deps 就是它），同纪元内不再重试
    activation.state = 'failed';
    activation.scope = undefined;
    await this.#host.releaseScope(plugin, scope);
  }

  /**
   * 发起一件在飞的转移。
   *
   * @remarks
   * 转移期间本插件不参与扫描；落地后只在**确有必要**时复查——释放之后要看依赖有没有回来，
   * 而一次干净的安装成功已经在落地时对齐过目标，再扫一趟纯属浪费。
   *
   * 只有**仍然登记在册**的那一件转移有权改写记录：{@link PluginDependencyScheduler.reset}
   * 之后可能已经开始了更晚的一件，让作废的那件把 `inFlight` 清掉，
   * {@link PluginDependencyScheduler.settle} 会在新安装还跑着的时候提前放行。
   */
  #startTransition(activation: PluginActivation, work: () => Promise<void>): void {
    const task: Promise<void> = work()
      .catch((error: unknown) => {
        console.error('[RxDB] Plugin scheduler transition failed:', error);
      })
      .then(() => {
        if (activation.inFlight !== task) return;
        activation.inFlight = undefined;
        if (!activation.recheck) return;
        activation.recheck = false;
        this.reconcile();
      });
    activation.inFlight = task;
  }
}
