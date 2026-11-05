import { cloneStructured, structuralEqual } from '../structural-equal.js';

/** 无弹窗实现依赖的对话框生命周期状态。 */
export interface EntityDialogSnapshot<TResult = unknown, TData = unknown> {
  readonly open: boolean;
  readonly result: TResult | undefined;
  readonly data: TData | undefined;
}
/** 对话框初始数据及打开状态。 */
export interface EntityDialogControllerOptions<TData = unknown> {
  readonly data?: TData;
  readonly open?: boolean;
}
type DialogListener<TResult, TData> = (
  snapshot: EntityDialogSnapshot<TResult, TData>,
  event: { readonly type: 'opened' | 'closed' | 'result' | 'dataChanged' }
) => void;

/** 连接消费方弹窗外壳的打开、关闭与结果状态。 */
export class EntityDialogController<TResult = unknown, TData = unknown> {
  readonly #listeners = new Set<DialogListener<TResult, TData>>();
  #open: boolean;
  #data: TData | undefined;
  /** 最近一次数据的副本：宿主原地修改后再传同一引用，比较仍能看出变化。 */
  #dataCopy: TData | undefined;
  #result: TResult | undefined;
  #snapshot: EntityDialogSnapshot<TResult, TData>;
  #disposed = false;
  /** 读取当前弹窗生命周期状态。 */
  get snapshot(): EntityDialogSnapshot<TResult, TData> {
    return this.#snapshot;
  }

  constructor(options: EntityDialogControllerOptions<TData> = {}) {
    this.#open = options.open ?? false;
    this.#storeData(options.data);
    this.#snapshot = this.#buildSnapshot();
  }
  /** 订阅打开、关闭、数据和结果事件。 */
  subscribe(listener: DialogListener<TResult, TData>): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  /** 打开弹窗并清除上一次结果。 */
  open(data?: TData): void {
    this.#assertActive();
    if (data !== undefined) this.#storeData(data);
    this.#result = undefined;
    this.#open = true;
    this.#publish('opened');
  }
  /** 关闭弹窗，可附带关闭结果。 */
  close(result?: TResult): void {
    this.#assertActive();
    this.#result = result;
    this.#open = false;
    this.#publish('closed');
  }
  /** 提交结果并关闭弹窗。 */
  resolve(result: TResult): void {
    this.#assertActive();
    this.#result = result;
    this.#open = false;
    this.#publish('result');
  }
  /**
   * 替换消费方弹窗使用的数据；与最近一次数据结构相同时不做任何事。
   * @remarks 按 `structuralEqual` 比较（函数按引用），绑定每次渲染重建同样内容的对象不会反复发布、引发重渲染循环。
   */
  setData(data: TData | undefined): void {
    this.#assertActive();
    if (structuralEqual(data, this.#dataCopy)) return;
    this.#storeData(data);
    this.#publish('dataChanged');
  }
  /** 清理全部监听并拒绝后续生命周期动作。 */
  dispose(): void {
    this.#disposed = true;
    this.#listeners.clear();
  }
  /** 快照沿用宿主传入的引用（实体实例保留方法），比较用另存的副本。 */
  #storeData(data: TData | undefined): void {
    this.#data = data;
    this.#dataCopy = cloneStructured(data);
  }
  #buildSnapshot(): EntityDialogSnapshot<TResult, TData> {
    return { open: this.#open, result: this.#result, data: this.#data };
  }
  #publish(type: 'opened' | 'closed' | 'result' | 'dataChanged'): void {
    if (this.#disposed) return;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener(this.#snapshot, { type });
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('EntityDialogController has been disposed');
  }
}
/** 创建独立于具体弹窗实现的生命周期控制器。 */
export function createEntityDialogController<TResult = unknown, TData = unknown>(
  options: EntityDialogControllerOptions<TData> = {}
): EntityDialogController<TResult, TData> {
  return new EntityDialogController(options);
}
/** 对话框控制器工厂的 headless 别名。 */
export const createEntityDialogHeadless = createEntityDialogController;
