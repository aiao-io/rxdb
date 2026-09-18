/**
 * @fileoverview QueryBuilder 核心服务
 * 提供 RxJS 响应式状态管理，支持规则增删改和双向转换
 */

import type { OperatorName, RuleGroup } from '@aiao/rxdb';
import { BehaviorSubject, Observable, distinctUntilChanged, map } from 'rxjs';
import type { QueryBuilderConfig } from '../models/config.interface.js';
import type {
  FieldMetadata,
  QueryBuilderRule,
  QueryBuilderRuleGroup,
  QueryBuilderState,
  UIRule
} from '../models/query-builder-state.js';
import { isRule, isRuleGroup } from '../models/query-builder-state.js';
import type { ValidationResult } from '../models/validation.interface.js';
import { generateId } from '../utils/id.js';
import { structuralEqual } from '../utils/structural-equal.js';
import { OperatorRegistry, createOperatorRegistry } from './operator-registry.service.js';
import { QueryConverter, createQueryConverter } from './query-converter.service.js';
import { ValidationService, createValidationService, type ValidationGroupInput } from './validation.service.js';

/**
 * QueryBuilderService 选项
 */
export interface QueryBuilderServiceOptions<T = Record<string, unknown>> {
  /**
   * 初始查询状态
   */
  initialState?: QueryBuilderState<T>;

  /**
   * 初始 RxDB Query
   */
  initialQuery?: RuleGroup<T>;

  /**
   * 字段元数据
   */
  fields?: FieldMetadata[];

  /**
   * 配置选项
   */
  config?: QueryBuilderConfig<T>;

  /**
   * 自定义操作符注册表
   */
  operatorRegistry?: OperatorRegistry;

  /**
   * 自定义校验服务
   */
  validationService?: ValidationService;

  /**
   * 自定义转换器
   */
  queryConverter?: QueryConverter<T>;
}

/**
 * 默认配置
 */
const DEFAULT_MAX_NESTING_LEVEL = 5;
const DEFAULT_COMBINATOR: 'and' | 'or' = 'and';

/**
 * 创建空的根规则组（根节点）。
 *
 * 该方法用于初始化或重置查询构建器的根状态：
 * - 生成一个带有唯一 `id` 的根规则组
 * - 使用默认组合器 {@link DEFAULT_COMBINATOR}（通常为 `and`）
 * - 不包含任何子规则（`rules` 为空数组）
 *
 * @typeParam T 文档/记录的数据类型，用于约束字段和规则的值类型。
 * @returns 一个可作为查询构建器根节点使用的空规则组。
 */
function createEmptyRootGroup<T>(): QueryBuilderRuleGroup<T> {
  return {
    id: generateId(),
    combinator: DEFAULT_COMBINATOR,
    rules: []
  };
}

/**
 * QueryBuilder 核心服务
 * 基于 RxJS 的响应式状态管理
 */
export class QueryBuilderService<T = Record<string, unknown>> {
  private readonly stateSubject: BehaviorSubject<QueryBuilderState<T>>;
  private readonly fieldsMap: Map<string, FieldMetadata>;
  private readonly config: QueryBuilderConfig<T>;
  private readonly operatorRegistry: OperatorRegistry;
  private readonly validationService: ValidationService;
  private readonly queryConverter: QueryConverter<T>;
  private currentMaxNestingLevel: number;

  /**
   * 状态变更的 Observable 流
   */
  readonly state$: Observable<QueryBuilderState<T>>;

  /**
   * 根规则组的 Observable
   */
  readonly rootGroup$: Observable<QueryBuilderRuleGroup<T>>;

  /**
   * 校验结果的 Observable
   */
  readonly validation$: Observable<ValidationResult>;

  /**
   * RxDB Query 格式的 Observable
   */
  readonly query$: Observable<RuleGroup<T>>;

