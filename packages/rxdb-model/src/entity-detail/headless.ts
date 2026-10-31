/** 无详情页外壳依赖的实体详情状态。 */
import {
  EntityFormController,
  type EntityFormControllerOptions,
  type EntityFormSnapshot,
  type EntityFormSubmitResult
} from '../entity-form/headless.js';
import type { DetailTab } from './interfaces.js';

export interface EntityDetailSnapshot {
  readonly mode: 'view' | 'edit' | 'create';
  readonly activeTab: string;
  readonly tabs: readonly DetailTab[];
  readonly form: EntityFormSnapshot;
  readonly saving: boolean;
  readonly error: unknown;
  readonly open: boolean;
}

export interface EntityDetailControllerOptions extends EntityFormControllerOptions {
  readonly tabs?: readonly DetailTab[];
  readonly activeTab?: string;
  readonly open?: boolean;
}

type DetailListener = (snapshot: EntityDetailSnapshot, event: { readonly type: string }) => void;

/** 详情页的 Tab、草稿、保存与取消状态。 */
export class EntityDetailController {
  readonly form: EntityFormController;
  readonly #tabs: DetailTab[];
  readonly #listeners = new Set<DetailListener>();
  #activeTab: string;
  #saving = false;
  #error: unknown = null;
  #open: boolean;
  #snapshot: EntityDetailSnapshot;
  #unsubscribeForm: () => void;
  #disposed = false;

  constructor(options: EntityDetailControllerOptions) {
    this.form = new EntityFormController(options);
    this.#tabs = [...(options.tabs ?? [])];
    this.#activeTab = options.activeTab ?? this.#tabs[0]?.key ?? 'basic';
    this.#open = options.open ?? true;
    this.#snapshot = this.#buildSnapshot();
    this.#unsubscribeForm = this.form.subscribe(() => this.#publish('formChanged'));
  }
  get snapshot(): EntityDetailSnapshot {
    return this.#snapshot;
  }
  subscribe(listener: DetailListener): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  selectTab(key: string): void {
    if (!this.#tabs.some(tab => tab.key === key)) throw new Error(`Unknown detail tab: ${key}`);
    this.#activeTab = key;
    this.#publish('tabChanged');
  }
  setField(field: string, value: unknown): ReturnType<EntityFormController['setField']> {
    return this.form.setField(field, value);
  }
  validate(): ReturnType<EntityFormController['validate']> {
    return this.form.validate();
  }
  cancel(): void {
    this.form.cancel();
    this.#publish('cancelled');
  }
  async save(
    onSave?: (result: Extract<EntityFormSubmitResult, { valid: true }>) => void | Promise<void>
  ): Promise<EntityFormSubmitResult> {
    const result = this.form.submit();
    if (!result.valid) return result;
    this.#saving = true;
    this.#error = null;
    this.#publish('saving');
    try {
      await onSave?.(result);
      this.#saving = false;
      this.#open = false;
      this.form.setData(result.data);
      this.#publish('saved');
      return result;
    } catch (error) {
      this.#saving = false;
      this.#error = error;
      this.#publish('saveFailed');
      throw error;
    }
  }
  close(): void {
    this.#open = false;
    this.#publish('closed');
  }
  open(): void {
    this.#open = true;
    this.#publish('opened');
  }
  dispose(): void {
    this.#disposed = true;
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
}

export function createEntityDetailController(options: EntityDetailControllerOptions): EntityDetailController {
  return new EntityDetailController(options);
}
export const createEntityDetailHeadless = createEntityDetailController;
