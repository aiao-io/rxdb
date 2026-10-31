/** 无弹窗实现依赖的对话框生命周期状态。 */
export interface EntityDialogSnapshot<TResult = unknown, TData = unknown> {
  readonly open: boolean;
  readonly result: TResult | undefined;
  readonly data: TData | undefined;
}
export interface EntityDialogControllerOptions<TData = unknown> {
  readonly data?: TData;
  readonly open?: boolean;
}
type DialogListener<TResult, TData> = (
  snapshot: EntityDialogSnapshot<TResult, TData>,
  event: { readonly type: 'opened' | 'closed' | 'result' }
) => void;

export class EntityDialogController<TResult = unknown, TData = unknown> {
  readonly #listeners = new Set<DialogListener<TResult, TData>>();
  #open: boolean;
  #data: TData | undefined;
  #result: TResult | undefined;
  #snapshot: EntityDialogSnapshot<TResult, TData>;
  #disposed = false;
  constructor(options: EntityDialogControllerOptions<TData> = {}) {
    this.#open = options.open ?? false;
    this.#data = options.data;
    this.#snapshot = this.#buildSnapshot();
  }
  get snapshot(): EntityDialogSnapshot<TResult, TData> {
    return this.#snapshot;
  }
  subscribe(listener: DialogListener<TResult, TData>): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  open(data?: TData): void {
    this.#data = data === undefined ? this.#data : data;
    this.#result = undefined;
    this.#open = true;
    this.#publish('opened');
  }
  close(result?: TResult): void {
    this.#result = result;
    this.#open = false;
    this.#publish('closed');
  }
  resolve(result: TResult): void {
    this.#result = result;
    this.#open = false;
    this.#publish('result');
  }
  setData(data: TData): void {
    this.#data = data;
    this.#publish('opened');
  }
  dispose(): void {
    this.#disposed = true;
    this.#listeners.clear();
  }
  #buildSnapshot(): EntityDialogSnapshot<TResult, TData> {
    return { open: this.#open, result: this.#result, data: this.#data };
  }
  #publish(type: 'opened' | 'closed' | 'result'): void {
    if (this.#disposed) return;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener(this.#snapshot, { type });
  }
}
export function createEntityDialogController<TResult = unknown, TData = unknown>(
  options: EntityDialogControllerOptions<TData> = {}
): EntityDialogController<TResult, TData> {
  return new EntityDialogController(options);
}
export const createEntityDialogHeadless = createEntityDialogController;
