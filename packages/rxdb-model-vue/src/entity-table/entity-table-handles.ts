import type { ListTable } from '@visactor/vtable';

/**
 * {@link EntityTable} 的命令面（对齐 React 侧 `EntityTableHandle` / Angular 组件公开成员）。
 *
 * 共享命令集（三端一致）：`tableInstance` / `changeCellValue` / `redrawTheme` / `restoreRecords`。
 * Vue 端经 `defineExpose` 暴露，公开实例（模板 ref / `useTemplateRef`）上的响应式成员
 * 按 Vue 惯例自动解包，因此本类型与消费者实际拿到的形状一致。
 */
export interface EntityTableHandle {
  /** 当前 VTable 表格实例；未初始化时为 `null`。 */
  readonly tableInstance: ListTable | null;
  /** 表格容器元素；未挂载时为 `null`。 */
  readonly tableContainer: HTMLElement | null;
  /** 表头高度（px）。 */
  readonly headerHeight: number;
  /** 单元格悬停 tooltip 状态。 */
  readonly cellTooltip: { x: number; y: number; content: string } | null;
  /** 从业务层回滚单元格值（校验失败时恢复原值）。 */
  changeCellValue(col: number, row: number, value: unknown): void;
  /** 用当前暗色模式与 CSS 变量重绘主题。 */
  redrawTheme(): void;
  /** 把行恢复成最近一次交给表格的顺序（拖放被拒或落库失败时调用）。 */
  restoreRecords(): void;
}

/**
 * {@link QueryTable} 的命令面（对齐 React 侧 `QueryTableHandle` / Angular 组件公开成员）。
 *
 * 共享命令集（三端一致）：`tableInstance` / `changeCellValue` / `redrawTheme` / `restoreRecords`。
 */
export interface QueryTableHandle {
  /** 内部实体表格实例；未挂载时为 `null`。 */
  readonly entityTable: EntityTableHandle | null;
  /** 筛选状态栏文案（如 `2 / 10`）。 */
  readonly statusText: string;
  /** 内部实体表格的 VTable 实例；未初始化时为 `null`。 */
  readonly tableInstance: ListTable | null;
  /** 回滚单元格值（委托给内部实体表格）。 */
  changeCellValue(col: number, row: number, value: unknown): void;
  /** 重绘主题（委托给内部实体表格）。 */
  redrawTheme(): void;
  /** 把行恢复成最近一次交给表格的顺序（委托给内部实体表格）。 */
  restoreRecords(): void;
}
