import type { ListTable } from '@visactor/vtable';

/**
 * 通用实体表记录基础接口
 *
 * 业务层扩展此接口添加领域字段。
 * `_` 前缀字段为内部元数据，不会被剪贴板/编辑操作处理。
 */
export interface EntityTableRecord {
  /** 记录字段值（字段名 → 值） */
  [key: string]: unknown;
  /** 只读行（不可编辑、不可拖拽、不可删除） */
  _readonly?: boolean;
  /** 新增模板行 */
  _isAddRow?: boolean;
  /** 树结构子节点 */
  children?: EntityTableRecord[];
  /** VTable 树节点展开状态 */
  hierarchyState?: 'expand' | 'collapse';
}

/** 单元格变更事件 */
export interface CellChangeEvent {
  /** 变更所在列索引 */
  col: number;
  /** 变更所在行索引 */
  row: number;
  /** 变更的字段名 */
  field: string;
  /** 变更后的值 */
  value: unknown;
  /** 变更所在行记录 */
  record: EntityTableRecord;
}

/** 批量变更项 */
export interface BatchChangeItem {
  /** 目标记录 ID */
  recordId: string;
  /** 字段名到新值的映射 */
  changes: Record<string, unknown>;
}

/** 行删除事件 */
export interface RowDeleteEvent {
  /** 被删除的行记录 */
  record: EntityTableRecord;
}

/** 行重排事件 */
export interface RowReorderEvent {
  /** 重排后的行 ID 顺序列表 */
  orderedIds: string[];
}

/** 剪贴板/批量写入的待提交操作 */
export interface PendingWrite {
  /** 目标列索引 */
  col: number;
  /** 目标行索引 */
  row: number;
  /** 待写入的值 */
  value: unknown;
  /** 目标列字段名 */
  field: string;
  /** 目标行记录快照（写入时刻） */
  record: EntityTableRecord;
}

/** 表格配置 */
export interface EntityTableConfig {
  /** 单元格错误 tooltip 延迟（毫秒），默认 800 */
  tooltipDelay?: number;
}

/**
 * 实体表格的命令面：三端 `EntityTable` 组件对外暴露的同一组命令。
 *
 * @remarks
 * React 经 `ref`（`forwardRef` + `useImperativeHandle`）、Vue 经 `defineExpose`、Angular 即组件实例
 * 本身（`EntityTableComponent implements EntityTableHandle`）。三端各自另有的公开成员（Angular 的
 * input / output、Vue 暴露给内部父组件的状态）不在契约内，按本类型写的调用方与 mock 三端通用。
 */
export interface EntityTableHandle {
  /** 当前 VTable 表格实例；未初始化时为 `null`。 */
  readonly tableInstance: ListTable | null;
  /** 从业务层回滚单元格值（校验失败时恢复原值）。 */
  changeCellValue(col: number, row: number, value: unknown): void;
  /** 用当前暗色模式与 CSS 变量重绘主题。 */
  redrawTheme(): void;
  /** 把行恢复成最近一次交给表格的顺序（拖放被拒或落库失败时调用）。 */
  restoreRecords(): void;
}

/**
 * 查询表格的命令面：成员与 {@link EntityTableHandle} 相同，全部委托给内部实体表格。
 *
 * @remarks 三端 `QueryTable` 组件的暴露方式同 {@link EntityTableHandle}。
 */
export type QueryTableHandle = EntityTableHandle;
