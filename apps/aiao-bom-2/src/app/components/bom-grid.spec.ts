import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ListTableConstructorOptions } from '@visactor/vtable';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomIndex } from '../core/query';
import { makeStressDataset } from '../core/stress-data';
import { DEFAULT_QUERY, type BomRow, type ViewMode } from '../core/types';
import { BomGrid, DEFAULT_COLUMNS } from './bom-grid';

type RecordRow = BomRow & { children?: RecordRow[] | true; selected?: boolean; pageParent?: string | null };
type CellEvent = {
  col: number;
  row: number;
  event?: MouseEvent | KeyboardEvent;
  checked?: boolean;
  hierarchyState?: 'expand' | 'collapse';
};
class FakeDataSource {
  constructor(readonly source: { length: number; get: (index: number) => RecordRow | undefined }) {}
}
class FakeTable {
  private readonly callbacks = new Map<string, (event: CellEvent) => void>();
  static current: FakeTable;
  options: ListTableConstructorOptions;
  rowCount = 0;
  scrollTop = 0;
  scrollLeft = 0;
  readonly release = vi.fn();
  readonly resize = vi.fn();
  readonly selectCell = vi.fn((col: number, row: number) => this.fire('selected_cell', { col, row }));
  readonly setCellCheckboxState = vi.fn();
  constructor(_host: HTMLElement, options: ListTableConstructorOptions) {
    this.options = options;
    FakeTable.current = this;
  }
  on(name: string, callback: (event: CellEvent) => void): void {
    this.callbacks.set(name, callback);
  }
  fire(name: string, event: CellEvent = { col: 1, row: 1 }): void {
    this.callbacks.get(name)?.(event);
  }
  updateOption(options: ListTableConstructorOptions): Promise<void> {
    this.options = options;
    this.rowCount = this.records().length + 1;
    return Promise.resolve();
  }
  records(): RecordRow[] {
    if (this.options.dataSource) {
      const source = this.options.dataSource as unknown as FakeDataSource;
      return Array.from({ length: source.source.length }, (_, index) => source.source.get(index)!);
    }
    const rows: RecordRow[] = [];
    const visit = (nodes: RecordRow[]) => {
      for (const node of nodes) {
        rows.push(node);
        if (Array.isArray(node.children)) visit(node.children);
      }
    };
    visit(this.options.records as RecordRow[]);
    return rows;
  }
  getCellOriginRecord(_col: number, row: number): RecordRow | undefined {
    return this.records()[row - 1];
  }
  getCellAddress(predicate: (record: unknown) => boolean): { col: number; row: number } {
    return { col: 1, row: this.records().findIndex(predicate) + 1 };
  }
  getBodyVisibleCellRange() {
    return { rowStart: 1, rowEnd: Math.min(4, this.records().length) };
  }
  getColWidth(index: number): number {
    return index * 100;
  }
  getAllColsWidth(): number {
    return 1200;
  }
  setRecordChildren(children: RecordRow[], col: number, row: number): void {
    this.getCellOriginRecord(col, row)!.children = children;
  }
}
vi.mock('@visactor/vtable', () => ({ ListTable: FakeTable, data: { DataSource: FakeDataSource } }));
let fixture: ComponentFixture<BomGrid>;
async function mount(count = 12, mode: ViewMode = 'tree', shape: 'balanced' | 'wide' = 'balanced'): Promise<BomIndex> {
  const index = new BomIndex(makeStressDataset(count, shape), 'catalog');
  fixture = TestBed.createComponent(BomGrid);
  fixture.componentRef.setInput('result', index.query({ ...DEFAULT_QUERY, mode }));
  fixture.componentRef.setInput('mode', mode);
  fixture.componentRef.setInput('expanded', ['stress:0']);
  fixture.detectChanges();
  await vi.waitFor(() =>
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-busy=false]')).not.toBeNull()
  );
  return index;
}
afterEach(() => {
  fixture?.destroy();
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
describe('Canvas 表格适配与发生位置身份', () => {
  it('鼠标、键盘、多选和勾选发出真实发生位置，程序定位不反向覆盖选择', async () => {
    await mount();
    const table = FakeTable.current;
    const grid = fixture.componentInstance;
    const selected = vi.fn();
    const checked = vi.fn();
    const enter = vi.fn();
    const widths = vi.fn();
    grid.rowSelect.subscribe(selected);
    grid.checked.subscribe(checked);
    grid.enter.subscribe(enter);
    grid.columnWidths.subscribe(widths);
    table.fire('click_cell', { col: 1, row: 2, event: new MouseEvent('click', { ctrlKey: true }) });
    expect(selected).toHaveBeenLastCalledWith(
      expect.objectContaining({ row: expect.objectContaining({ key: 'stress:1' }), additive: true })
    );
    table.fire('keydown', { col: 1, row: 2, event: new KeyboardEvent('keydown', { metaKey: true }) });
    table.fire('selected_cell', { col: 1, row: 3 });
    expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({ additive: true }));
    table.fire('click_cell', { col: 0, row: 2 });
    table.fire('selected_cell', { col: 0, row: 2 });
    table.fire('click_cell', { col: 1, row: 0 });
    expect(selected).toHaveBeenCalledTimes(2);
    table.fire('checkbox_state_change', { col: 0, row: 2, checked: true });
    expect(checked).toHaveBeenCalledWith(expect.objectContaining({ key: 'stress:1', checked: true }));
    table.fire('dblclick_cell');
    expect(enter).toHaveBeenCalledWith('stress:0');
    table.fire('resize_column_end');
    expect(widths).toHaveBeenCalledWith(expect.arrayContaining([{ field: 'name', width: 100 }]));
    fixture.componentRef.setInput('selection', 'stress:2');
    fixture.detectChanges();
    await Promise.resolve();
    expect(table.selectCell).toHaveBeenCalled();
    expect(selected).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('checkedKeys', new Set(['stress:1']));
    fixture.detectChanges();
    expect(table.setCellCheckboxState).toHaveBeenCalledWith(0, 2, true);
    fixture.destroy();
    expect(table.release).toHaveBeenCalledTimes(1);
  });
  it('宽分支分页控制行不冒充物料，展开状态和下一页可恢复', async () => {
    await mount(1200, 'tree', 'wide');
    const grid = fixture.componentInstance;
    const table = FakeTable.current;
    const selected = vi.fn();
    const expanded = vi.fn();
    grid.rowSelect.subscribe(selected);
    grid.expandedChange.subscribe(expanded);
    const replace = vi.spyOn(table, 'setRecordChildren');
    table.scrollTop = 15000;
    expect(table.records()).toHaveLength(502);
    table.fire('click_cell', { col: 1, row: 502 });
    await Promise.resolve();
    expect(table.records()).toHaveLength(1002);
    expect(selected).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(table.scrollTop).toBe(15000);
    table.fire('tree_hierarchy_state_change', { col: 1, row: 1, hierarchyState: 'collapse' });
    expect(expanded).toHaveBeenLastCalledWith([]);
    table.getCellOriginRecord(1, 1)!.children = true;
    table.fire('tree_hierarchy_state_change', { col: 1, row: 1, hierarchyState: 'expand' });
    expect(table.records()).toHaveLength(1002);
    expect(expanded).toHaveBeenLastCalledWith(['stress:0']);
    grid.expandTo(0);
    expect(expanded).toHaveBeenLastCalledWith([]);
    grid.expandTo(2);
    expect(expanded).toHaveBeenLastCalledWith(['stress:0']);
  });
  it('树转平铺后事件使用新窗口，物料汇总保留成员，绘制就绪可观测', async () => {
    const index = await mount();
    const grid = fixture.componentInstance;
    const table = FakeTable.current;
    const selected = vi.fn();
    grid.rowSelect.subscribe(selected);
    const query = index.query({ ...DEFAULT_QUERY, mode: 'flat', search: 'ST-000011' });
    fixture.componentRef.setInput('result', query);
    fixture.componentRef.setInput('mode', 'flat');
    fixture.componentRef.setInput('queryKey', 'ST-000011');
    fixture.detectChanges();
    table.fire('selected_cell');
    expect(selected).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-rendered-mode=flat]')).not.toBeNull()
    );
    table.fire('click_cell');
    expect(selected).toHaveBeenLastCalledWith(
      expect.objectContaining({ row: expect.objectContaining({ key: 'stress:11' }) })
    );
    const summary = index.query({ ...DEFAULT_QUERY, mode: 'summary' });
    fixture.componentRef.setInput('mode', 'summary');
    fixture.componentRef.setInput('result', summary);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-rendered-mode=summary]')).not.toBeNull()
    );
    fixture.componentRef.setInput('checkedKeys', new Set(['stress:0']));
    fixture.detectChanges();
    expect(table.setCellCheckboxState).toHaveBeenCalledWith(0, 1, true);
    performance.mark('bom2:interaction-start');
    table.fire('after_render');
    table.fire('scroll');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-interaction-ms]')).not.toBeNull();
    expect(table.options.columns).toHaveLength(DEFAULT_COLUMNS.filter(c => c.visible).length + 1);
  });
  it('根列表同样分段，密度和列变动不丢身份', async () => {
    const index = new BomIndex(makeStressDataset(1200), 'catalog');
    for (const row of index.rows.values()) row.parentKey = null;
    const result = index.query({ ...DEFAULT_QUERY, mode: 'flat' });
    result.byParent = new Map([[null, result.rows]]);
    fixture = TestBed.createComponent(BomGrid);
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect((fixture.nativeElement as HTMLElement).querySelector('[aria-busy=false]')).not.toBeNull()
    );
    expect(FakeTable.current.records()).toHaveLength(501);
    FakeTable.current.fire('click_cell', { col: 1, row: 501 });
    await Promise.resolve();
    expect(FakeTable.current.records()).toHaveLength(1001);
    fixture.componentRef.setInput('compact', false);
    fixture.detectChanges();
    await Promise.resolve();
    expect(FakeTable.current.options.defaultRowHeight).toBe(45);
  });
});
