/**
 * 撤销一次登记的句柄。
 *
 * 可以返回 `Promise`，{@link LifecycleScope.dispose} 会**串行**等待它结算之后才执行下一个；
 * 重复调用是空操作——第一次调用之后该条目已从作用域清单摘除。
 */
export type ScopeDisposer = () => void | Promise<void>;

/**
 * {@link LifecycleScope.acquire} 的 **setup 返回值**：交出撤销方式，
 * 或返回 `undefined` 表示这次副作用无需释放。
 *
 * @remarks
 * 名字里的 Result 指的是「setup 执行的结果」，**不是**「`acquire()` 调用的结果」——
 * `acquire()` 返回的是 {@link ScopeDisposer} 本身。本类型公开导出的唯一用途，
 * 是让调用方给自己的 setup 函数标注返回类型。
 *
 * 联合里**没有** `Promise<…>`：这样「资源获取跨 `await`」的写法会在编译期被挡下，
 * 而不是在运行时静默泄漏。
 *
 * @example
 * const setup = (): AcquireResult => {
 *   const timer = setInterval(tick, 1000);
 *   return () => clearInterval(timer);
 * };
 */
export type AcquireResult = ScopeDisposer | undefined;

/**
 * {@link LifecycleScope.getEntries} 返回的快照节点。
 *
 * 它是**快照**而非活引用：拿到之后再登记或释放都不会反映到已返回的数组里，
 * 改动返回值也不会影响作用域本身。
 */
export interface ScopeEntry {
  /** 登记时传入的标签；未传时为 `'anonymous'`。只用于诊断，不参与身份判定。 */
  label: string;
  /**
   * 子作用域条目的下级快照，递归到底。
   *
   * 普通条目为 `[]` 而不是 `undefined`——免去调用方每一层判空。
   */
  children: ScopeEntry[];
}

/**
 * 在已释放（`disposed`）或正在释放（`disposing`）的作用域上登记时抛出。
 *
 * @remarks
 * 它是可判别的 `Error` 子类，`name` 固定为 `'LifecycleScopeDisposedError'`。
 * 消息里同时含作用域标签与本次登记的标签，便于定位是谁在什么之后还在登记。
 *
 * 拿到它意味着调用方持有的作用域已经过期——正确的修法是重新取得当前纪元的作用域，
 * 而不是捕获后继续。
 */
export class LifecycleScopeDisposedError extends Error {
  /** @param message - 含作用域标签与条目标签的诊断信息 */
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleScopeDisposedError';
  }
}
