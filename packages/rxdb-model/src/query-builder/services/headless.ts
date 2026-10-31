/** 无展示依赖的查询构建器状态绑定。 */
import type { RuleGroup } from '@aiao/rxdb';
import { cloneStructured, structuralEqual } from '../../structural-equal.js';
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

/** 查询状态、字段元数据或校验结果的变更事件。 */
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
  readonly #service: QueryBuilderService<T>;
  readonly #readonly: boolean;
  readonly #listeners = new Set<QueryListener<T>>();
  readonly #subscriptions: Array<{ unsubscribe(): void }> = [];
  #snapshot: QueryBuilderSnapshot<T>;
  #disposed = false;

  /** 读取与内部状态隔离的查询快照。 */
  get snapshot(): QueryBuilderSnapshot<T> {
    return cloneStructured(this.#snapshot);
  }

  constructor(options: QueryBuilderControllerOptions<T> = {}) {
    this.#service = createQueryBuilderService({
      ...options,
      ...(options.fields ? { fields: cloneStructured(options.fields) } : {}),
      ...(options.initialState ? { initialState: cloneStructured(options.initialState) } : {}),
      ...(options.initialQuery ? { initialQuery: cloneStructured(options.initialQuery) } : {})
    });
    this.#readonly = options.readonly === true || options.config?.readonly === true;
    this.#snapshot = this.#buildSnapshot();
    this.#subscriptions.push(
      this.#service.state$.subscribe(state => this.#publish({ type: 'stateChanged', state })),
      this.#service.validation$.subscribe(validation => this.#publish({ type: 'validationChanged', validation }))
    );
  }

  /** 订阅查询状态事件，返回取消订阅函数。 */
  subscribe(listener: QueryListener<T>): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** 替换字段元数据并重新校验现有规则。 */
  setFields(fields: FieldMetadata[]): void {
    this.#assertActive();
    const nextFields = cloneStructured(fields);
    if (structuralEqual(this.#service.getFields(), nextFields)) return;
    this.#service.setFields(nextFields);
    this.#publish({ type: 'fieldsChanged', fields: nextFields });
  }

  /** 在目标组中新增规则，返回规则 ID。 */
  addRule(parentGroupId?: string | null, rule?: Partial<Omit<QueryBuilderRule<T>, 'id'>>): string {
    this.#assertWritable();
    return this.#service.addRule(parentGroupId, cloneStructured(rule));
  }

  /** 新增 AND 或 OR 规则组，沿用现有嵌套限制。 */
  addGroup(parentGroupId?: string | null, combinator: 'and' | 'or' = 'and'): string {
    this.#assertWritable();
    return this.#service.addGroup(parentGroupId, combinator);
  }

  /** 修改指定规则的字段、操作符或值。 */
  updateRule(ruleId: string, updates: Partial<Omit<QueryBuilderRule<T>, 'id'>>): void {
    this.#assertWritable();
    this.#service.updateRule(ruleId, cloneStructured(updates));
  }

  /** 更新规则组的 AND 或 OR 组合方式。 */
  updateGroupCombinator(groupId: string, combinator: 'and' | 'or'): void {
    this.#assertWritable();
    this.#service.updateGroupCombinator(groupId, combinator);
  }

  /** 删除规则或非根规则组。 */
  remove(itemId: string): void {
    this.#assertWritable();
    this.#service.remove(itemId);
  }
  /** 将规则或分组移动到目标组的指定位置。 */
  moveItem(itemId: string, targetGroupId: string, targetIndex: number): void {
    this.#assertWritable();
    this.#service.moveItem(itemId, targetGroupId, targetIndex);
  }
  /** 清空规则并建立新的空根组。 */
  clear(): void {
    this.#assertWritable();
    this.#service.clear();
  }
  /** 载入 RxDB 查询并由现有转换器分配规则 ID。 */
  fromRxDBQuery(query: RuleGroup<T> | QueryBuilderRuleGroup<T>): void {
    this.#assertWritable();
    this.#service.fromRxDBQuery(cloneStructured(query));
  }
  /** 将当前状态转换为 RxDB 查询并返回隔离副本。 */
  toRxDBQuery(): RuleGroup<T> {
    return cloneStructured(this.#service.toRxDBQuery());
  }
  /** 校验当前规则树并返回字段定位错误。 */
  validate(): ValidationResult {
    return cloneStructured(this.#service.validate());
  }

  /** 解除查询服务订阅并销毁内部服务。 */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const subscription of this.#subscriptions) subscription.unsubscribe();
    this.#listeners.clear();
    this.#service.destroy();
  }

  #buildSnapshot(): QueryBuilderSnapshot<T> {
    const validation = this.#service.validate();
    return {
      state: cloneStructured(this.#service.getState()),
      fields: cloneStructured(this.#service.getFields()),
      query: cloneStructured(this.#service.toRxDBQuery()),
      validation: cloneStructured(validation),
      valid: validation.valid,
      readonly: this.#readonly
    };
  }

  #publish(event: QueryBuilderEvent<T>): void {
    if (this.#disposed) return;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener(this.snapshot, cloneStructured(event));
  }

  #assertWritable(): void {
    this.#assertActive();
    if (this.#readonly) throw new Error('QueryBuilderController is readonly');
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('QueryBuilderController has been disposed');
  }
}

/** 创建复用现有查询服务的 headless 控制器。 */
export function createQueryBuilderController<T = Record<string, unknown>>(
  options: QueryBuilderControllerOptions<T> = {}
): QueryBuilderController<T> {
  return new QueryBuilderController(options);
}

/** 查询构建器控制器工厂的 headless 别名。 */
export const createQueryBuilderHeadless = createQueryBuilderController;