  /** @param options - 查询构建器配置（schema / initialQuery / 嵌套上限等） */
  constructor(options: QueryBuilderServiceOptions<T> = {}) {
    // 初始化依赖
    this.operatorRegistry = options.operatorRegistry ?? createOperatorRegistry();
    this.validationService =
      options.validationService ??
      createValidationService({
        operatorRegistry: this.operatorRegistry
      });
    this.queryConverter = options.queryConverter ?? createQueryConverter<T>();

    // 初始化字段映射
    this.fieldsMap = new Map();
    if (options.fields) {
      for (const field of options.fields) {
        this.fieldsMap.set(field.name, field);
      }
    }

    // 保存配置
    this.config = options.config ?? {};
    this.currentMaxNestingLevel = this.config.maxNestingLevel ?? DEFAULT_MAX_NESTING_LEVEL;

    // 初始化状态
    let initialState: QueryBuilderState<T>;
    if (options.initialState) {
      initialState = options.initialState;
    } else if (options.initialQuery) {
      initialState = this.queryConverter.fromRxDBQuery(options.initialQuery);
    } else if (options.config?.initialQuery) {
      initialState = { rootGroup: options.config.initialQuery };
    } else {
      initialState = { rootGroup: createEmptyRootGroup<T>() };
    }

    this.stateSubject = new BehaviorSubject(initialState);

    // 设置 Observable 流
    this.state$ = this.stateSubject.asObservable();

    this.rootGroup$ = this.state$.pipe(
      map(state => state.rootGroup),
      distinctUntilChanged()
    );

    this.validation$ = this.state$.pipe(
      map(state =>
        this.validationService.validateGroup(state.rootGroup as unknown as ValidationGroupInput, this.fieldsMap)
      ),
      distinctUntilChanged((a, b) => a.valid === b.valid && structuralEqual(a.errors, b.errors))
    );

    this.query$ = this.state$.pipe(
      map(state => this.queryConverter.toRxDBQuery(state)),
      distinctUntilChanged((a, b) => structuralEqual(a, b))
    );
  }

  /**
   * 获取当前状态快照
   */
  getState(): QueryBuilderState<T> {
    return this.stateSubject.getValue();
  }

  /**
   * 获取当前配置
   */
  getConfig(): QueryBuilderConfig<T> {
    return this.config;
  }

  /**
   * 获取最大嵌套层级
   */
  getMaxNestingLevel(): number {
    return this.currentMaxNestingLevel;
  }

  /**
   * 动态更新最大嵌套层级
   */
  setMaxNestingLevel(level: number): void {
    this.currentMaxNestingLevel = level;
  }

  /**
   * 获取字段列表
   */
  getFields(): FieldMetadata[] {
    return Array.from(this.fieldsMap.values());
  }

  /**
   * 设置字段列表
   */
  setFields(fields: FieldMetadata[]): void {
    this.fieldsMap.clear();
    for (const field of fields) {
      this.fieldsMap.set(field.name, field);
    }
  }

  /**
   * 获取操作符注册表
   */
  getOperatorRegistry(): OperatorRegistry {
    return this.operatorRegistry;
  }

  // ==================== 规则操作 ====================

  /**
   * 添加规则
   */
  addRule(parentGroupId: string | null = null, rule?: Partial<Omit<UIRule, 'id'>>): string {
    const newRule = {
      id: generateId(),
      field: rule?.field ?? ('' as keyof T & string),
      operator: rule?.operator ?? ('=' as OperatorName),
      ...(rule && 'value' in rule ? { value: rule.value } : { value: '' })
    } as QueryBuilderRule<T>;

    const state = this.getState();
    const targetId = parentGroupId ?? state.rootGroup.id;
    const targetDepth = this.getGroupDepth(state.rootGroup, targetId);
    if (targetDepth === -1) {
      throw new Error(`目标分组不存在: ${targetId}`);
    }

    const newRootGroup = this.addItemToGroup(state.rootGroup, targetId, newRule);

    this.stateSubject.next({ rootGroup: newRootGroup });
    return newRule.id;
  }

