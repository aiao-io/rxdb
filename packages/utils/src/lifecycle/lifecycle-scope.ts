import type { AcquireResult, ScopeDisposer, ScopeEntry } from './lifecycle-scope.interface.js';
import { LifecycleScopeDisposedError } from './lifecycle-scope.interface.js';

/** 清单里的一条登记。`childScope` 只在这条是子作用域时存在，用于结构读出的递归。 */
interface Registration {
  label: string;
  disposer: ScopeDisposer | undefined;
  childScope: LifecycleScope | undefined;
}

/**
 * 一段代码的存活期：把「取得某种所有权」与「如何放弃它」成对登记，
 * 到期时逆序、串行地全部撤销。
 *
 * 它替代的是散在各处的手写配对——布尔守卫、`Map` 记账、`Array<Subscription>` 清单——
 * 那些写法的共同缺陷是「装」和「拆」写在两个地方，新增一处就可能漏配对。
 *
 * @remarks
 * 语义要点：
 * - 释放**逆序**执行（后登记的先撤销），且**串行**等待异步撤销结算。
 * - 一个撤销动作抛错**不短路**其余动作；全部跑完后，恰好一个错误原样重抛，
 *   多于一个以 `AggregateError` 抛出并按执行顺序保留。
 * - 释放**幂等**，且成功与失败一视同仁：重复调用返回**同一个** `Promise` 实例，
 *   首次失败时返回的就是那个同一个失败结果，不重试、不新增错误。
 * - 三态 `active` → `disposing` → `disposed` 单向推进，不可复活。
 *
 * 本类零外部依赖，不引入进程级注册表、`WeakRef` 或 `FinalizationRegistry`；
 * 它也不感知任何响应式订阅类型——订阅由调用方在 setup 里自行返回其退订动作。
 *
 * @example
 * const scope = new LifecycleScope('connection-epoch');
 * scope.acquire(() => {
 *   const timer = setInterval(poll, 1000);
 *   return () => clearInterval(timer);
 * }, 'poll-timer');
 *
 * const pluginScope = scope.child('plugin:search');
 * pluginScope.acquire(() => {
 *   const sub = source$.subscribe(handler);
 *   return () => sub.unsubscribe();
 * }, 'source-sub');
 *
 * await scope.dispose(); // pluginScope 随之释放，无需手工记账
 */
export class LifecycleScope {
  #state: 'active' | 'disposing' | 'disposed' = 'active';

  /**
   * 「自增序号 → 条目」而不是数组：`acquire()` 返回的撤销句柄需要 O(1) 摘除自身，
   * 数组的 `indexOf` + `splice` 在大量短生命周期条目下会退化成 O(n²)。
   * `Map` 同时保证迭代顺序即登记顺序。
   */
  readonly #registrations = new Map<number, Registration>();

  #nextId = 0;

  /** 首次 `dispose()` 的结果，成功与失败都缓存在这里并原样复用。 */
  #disposeTask: Promise<void> | undefined;

  /**
   * 是否正处在某条 disposer 的**同步调用帧**里。
   *
   * 只圈住同步帧而不是整个释放过程：外部的并发 `dispose()` 与 disposer 内部的重入
   * 落在完全相同的内部状态上，唯一能把两者分开的就是「调用发生在不在那一帧内」。
   * 圈大了会把外部并发调用误判成重入，幂等契约（重复调用返回同一个 Promise）随之失效。
   */
  #inDisposerFrame = false;

  /** 把自己从父作用域清单里摘掉；只由 {@link LifecycleScope.child} 装配。 */
  #detachFromParent: (() => void) | undefined;

  /** 只用于诊断与错误消息，不参与身份判定，允许重复。 */
  readonly label: string;

  /** 当前状态。单向推进 `active` → `disposing` → `disposed`，不可复活。 */
  get state(): 'active' | 'disposing' | 'disposed' {
    return this.#state;
  }

  /** @param label - 诊断标签，缺省 `'anonymous'` */
  constructor(label = 'anonymous') {
    this.label = label;
  }

