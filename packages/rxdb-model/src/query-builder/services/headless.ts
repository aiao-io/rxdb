/** 无展示依赖的查询构建器状态绑定。 */
import type { RuleGroup } from '@aiao/rxdb';
import type {
  FieldMetadata,
  QueryBuilderRule,
  QueryBuilderRuleGroup,
  QueryBuilderState
} from '../models/query-builder-state.js';
import type { ValidationResult } from '../models/validation.interface.js';
import {
  createQueryBuilderService,
  type QueryBuilderService,
  type QueryBuilderServiceOptions
} from './query-builder.service.js';

/** 查询构建器快照。 */
export interface QueryBuilderSnapshot<T = Record<string, unknown>> {
  readonly state: QueryBuilderState<T>;
  readonly fields: readonly FieldMetadata[];
  readonly query: RuleGroup<T>;
  readonly validation: ValidationResult;
  readonly valid: boolean;
  readonly readonly: boolean;
}

export type QueryBuilderEvent<T = Record<string, unknown>> =
  | { readonly type: 'stateChanged'; readonly state: QueryBuilderState<T> }
  | { readonly type: 'fieldsChanged'; readonly fields: readonly FieldMetadata[] }
  | { readonly type: 'validationChanged'; readonly validation: ValidationResult };

/** 创建查询状态机的选项。 */
export interface QueryBuilderControllerOptions<T = Record<string, unknown>> extends QueryBuilderServiceOptions<T> {
  readonly readonly?: boolean;
}

type QueryListener<T> = (snapshot: QueryBuilderSnapshot<T>, event: QueryBuilderEvent<T>) => void;

/**
 * 对现有 QueryBuilderService 的无 UI 外观包装。
 * @remarks 所有规则转换和校验仍由 QueryBuilderService 完成，避免出现第二套查询语义。
 */
export class QueryBuilderController<T = Record<string, unknown>> {
  readonly service: QueryBuilderService<T>;
  readonly #readonly: boolean;
  readonly #listeners = new Set<QueryListener<T>>();
  readonly #subscriptions: Array<{ unsubscribe(): void }> = [];
  #snapshot: QueryBuilderSnapshot<T>;
  #disposed = false;

  constructor(options: QueryBuilderControllerOptions<T> = {}) {
    this.service = createQueryBuilderService(options);
    this.#readonly = options.readonly === true || options.config?.readonly === true;
    this.#snapshot = this.#buildSnapshot();
    this.#subscriptions.push(
      this.service.state$.subscribe(state => this.#publish({ type: 'stateChanged', state })),
      this.service.validation$.subscribe(validation => this.#publish({ type: 'validationChanged', validation }))
    );
  }

  get snapshot(): QueryBuilderSnapshot<T> {
    return this.#snapshot;
  }

  subscribe(listener: QueryListener<T>): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setFields(fields: FieldMetadata[]): void {
    this.#assertActive();
    this.service.setFields(fields);
    this.#publish({ type: 'fieldsChanged', fields });
  }

  addRule(parentGroupId?: string | null, rule?: Partial<Omit<QueryBuilderRule<T>, 'id'>>): string {
    this.#assertWritable();
    return this.service.addRule(parentGroupId, rule);
  }

  addGroup(parentGroupId?: string | null, combinator: 'and' | 'or' = 'and'): string {
    this.#assertWritable();
    return this.service.addGroup(parentGroupId, combinator);
  }

  updateRule(ruleId: string, updates: Partial<Omit<QueryBuilderRule<T>, 'id'>>): void {
    this.#assertWritable();
    this.service.updateRule(ruleId, updates);
  }

  updateGroupCombinator(groupId: string, combinator: 'and' | 'or'): void {
    this.#assertWritable();
    this.service.updateGroupCombinator(groupId, combinator);
  }

  remove(itemId: string): void {
    this.#assertWritable();
    this.service.remove(itemId);
  }
  moveItem(itemId: string, targetGroupId: string, targetIndex: number): void {
    this.#assertWritable();
    this.service.moveItem(itemId, targetGroupId, targetIndex);
  }
  clear(): void {
    this.#assertWritable();
    this.service.clear();
  }
  fromRxDBQuery(query: RuleGroup<T> | QueryBuilderRuleGroup<T>): void {
    this.#assertWritable();
    this.service.fromRxDBQuery(query);
  }
  toRxDBQuery(): RuleGroup<T> {
    return this.service.toRxDBQuery();
  }
  validate(): ValidationResult {
    return this.service.validate();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const subscription of this.#subscriptions) subscription.unsubscribe();
    this.#listeners.clear();
    this.service.destroy();
  }

  #buildSnapshot(): QueryBuilderSnapshot<T> {
    const validation = this.service.validate();
    return {
      state: this.service.getState(),
      fields: this.service.getFields(),
      query: this.service.toRxDBQuery(),
      validation,
      valid: validation.valid,
      readonly: this.#readonly
    };
  }

  #publish(event: QueryBuilderEvent<T>): void {
    if (this.#disposed) return;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener(this.#snapshot, event);
  }

  #assertWritable(): void {
    this.#assertActive();
    if (this.#readonly) throw new Error('QueryBuilderController is readonly');
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('QueryBuilderController has been disposed');
  }
}

export function createQueryBuilderController<T = Record<string, unknown>>(
  options: QueryBuilderControllerOptions<T> = {}
): QueryBuilderController<T> {
  return new QueryBuilderController(options);
}

export const createQueryBuilderHeadless = createQueryBuilderController;
