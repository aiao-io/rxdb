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