  /**
   * 登记一次「取得所有权 + 如何放弃」。
   *
   * @param setup - 执行副作用并返回其撤销方式；返回 `undefined` 表示无需释放。
   *   **一次 `acquire()` 只包一步可能抛错的获取**——setup 里连做两步而第二步抛错时，
   *   第一步造出的资源不会进入清单，宿主的回滚够不着它。N 个资源就写 N 次 `acquire()`，
   *   按获取顺序分次登记即可安全回滚。
   * @param label - 诊断标签，缺省 `'anonymous'`
   * @returns 提前单独撤销这一条的句柄。调用后该条目出局，作用域释放时不会再碰它；
   *   重复调用是空操作。句柄**不在**释放帧里（见 {@link LifecycleScope.dispose} 的重入约定）：
   *   从它触发的 disposer 里调本作用域的 `dispose()` 会如实释放整个作用域，而不是被当成
   *   重入而空转。这条不构成互锁（本条目在 disposer 执行**之前**就已出清单，那一轮释放
   *   不会等它），但它与释放帧内的行为不对称，依赖其中一种写法前请先确认自己在哪条路上。
   * @throws {@link LifecycleScopeDisposedError} 作用域已不是 `active` 时同步抛出，
   *   且 `setup` **不被执行**（不产生新资源）。
   */
  acquire(setup: () => AcquireResult, label = 'anonymous'): ScopeDisposer {
    this.#assertActive(label);
    // setup 抛错时原样传播：这一条不进清单，作用域仍为 active。
    const disposer = setup();
    const id = this.#register({ label, disposer, childScope: undefined });
    return () => this.#release(id);
  }

  /**
   * 在当前作用域内开一个更短命的子作用域。
   *
   * 子作用域在父的登记序列中占**创建位置**：父释放时它整体在那个位置被释放，
   * 不是全部提前也不是全部推后。子作用域独立释放后会从父清单摘除，
   * 无论其内部撤销是否抛错。
   *
   * @param label - 诊断标签，缺省 `'anonymous'`
   * @returns 新的子作用域
   * @throws {@link LifecycleScopeDisposedError} 作用域已不是 `active` 时同步抛出，
   *   **不返回**任何作用域实例——建子作用域同样是一次登记，适用与
   *   {@link LifecycleScope.acquire} 相同的拒绝规则。静默返回一个挂在已释放父作用域下的
   *   子作用域会让调用方以为登记成功了，而它永远不会被释放。
   */
  child(label = 'anonymous'): LifecycleScope {
    this.#assertActive(label);
    const scope = new LifecycleScope(label);
    const id = this.#register({ label, disposer: () => scope.dispose(), childScope: scope });
    scope.#detachFromParent = () => void this.#registrations.delete(id);
    return scope;
  }