  /**
   * 添加规则组
   */
  addGroup(parentGroupId: string | null = null, combinator: 'and' | 'or' = DEFAULT_COMBINATOR): string {
    const state = this.getState();
    const targetId = parentGroupId ?? state.rootGroup.id;

    // 检查嵌套深度
    const currentDepth = this.getGroupDepth(state.rootGroup, targetId);
    if (currentDepth === -1) {
      throw new Error(`目标分组不存在: ${targetId}`);
    }
    const maxDepth = this.getMaxNestingLevel();
    if (currentDepth >= maxDepth) {
      throw new Error(`已达到最大嵌套深度 ${maxDepth}`);
    }

    const newGroup: QueryBuilderRuleGroup<T> = {
      id: generateId(),
      combinator,
      rules: []
    };

    const newRootGroup = this.addItemToGroup(state.rootGroup, targetId, newGroup);
    this.stateSubject.next({ rootGroup: newRootGroup });
    return newGroup.id;
  }

  /**
   * 更新规则
   */
  updateRule(ruleId: string, updates: Partial<Omit<UIRule, 'id'>>): void {
    const state = this.getState();
    const newRootGroup = this.updateItemInGroup(
      state.rootGroup,
      ruleId,
      updates as Partial<QueryBuilderRule<T> | QueryBuilderRuleGroup<T>>
    );
    this.stateSubject.next({ rootGroup: newRootGroup });
  }

  /**
   * 更新组的组合器
   */
  updateGroupCombinator(groupId: string, combinator: 'and' | 'or'): void {
    const state = this.getState();
    const newRootGroup = this.updateItemInGroup(state.rootGroup, groupId, { combinator });
    this.stateSubject.next({ rootGroup: newRootGroup });
  }

  /**
   * 删除规则或组
   */
  remove(itemId: string): void {
    const state = this.getState();

    // 不允许删除根组
    if (itemId === state.rootGroup.id) {
      throw new Error('不能删除根组');
    }

    const newRootGroup = this.removeItemFromGroup(state.rootGroup, itemId);
    this.stateSubject.next({ rootGroup: newRootGroup });
  }

  /**
   * 移动规则或组到目标分组的指定位置
   */
  moveItem(itemId: string, targetGroupId: string, targetIndex: number): void {
    const state = this.getState();

    // 不允许移动根组
    if (itemId === state.rootGroup.id) {
      throw new Error('不能移动根组');
    }

    // 查找要移动的项
    const item = this.findItem(state.rootGroup, itemId);
    if (!item) {
      throw new Error(`项目不存在: ${itemId}`);
    }

    // 如果是规则组，不能移动到自身内部
    if (isRuleGroup<T>(item) && this.isDescendant(item, targetGroupId)) {
      throw new Error('不能将分组移动到其自身内部');
    }

    // 先移除，再插入
    const afterRemove = this.removeItemFromGroup(state.rootGroup, itemId);
    const newRootGroup = this.insertItemInGroup(afterRemove, targetGroupId, item, targetIndex);
    this.stateSubject.next({ rootGroup: newRootGroup });
  }

  /**
   * 清空所有规则
   */
  clear(): void {
    this.stateSubject.next({ rootGroup: createEmptyRootGroup<T>() });
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.stateSubject.complete();
  }

  // ==================== 转换方法 ====================

  /**
   * 获取 RxDB Query 格式
   */
  toRxDBQuery(): RuleGroup<T> {
    return this.queryConverter.toRxDBQuery(this.getState());
  }

  /**
   * 从 RxDB Query 加载
   *
   * 同时接受 RuleGroup（无 id）和 QueryBuilderRuleGroup（有 id）。
   * 内部会重新分配 id，原始 id 会被忽略。
   */
  fromRxDBQuery(query: RuleGroup<T> | QueryBuilderRuleGroup<T>): void {
    const state = this.queryConverter.fromRxDBQuery(query as RuleGroup<T>);
    this.stateSubject.next(state);
  }

  // ==================== 校验方法 ====================

  /**
   * 执行校验并返回结果
   */
  validate(): ValidationResult {
    return this.validationService.validateGroup(
      this.getState().rootGroup as unknown as ValidationGroupInput,
      this.fieldsMap
    );
  }

  /**
   * 检查当前状态是否有效
   */
  isValid(): boolean {
    return this.validate().valid;
  }

  // ==================== 私有辅助方法 ====================

