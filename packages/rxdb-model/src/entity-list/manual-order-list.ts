/**
 * @fileoverview 实体列表的手动排序：拖拽启用谓词、默认排序与落库协调（US-028 阶段 B）
 *
 * 列表只在「看到的行就是一条完整排序域」时允许拖拽：邻居才是真邻居，
 * `Repository.reorder()` 才能按 `{ prevId, nextId }` 落到用户看到的位置。
 * 三端 `EntityList` 共用这一份判定与协调，框架层只负责收集状态和接线。
 */
import {
  type EntityMetadata,
  type OrderBy,
  PropertyType,
  isManualOrderEntity,
  manualOrderGroupFields,
  normalizeManualOrderBy
} from '@aiao/rxdb';
import type { RowMoveEvent } from '../entity-table/vtable/table-row-move.js';

/** 列表排序判定需要的实体元数据 */
export type ManualOrderListMetadata = Pick<EntityMetadata, 'manualOrder' | 'propertyMap'>;

/** 列表的固定查询（详情页关系标签传入），结构同查询构建器的规则组 */
export interface ListFixedQuery {
  /** 规则组合方式 */
  readonly combinator: 'and' | 'or';
  /** 规则；嵌套规则组视为不能钉住排序域 */
  readonly rules: readonly unknown[];
}

/**
 * 判定列表能否拖拽排序时用到的列表状态
 */
export interface ListReorderState {
  /** 当前实体元数据；未注册实体为 `undefined` */
  readonly metadata: ManualOrderListMetadata | undefined;
  /** 列头排序状态；只有 `normal`（未按列排序）时显示的才是手动顺序 */
  readonly sortOrder: 'asc' | 'desc' | 'normal';
  /** 用户在筛选框里加了条件 */
  readonly hasUserFilter: boolean;
  /** 列表处于关联选择模式 */
  readonly selectMode: boolean;
  /** 外部传入的固定查询 */
  readonly fixedQuery: ListFixedQuery | undefined;
  /** 排序域已全部加载：没有下一页且不在加载中 */
  readonly fullyLoaded: boolean;
  /** 存在只读行（无编辑权限） */
  readonly hasReadonlyRows: boolean;
  /** 存在未落库的草稿行 */
  readonly hasDrafts: boolean;
  /** 存在未完成的单元格编辑写入 */
  readonly hasPendingEdits: boolean;
  /** 上一次拖拽的重排还没落定 */
  readonly reorderPending: boolean;
}

const STRING_KEY_TYPES: ReadonlySet<string> = new Set<string>([PropertyType.string, PropertyType.uuid]);

const isPinRule = (rule: unknown): rule is { field: string; operator: string } => {
  if (typeof rule !== 'object' || rule === null || 'rules' in rule) return false;
  const { field, operator } = rule as { field?: unknown; operator?: unknown };
  return typeof field === 'string' && (operator === '=' || operator === 'null');
};

/**
 * 固定查询是否恰好钉住一条完整的排序域
 *
 * @param groupFields - 实体声明的分组字段
 * @param fixedQuery - 列表的固定查询
 * @returns 整表排序要求没有固定条件；分组排序要求只有对全部分组字段各一条等值（或 `null`）条件
 */
export function pinsSingleOrderDomain(groupFields: readonly string[], fixedQuery: ListFixedQuery | undefined): boolean {
  const rules = fixedQuery?.rules ?? [];
  if (groupFields.length === 0) return rules.length === 0;
  if (rules.length !== groupFields.length) return false;
  if (rules.length > 1 && fixedQuery?.combinator !== 'and') return false;
  if (!rules.every(isPinRule)) return false;
  const pinned = new Set(rules.map(rule => (rule as { field: string }).field));
  return pinned.size === groupFields.length && groupFields.every(field => pinned.has(field));
}

/**
 * 实体列表当前是否允许拖拽排序
 *
 * @param state - 列表状态
 * @returns 全部条件满足时为 `true`：手动排序实体、字符串主键、未按列排序、无用户筛选、非选择模式、
 *   固定查询钉住一条完整排序域、已全部加载、没有只读行 / 草稿 / 未完成编辑 / 未落定的重排
 *
 * @example
 * ```typescript
 * const enabled = canReorderEntityList({ metadata, sortOrder: 'normal', fixedQuery, ...flags });
 * ```
 */
export function canReorderEntityList(state: ListReorderState): boolean {
  const { metadata } = state;
  if (!metadata || !isManualOrderEntity(metadata)) return false;
  const keyType = metadata.propertyMap.get('id')?.type;
  if (keyType === undefined || !STRING_KEY_TYPES.has(keyType)) return false;
  if (state.sortOrder !== 'normal' || state.hasUserFilter || state.selectMode) return false;
  if (!pinsSingleOrderDomain(manualOrderGroupFields(metadata), state.fixedQuery)) return false;
  if (!state.fullyLoaded || state.hasReadonlyRows || state.hasDrafts) return false;
  return !state.hasPendingEdits && !state.reorderPending;
}

/**
 * 列表未按列排序时的游标排序
 *
 * @param metadata - 实体元数据；未注册实体为 `undefined`
 * @returns 手动排序实体为 `[分组字段… asc, sortOrder asc, id asc]`，其余为 `[id desc]`
 */
export function defaultListOrderBy(metadata: Pick<EntityMetadata, 'manualOrder'> | undefined): OrderBy[] {
  if (metadata && isManualOrderEntity(metadata))
    return normalizeManualOrderBy<{ orderBy?: OrderBy[] }>(metadata, {}).orderBy ?? [];
  return [{ field: 'id', sort: 'desc' }];
}

/**
 * 行拖放落库时与界面交互的钩子
 */
export interface RowMoveCommitHooks {
  /** 放下这一刻列表是否允许拖拽排序（{@link canReorderEntityList} 的结论） */
  readonly enabled: boolean;
  /** 落库重排，通常是 `repository.reorder(move.id, { prevId, nextId })` */
  reorder(move: RowMoveEvent): Promise<unknown>;
  /** 把表格行恢复成最近一次已提交的顺序 */
  restore(): void;
  /** 重排进行中状态变化 */
  setPending(pending: boolean): void;
  /** 显示（或用 `null` 清除）落库错误 */
  setError(error: unknown): void;
}

/**
 * 协调一次行拖放的落库
 *
 * @param move - 表格读出的拖放结果
 * @param hooks - 界面钩子
 * @returns 落库成功为 `true`；不允许拖拽或落库失败为 `false`，此时表格已恢复原顺序
 *
 * @remarks
 * 不允许时零写入，直接恢复表格（程序触发的拖放事件同样被拒）。成功后不改表格，
 * 由活查询按数据库重查的结果刷新；失败时显式恢复，下一次拖拽照常可用。
 */
export async function commitRowMove(move: RowMoveEvent, hooks: RowMoveCommitHooks): Promise<boolean> {
  if (!hooks.enabled) {
    hooks.restore();
    return false;
  }
  hooks.setError(null);
  hooks.setPending(true);
  try {
    await hooks.reorder(move);
    return true;
  } catch (error) {
    hooks.setError(error);
    hooks.restore();
    return false;
  } finally {
    hooks.setPending(false);
  }
}