  /**
   * 读出本作用域清单的树形**快照**，供在释放**之前**断言结构。
   *
   * @returns 按登记顺序排列的节点；普通条目的 `children` 为 `[]`，
   *   子作用域条目递归到底。释放中与已释放的作用域返回空数组。
   *
   * @remarks
   * 它只读 `this` 已经持有的东西，不存在任何跨实例登记——本原语没有全局注册表。
   * 调用**不改变**任何状态，可重复调用，在 `disposing` / `disposed` 上也**不抛错**：
   * 它是诊断出口，不该成为新的失败源。
   *
   * 用途是把「结构缺陷」（登记时挂错父）与「顺序缺陷」（释放时排序错）分开断言——
   * 只靠释放后的调用顺序反推，两类失败会混在同一条断言里。
   */
  getEntries(): ScopeEntry[] {
    if (this.#state !== 'active') return [];
    return Array.from(this.#registrations.values(), registration => ({
      label: registration.label,
      children: registration.childScope?.getEntries() ?? []
    }));
  }

  /**
   * 释放本作用域：逆序、串行执行全部撤销动作，然后进入 `disposed`。
   *
   * @returns 全部撤销动作结算后才结算的 `Promise`。
   * @throws 恰好一个撤销动作失败时**原样重抛**该错误；多于一个时抛 `AggregateError`，
   *   其 `errors` 按**执行顺序**排列。无论是否失败，作用域都会进入 `disposed`。
   *
   * @remarks
   * 幂等且**成功与失败一视同仁**：重复调用（含并发重复调用）返回**同一个** `Promise`
   * 实例，首次失败时返回的就是那个同一个失败结果。这里的「不抛新错」只指重复调用本身
   * 不引入新错误，绝不是「把失败的首次释放替换成成功的后续释放」——那会在停机路径的
   * 防御性重复释放里静默吞掉首个真实故障。
   *
   * disposer **同步地**调用本作用域的 `dispose()`（`return () => scope.dispose()` 这类写法）
   * 是空操作：清单已经在跑，不重复执行也不自锁。但 disposer 在自己的 `await` **之后**
   * 再调本作用域的 `dispose()` 属于不支持的写法——那时已经出了同步帧，拿到的是本轮
   * in-flight 的那个 Promise，而这个 Promise 正等着这条 disposer 返回，必然互锁。
   * 要在异步收尾里释放，释放的应该是**子作用域**，不是自己。
   */
  dispose(): Promise<void> {
    // 重入：此刻 #disposeTask 可能还没赋值（`??=` 要等 #runDispose() 首次挂起才落地），
    // 所以不能靠读它来判定，只能靠调用帧。返回已结算的 Promise 而不是 in-flight 的那个，
    // 正是为了不让 disposer 等在自己身上。
    if (this.#inDisposerFrame) return Promise.resolve();
    this.#disposeTask ??= this.#startDispose();
    return this.#disposeTask;
  }

  #startDispose(): Promise<void> {
    const task = this.#runDispose();
    // 缓存的这个 Promise 在失败场景下是 rejected 的，必须始终有 handler，
    // 否则「父释放子、父把错误收进自己的集合」之后没人再 await 它，Node 会报
    // unhandledRejection，测试炸在一条与被测语义无关的警告上。
    // 注意：**不能**把 task 换成下面这个 catch 的返回值——那是一个新的、已 resolve 的
    // Promise，换上去「重复释放返回同一个失败结果」立刻失效。
    void task.catch(() => undefined);
    return task;
  }

  async #runDispose(): Promise<void> {
    this.#state = 'disposing';
    // 先于任何撤销动作摘除：独立释放的子作用域即便内部抛错，也已经不在父清单里了。
    this.#detachFromParent?.();
    this.#detachFromParent = undefined;

    // 清空再反转：释放过程中清单不再变动，迭代不受影响。
    const pending = Array.from(this.#registrations.values()).reverse();
    this.#registrations.clear();

    const errors: unknown[] = [];
    for (const registration of pending) {
      try {
        await this.#callDisposer(registration);
      } catch (error: unknown) {
        errors.push(error);
      }
    }

    this.#state = 'disposed';
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `LifecycleScope '${this.label}' dispose failed`);
  }

  /**
   * 调用一条 disposer，把重入标志精确圈在它的**同步调用帧**上。
   *
   * `finally` 在 `disposer()` 返回时就跑（返回的是 Promise 也一样，这里不 `await`），
   * 标志因此不会活过同步帧——串行等待交给调用方的 `await`。
   */
  #callDisposer(registration: Registration): void | Promise<void> {
    this.#inDisposerFrame = true;
    try {
      return registration.disposer?.();
    } finally {
      this.#inDisposerFrame = false;
    }
  }

  #assertActive(entryLabel: string): void {
    if (this.#state === 'active') return;
    throw new LifecycleScopeDisposedError(
      `LifecycleScope '${this.label}' is ${this.#state}; cannot register '${entryLabel}'`
    );
  }

  #register(registration: Registration): number {
    const id = this.#nextId++;
    this.#registrations.set(id, registration);
    return id;
  }

  /**
   * 单独撤销一条登记（{@link LifecycleScope.acquire} 返回的句柄）。
   *
   * @remarks
   * 有意**不**套 `#callDisposer`：那个标志的语义是「正处在 `dispose()` 的清单循环里」，
   * 而这里没有清单循环在跑。套上去会让 disposer 里的 `scope.dispose()` 变成静默空转——
   * 调用方明确要求释放整个作用域，却什么都不发生，比不对称更糟。
   */
  #release(id: number): void | Promise<void> {
    const registration = this.#registrations.get(id);
    if (registration === undefined) return;
    // 摘除发生在执行底层清理**之前**：清理失败不回滚回清单，dispose() 也不重试它——
    // 否则已经成功的那半会被重复执行。
    this.#registrations.delete(id);
    return registration.disposer?.();
  }
}