  private addItemToGroup(
    group: QueryBuilderRuleGroup<T>,
    targetGroupId: string,
    item: QueryBuilderRule<T> | QueryBuilderRuleGroup<T>
  ): QueryBuilderRuleGroup<T> {
    if (group.id === targetGroupId) {
      return {
        ...group,
        rules: [...group.rules, item]
      };
    }

    return {
      ...group,
      rules: group.rules.map(child => {
        if (isRuleGroup<T>(child)) {
          return this.addItemToGroup(child, targetGroupId, item);
        }
        return child;
      })
    };
  }

  private updateItemInGroup(
    group: QueryBuilderRuleGroup<T>,
    itemId: string,
    updates: Partial<QueryBuilderRule<T> | QueryBuilderRuleGroup<T>>
  ): QueryBuilderRuleGroup<T> {
    if (group.id === itemId) {
      return { ...group, ...updates } as QueryBuilderRuleGroup<T>;
    }

    return {
      ...group,
      rules: group.rules.map(child => {
        if (isRuleGroup<T>(child)) {
          if (child.id === itemId) {
            return { ...child, ...updates } as QueryBuilderRuleGroup<T>;
          }
          return this.updateItemInGroup(child, itemId, updates);
        } else if (isRule<T>(child) && child.id === itemId) {
          return { ...child, ...updates } as QueryBuilderRule<T>;
        }
        return child;
      })
    };
  }

  private removeItemFromGroup(group: QueryBuilderRuleGroup<T>, itemId: string): QueryBuilderRuleGroup<T> {
    const rules: Array<QueryBuilderRule<T> | QueryBuilderRuleGroup<T>> = [];
    for (const child of group.rules) {
      if (child.id === itemId) continue;
      rules.push(isRuleGroup<T>(child) ? this.removeItemFromGroup(child, itemId) : child);
    }
    return { ...group, rules };
  }

  private getGroupDepth(group: QueryBuilderRuleGroup<T>, targetId: string, currentDepth = 1): number {
    if (group.id === targetId) {
      return currentDepth;
    }

    for (const child of group.rules) {
      if (isRuleGroup<T>(child)) {
        const depth = this.getGroupDepth(child, targetId, currentDepth + 1);
        if (depth !== -1) {
          return depth;
        }
      }
    }

    return -1;
  }

  private findItem(
    group: QueryBuilderRuleGroup<T>,
    itemId: string
  ): QueryBuilderRule<T> | QueryBuilderRuleGroup<T> | undefined {
    for (const child of group.rules) {
      if (child.id === itemId) return child;
      if (isRuleGroup<T>(child)) {
        const found = this.findItem(child, itemId);
        if (found) return found;
      }
    }
    return undefined;
  }

  private isDescendant(group: QueryBuilderRuleGroup<T>, targetId: string): boolean {
    if (group.id === targetId) return true;
    for (const child of group.rules) {
      if (isRuleGroup<T>(child) && this.isDescendant(child, targetId)) return true;
    }
    return false;
  }

  private insertItemInGroup(
    group: QueryBuilderRuleGroup<T>,
    targetGroupId: string,
    item: QueryBuilderRule<T> | QueryBuilderRuleGroup<T>,
    index: number
  ): QueryBuilderRuleGroup<T> {
    if (group.id === targetGroupId) {
      const rules = [...group.rules];
      const clampedIndex = Math.max(0, Math.min(index, rules.length));
      rules.splice(clampedIndex, 0, item);
      return { ...group, rules };
    }

    return {
      ...group,
      rules: group.rules.map(child => {
        if (isRuleGroup<T>(child)) {
          return this.insertItemInGroup(child, targetGroupId, item, index);
        }
        return child;
      })
    };
  }
}

/**
 * 创建 QueryBuilderService 实例的工厂函数
 *
 * @param options - 服务选项
 * @returns 新的 QueryBuilderService 实例
 */
export function createQueryBuilderService<T = Record<string, unknown>>(
  options?: QueryBuilderServiceOptions<T>
): QueryBuilderService<T> {
  return new QueryBuilderService<T>(options);
}
