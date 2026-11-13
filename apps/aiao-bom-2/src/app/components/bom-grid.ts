import { AfterViewInit, Component, ElementRef, OnDestroy, effect, input, output, viewChild } from '@angular/core';
import type { ListTable, ListTableConstructorOptions } from '@visactor/vtable';
import type { BomRow, QueryResult, ViewMode } from '../core/types';
interface GridRecord extends BomRow { children?: GridRecord[] | true; hierarchyState?: 'expand' | 'collapse'; selected?: boolean; quantityText: string; modelText: string; statusText: string }
export interface GridColumn { field: string; title: string; width: number; visible: boolean }
export const DEFAULT_COLUMNS: GridColumn[] = [
  { field: 'name', title: '零件 / 装配名称', width: 276, visible: true }, { field: 'partId', title: 'GID / 物料编码', width: 136, visible: true },
  { field: 'compId', title: '变体件号', width: 180, visible: true }, { field: 'quantityText', title: '直接用量', width: 100, visible: true },
  { field: 'uom', title: '单位', width: 65, visible: true }, { field: 'modelText', title: '3D', width: 76, visible: true },
  { field: 'statusText', title: '数据状态', width: 106, visible: true }, { field: 'markets', title: '适用市场', width: 155, visible: true },
  { field: 'familyName', title: '系统分类', width: 150, visible: true }, { field: 'policy', title: '配置策略', width: 140, visible: true },
  { field: 'cb', title: 'CB · 装车', width: 160, visible: false }, { field: 'mb', title: 'MB · 制造', width: 160, visible: false }, { field: 'sb', title: 'SB · 售后', width: 160, visible: false },
  { field: 'count', title: '出现位置数', width: 100, visible: false }, { field: 'unitCost', title: '单位成本', width: 110, visible: false }, { field: 'sourceRef', title: '来源记录', width: 200, visible: false },
  { field: 'path', title: '完整使用路径', width: 400, visible: false }, { field: 'english', title: '英文名称', width: 220, visible: false }, { field: 'conflict', title: '来源冲突', width: 100, visible: false }, { field: 'quantityState', title: '用量状态', width: 110, visible: false }
];
@Component({ selector: 'bom2-grid', template: '<div #host class="grid-host" data-testid="bom-grid"></div>', styles: [':host {display:block;min-height:0;height:100%;} .grid-host {height:100%;width:100%;min-height:200px;}'] })
export class BomGrid implements AfterViewInit, OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private table: ListTable | null = null;
  private factory: typeof import('@visactor/vtable') | null = null;
  private records: GridRecord[] = [];
  private released = false;
  private suppressSelection = false;
  private observer: ResizeObserver | null = null;
  readonly result = input.required<QueryResult>();
  readonly mode = input<ViewMode>('tree');
  readonly compact = input(true);
  readonly columns = input(DEFAULT_COLUMNS);
  readonly selection = input<string | null>(null);
  readonly expanded = input<string[]>([]);
  readonly rowSelect = output<{ row: BomRow; additive: boolean }>();
  readonly enter = output<string>();
  readonly checked = output<{ key: string; checked: boolean }>();
  readonly expandedChange = output<string[]>();
  readonly columnWidths = output<{ field: string; width: number }[]>();

  constructor() {
    effect(() => { this.result(); this.mode(); this.compact(); this.columns(); this.expanded(); if (this.table) this.refresh(); });
    effect(() => { const selection = this.selection(); if (selection && this.table) queueMicrotask(() => this.locate(selection)); });
  }
  async ngAfterViewInit(): Promise<void> {
    this.factory = await import('@visactor/vtable');
    if (this.released) return;
    this.table = new this.factory.ListTable(this.host().nativeElement, this.options());
    this.bind();
    this.observer = new ResizeObserver(() => this.table?.resize()); this.observer.observe(this.host().nativeElement);
    this.refresh();
  }
  ngOnDestroy(): void { this.released = true; this.observer?.disconnect(); this.table?.release(); this.table = null; }
  expandTo(depth: number): void {
    const keys = this.result().rows.filter(r => r.depth < depth && r.hasChildren).map(r => r.key);
    this.expandedChange.emit(keys);
  }
  private options(): ListTableConstructorOptions {
    const tree = this.mode() === 'tree';
    const columns: ListTableConstructorOptions['columns'] = [
      { field: 'selected', title: '', width: 38, cellType: 'checkbox', headerType: 'text', checked: false },
      ...this.columns().filter(c => c.visible).map(c => ({ field: c.field, title: c.title, width: c.width, tree: c.field === 'name' && tree, sort: false, style: { color: c.field === 'partId' || c.field === 'compId' ? '#687384' : '#344054', fontFamily: c.field === 'partId' || c.field === 'compId' ? 'ui-monospace, monospace' : 'Inter, "PingFang SC", sans-serif', fontSize: 12, padding: [0, 12, 0, 12] } }))
    ];
    return { records: [], columns, widthMode: 'standard', heightMode: 'standard', defaultRowHeight: this.compact() ? 35 : 45, defaultHeaderRowHeight: 40, frozenColCount: 2, hierarchyIndent: 18, hierarchyExpandLevel: 1, autoFillWidth: false, enableCheckboxCascade: false, enableHeaderCheckboxCascade: false,
      keyboardOptions: { copySelected: true, moveFocusCellOnTab: true },
      tooltip: { renderMode: 'html', isShowOverflowTextTooltip: true },
      theme: { font: 'Inter, "PingFang SC", sans-serif', underlayBackgroundColor: '#fff', borderColor: '#eaecf0', defaultStyle: { fontSize: 12, color: '#344054', borderColor: '#edf0f3', borderLineWidth: [0, 0, 1, 0], bgColor: '#fff' }, headerStyle: { color: '#647084', fontSize: 11, fontWeight: 'normal', bgColor: '#f8f9fb', borderColor: '#e8ecf1', padding: [0, 12, 0, 12] }, bodyStyle: { hover: { cellBgColor: '#f3f1ff', inlineRowBgColor: '#f8f7ff' } }, selectionStyle: { cellBorderColor: '#8170d9', cellBorderLineWidth: 1, cellBgColor: 'rgba(111,89,210,0.06)' }, scrollStyle: { visible: 'scrolling', width: 7, scrollSliderColor: '#c7cbd3', scrollRailColor: '#f8f9fb' }, frozenColumnLine: { shadow: { width: 5, startColor: 'rgba(20,30,50,0.035)', endColor: 'rgba(20,30,50,0)' } } }
    };
  }
  private refresh(): void {
    if (!this.table) return;
    this.records = this.build(this.result().roots, new Set(this.expanded()));
    void this.table.updateOption({ ...this.options(), records: this.records }).then(() => { const selected = this.selection(); if (selected) this.locate(selected); });
  }
  private build(rows: BomRow[], expanded: Set<string>): GridRecord[] {
    return rows.map(row => {
      const record: GridRecord = { ...row, quantityText: row.quantity ?? '—', modelText: row.has3d ? '◈ 可用' : '—', statusText: row.conflict ? `冲突 ${row.conflict}` : row.quantityState === 'confirmed' ? '已确认' : row.quantityState === 'reference' ? '参考用量' : row.kind === 'system' ? '分类' : '用量待补' };
      const children = this.result().byParent.get(row.key);
      if (this.mode() !== 'tree' || !children?.length) return record;
      record.children = expanded.has(row.key) ? this.build(children, expanded) : true;
      record.hierarchyState = expanded.has(row.key) ? 'expand' : 'collapse';
      return record;
    });
  }
  private bind(): void {
    if (!this.table) return;
    this.table.on('click_cell', event => {
      if (event.row === 0 || event.col === 0) return;
      const row = this.record(event.col, event.row);
      if (row) this.rowSelect.emit({ row, additive: Boolean(event.event && 'ctrlKey' in event.event && (event.event.ctrlKey || event.event.metaKey)) });
    });
    this.table.on('dblclick_cell', event => { const row = this.record(event.col, event.row); if (row?.hasChildren) this.enter.emit(row.key); });
    this.table.on('checkbox_state_change', event => { const row = this.record(event.col, event.row); if (row) this.checked.emit({ key: row.key, checked: Boolean(event.checked) }); });
    this.table.on('tree_hierarchy_state_change', event => {
      const row = this.record(event.col, event.row);
      if (!row || !this.table) return;
      const record = event.originData as GridRecord;
      if (event.hierarchyState === 'expand' && !Array.isArray(record.children)) this.table.setRecordChildren(this.build(this.result().byParent.get(row.key) ?? [], new Set()), event.col, event.row, false);
    });
    this.table.on('selected_cell', event => { if (this.suppressSelection || event.row === 0) return; const row = this.record(event.col, event.row); if (row) this.rowSelect.emit({ row, additive: false }); });
    this.table.on('resize_column_end', () => {
      const widths = this.columns().filter(c => c.visible).map((c, i) => ({ field: c.field, width: this.table!.getColWidth(i + 1) }));
      this.columnWidths.emit(widths);
    });
    const label = this.host().nativeElement.querySelector('input, textarea');
    label?.setAttribute('aria-label', 'BOM 表格，方向键移动，双击进入装配');
  }
  private record(col: number, row: number): BomRow | null {
    const value: unknown = this.table?.getCellOriginRecord(col, row);
    return value && typeof value === 'object' && 'key' in value ? value as BomRow : null;
  }
  private locate(key: string): void {
    if (!this.table) return;
    const address = this.table.getCellAddress((record: unknown) => Boolean(record && typeof record === 'object' && 'key' in record && record.key === key), 'name');
    if (address.row < 1) return;
    this.suppressSelection = true;
    this.table.selectCell(address.col, address.row, false, false, true);
    this.suppressSelection = false;
  }
}
