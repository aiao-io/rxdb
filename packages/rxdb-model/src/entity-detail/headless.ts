/** 无详情页外壳依赖的实体详情状态。 */
import {
  EntityFormController,
  type EntityFormControllerOptions,
  type EntityFormSnapshot,
  type EntityFormSubmitResult
} from '../entity-form/headless.js';
import type { DetailTab } from './interfaces.js';

/** 详情页模式、Tab、表单草稿和保存生命周期快照。 */
export interface EntityDetailSnapshot {
  readonly mode: 'view' | 'edit' | 'create';
  readonly activeTab: string;
  readonly tabs: readonly DetailTab[];
  /** 同一详情草稿的表单快照。 */
  readonly form: EntityFormSnapshot;
  readonly saving: boolean;
  readonly error: unknown;
  readonly open: boolean;
}

/** 详情表单输入及初始 Tab 与打开状态。 */
export interface EntityDetailControllerOptions extends EntityFormControllerOptions {
  readonly tabs?: readonly DetailTab[];
  readonly activeTab?: string;
  readonly open?: boolean;
}

type DetailListener = (snapshot: EntityDetailSnapshot, event: { readonly type: string }) => void;

/** 详情页的 Tab、草稿、保存与取消状态。 */
export class EntityDetailController {
  readonly #tabs: DetailTab[];
  readonly #listeners = new Set<DetailListener>();
  #activeTab: string;
  #saving = false;
  #error: unknown = null;
  #open: boolean;
  #snapshot: EntityDetailSnapshot;
  #unsubscribeForm: () => void;
  #session = 0;
  #savePromise: Promise<EntityFormSubmitResult> | undefined;
  #disposed = false;
  /** 同一详情实例使用的共享表单控制器。 */
  readonly form: EntityFormController;

  /** 读取详情页当前状态。 */
  get snapshot(): EntityDetailSnapshot {
    return this.#snapshot;
  }

  constructor(options: EntityDetailControllerOptions) {
    this.form = new EntityFormController(options);
    this.#tabs = [...(options.tabs ?? [])];
    this.#activeTab = options.activeTab ?? this.#tabs[0]?.key ?? 'basic';
    this.#open = options.open ?? true;
    this.#snapshot = this.#buildSnapshot();
    this.#unsubscribeForm = this.form.subscribe(() => {
      this.#session++;
      this.#publish('formChanged');
    });
  }
  /** 订阅详情状态事件，返回取消订阅函数。 */
  subscribe(listener: DetailListener): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  /** 激活已声明的 Tab，未知 key 会抛错。 */
  selectTab(key: string): void {
    this.#assertActive();
    if (!this.#tabs.some(tab => tab.key === key)) throw new Error(`Unknown detail tab: ${key}`);
    this.#activeTab = key;
    this.#publish('tabChanged');
  }
  /** 沿用表单的严格解析和只读约束修改字段。 */
  setField(field: string, value: unknown): ReturnType<EntityFormController['setField']> {
    this.#assertActive();
    return this.form.setField(field, value);
  }
  /** 校验当前草稿并同步字段错误。 */
  validate(): ReturnType<EntityFormController['validate']> {
    this.#assertActive();
    return this.form.validate();
  }
  /** 恢复最近宿主输入，并使正在保存的旧会话失效。 */
  cancel(): void {
    this.#assertActive();
    this.#session++;
    this.form.cancel();
    this.#publish('cancelled');
  }
  /** 持久化当前草稿；重入、过期会话和销毁后的迟到结果均不会回写界面。 */
  async save(
    onSave?: (result: Extract<EntityFormSubmitResult, { valid: true }>) => void | Promise<void>
  ): Promise<EntityFormSubmitResult> {
    this.#assertActive();
    if (this.#savePromise) throw new Error('EntityDetailController save already in progress');
    const result = this.form.submit();
    if (!result.valid) return result;
    const session = this.#session;
    this.#saving = true;
    this.#error = null;
    this.#publish('saving');
    const operation = (async (): Promise<EntityFormSubmitResult> => {
      try {
        // 让 savePromise 先登记，onSave 内部再次调用 save() 也会被拒绝。
        await Promise.resolve();
        await onSave?.(result);
        if (this.#disposed) return result;
        if (session !== this.#session) {
          this.#saving = false;
          this.#publish('saveSuperseded');
          return result;
        }
        this.#saving = false;
        this.#open = false;
        this.form.setData(result.data);
        this.#publish('saved');
        return result;
      } catch (error) {
        if (this.#disposed) throw error;
        this.#saving = false;
        this.#error = error;
        this.#publish('saveFailed');
        throw error;
      }
    })();
    this.#savePromise = operation;
    try {
      return await operation;
    } finally {
      if (this.#savePromise === operation) this.#savePromise = undefined;
    }
  }
  /** 关闭当前详情会话，使迟到保存不能关闭后续会话。 */
  close(): void {
    this.#assertActive();
    this.#session++;
    this.#open = false;
    this.#publish('closed');
  }
  /** 打开一个新的详情会话。 */
  open(): void {
    this.#assertActive();
    this.#session++;
    this.#open = true;
    this.#publish('opened');
  }
  /** 释放表单订阅和资源，阻止迟到任务更新。 */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#session++;
    this.#unsubscribeForm();
    this.#listeners.clear();
    this.form.dispose();
  }
  #buildSnapshot(): EntityDetailSnapshot {
    return {
      mode: this.form.snapshot.mode,
      activeTab: this.#activeTab,
      tabs: this.#tabs,
      form: this.form.snapshot,
      saving: this.#saving,
      error: this.#error,
      open: this.#open
    };
  }
  #publish(type: string): void {
    if (this.#disposed) return;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener(this.#snapshot, { type });
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('EntityDetailController has been disposed');
  }
}

/** 创建共享表单草稿和详情生命周期控制器。 */
export function createEntityDetailController(options: EntityDetailControllerOptions): EntityDetailController {
  return new EntityDetailController(options);
}
/** 详情控制器工厂的 headless 别名。 */
export const createEntityDetailHeadless = createEntityDetailController;
