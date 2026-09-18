/**
 * @fileoverview `@visactor/vtable` 的测试替身模块（vi.mock 工厂目标）。
 *
 * 真实 VTable 依赖 canvas 测量与浏览器渲染，happy-dom 里无法运行；
 * 组件真实 spec 只关心「表格引擎事件 → 组件 output」的桥接与列表渲染本身，
 * 因此打桩整个引擎：`FakeListTable` 只保留组件与 rxdb-model 表格助手调用到的
 * 方法面（on / setRecords / getRecordByCell / updateTheme / release …），
 * 事件由测试经 {@link FakeListTable.emit} 按真实事件名驱动。
 *
 * 组件自身代码（事件绑定、剪贴板编排、列定义解析、output 桥接）全部走真实现。
 *
 * @internal 仅测试使用，不随库发布。
 */
import { vi } from 'vitest';

/** 单行记录。 */
type RecordRow = Record<string, unknown>;

/** 列定义（取组件传入的原始结构）。 */
type Column = Record<string, unknown>;

/** VTable 事件处理器。 */
type Handler = (...args: never[]) => void;

/**
 * 打桩版 ListTable。
 *
 * @remarks 行索引与真实 VTable 一致：row 0 是表头，数据行从 1 开始；
 * `rowSeriesNumber` 列占 col 0，数据列从 1 开始（与 `ROW_SERIES_COL_OFFSET` 对应）。
 */
export class FakeListTable {
  readonly #handlers = new Map<string, Handler[]>();
  #records: RecordRow[] = [];
  #columns: Column[] = [];
  #released = false;
  /** 测试可写：`getSelectedCellInfos()` 的返回值（剪贴板/删除路径读它）。 */
  selectedCellInfos: Record<string, unknown>[][] = [];
  /** 最近一次 updateTheme 收到的主题。 */
  lastTheme: unknown = undefined;
  /** setRecords 被调用的次数（断言重渲染用）。 */
  setRecordsCalls = 0;

  constructor(
    readonly container: HTMLElement,
    readonly options: Record<string, unknown>
  ) {
    this.#records = (options['records'] as RecordRow[]) ?? [];
    this.#columns = (options['columns'] as Column[]) ?? [];
  }

  /** 注册事件监听（真实 VTable 同签名）。 */
  on(type: string, handler: Handler): void {
    const list = this.#handlers.get(type) ?? [];
    list.push(handler);
    this.#handlers.set(type, list);
  }

  /** 测试驱动：以真实事件名触发已注册的监听器。 */
  emit(type: string, args: Record<string, unknown>): void {
    for (const handler of this.#handlers.get(type) ?? []) {
      handler(args as never);
    }
  }

  get colCount(): number {
    return this.#columns.length + 1;
  }

  get rowCount(): number {
    return this.#records.length + 1;
  }

  getRecordByCell(col: number, row: number): RecordRow | undefined {
    void col;
    return this.#records[row - 1];
  }

  setRecords(records: RecordRow[]): void {
    this.#records = records;
    this.setRecordsCalls += 1;
  }

  updateColumns(columns: Column[]): void {
    this.#columns = columns;
  }

  getColWidth(col: number): number {
    return (this.#columns[col - 1]?.['width'] as number | undefined) ?? 120;
  }

  setColWidth(col: number, width: number): void {
    const column = this.#columns[col - 1];
    if (column) column['width'] = width;
  }

  getRowHeight(_row: number): number {
    return 40;
  }

  updateTheme(theme: unknown): void {
    this.lastTheme = theme;
  }

  resize(): void {
    // 打桩：无实际布局
  }

  release(): void {
    this.#released = true;
  }

  get isReleased(): boolean {
    return this.#released;
  }

  /** 当前选中单元格（keydown 删除路径读它；测试经 selectedCellInfos 字段配置）。 */
  getSelectedCellInfos(): Record<string, unknown>[][] {
    return this.selectedCellInfos;
  }

  getCellInfo(col: number, row: number): Record<string, unknown> {
    const column = this.#columns[col - 1];
    const record = this.#records[row - 1];
    const field = typeof column?.['field'] === 'string' ? (column['field'] as string) : '';
    return {
      value: (record?.[field] ?? '') as unknown,
      cellType: column?.['cellType'] ?? 'text',
      field
    };
  }

  getCellRect(_col: number, _row: number): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: 100, height: 32 };
  }

  getElement(): HTMLElement {
    return this.container;
  }

  setCellSwitchState(_col: number, _row: number, _checked: boolean): void {
    // 打桩：视觉状态无需真实更新
  }

  changeCellValue(_col: number, _row: number, _value: unknown): void {
    // 打桩：回写路径由组件 output 断言
  }
}

/**
 * `@visactor/vtable` 的替身模块面。
 *
 * @remarks `register.editor` 与 `themes.DEFAULT.extends` 是 rxdb-model
 * `createListTable` / `createTheme` 运行时用到的两个静态入口。
 */
export const register = { editor: vi.fn() };

/** 主题链：`createTheme` 调用 `VTable.themes.DEFAULT.extends`，替身原样透传。 */
export const themes = { DEFAULT: { extends: (theme: unknown): unknown => ({ ...(theme as object) }) } };

export { FakeListTable as ListTable };
