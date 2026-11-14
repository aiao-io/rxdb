import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  untracked,
  viewChild
} from '@angular/core';
import type { ListTable, ListTableConstructorOptions } from '@visactor/vtable';
import { RowWindows } from '../core/row-window';
import type { BomRow, QueryResult, ViewMode } from '../core/types';
interface GridRecord extends BomRow {
  pageParent?: string | null;
  children?: GridRecord[] | true;
  hierarchyState?: 'expand' | 'collapse';
  selected?: boolean;
  quantityText: string;
  modelText: string;
  statusText: string;
}
export interface GridColumn {
  field: string;
  title: string;
  width: number;
  visible: boolean;
}
export const DEFAULT_COLUMNS: GridColumn[] = [
  { field: 'name', title: '零件 / 装配名称', width: 276, visible: true },
  { field: 'partId', title: 'GID / 物料编码', width: 136, visible: true },
  { field: 'compId', title: '变体件号', width: 180, visible: true },
  { field: 'quantityText', title: '直接用量', width: 100, visible: true },
  { field: 'uom', title: '单位', width: 65, visible: true },
  { field: 'modelText', title: '3D', width: 76, visible: true },
  { field: 'statusText', title: '数据状态', width: 106, visible: true },
  { field: 'markets', title: '适用市场', width: 155, visible: true },
  { field: 'familyName', title: '系统分类', width: 150, visible: true },
  { field: 'policy', title: '配置策略', width: 140, visible: true },
  { field: 'cb', title: 'CB · 装车', width: 160, visible: true },
  { field: 'mb', title: 'MB · 制造', width: 160, visible: true },
  { field: 'sb', title: 'SB · 售后', width: 160, visible: true },
  { field: 'count', title: '出现位置数', width: 100, visible: true },
  { field: 'unitCost', title: '单位成本', width: 110, visible: true },
  { field: 'sourceRef', title: '来源记录', width: 200, visible: true },
  { field: 'path', title: '完整使用路径', width: 400, visible: true },
  { field: 'english', title: '英文名称', width: 220, visible: true },
  { field: 'conflict', title: '来源冲突', width: 100, visible: true },
  { field: 'quantityState', title: '用量状态', width: 110, visible: true }
];
@Component({
  selector: 'bom2-grid',
  template:
    '<div #host class="grid-host" data-testid="bom-grid" [attr.data-row-count]="result().rows.length" [attr.data-query]="queryKey()"></div>',
  styles: [':host {display:block;min-height:0;height:100%;} .grid-host {height:100%;width:100%;min-height:150px;}']
})
export class BomGrid implements AfterViewInit, OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private table: ListTable | null = null;
  private factory: typeof import('@visactor/vtable') | null = null;
  private released = false;
  private suppressSelection = false;
  private observer: ResizeObserver | null = null;
  private generation = 0;
  private additive = false;
  private expandedKeys = new Set<string>();
  private readonly pageLimits = new Map<string | null, number>();
  private readonly positions = new Map<string, number>();
  private windows: RowWindows<BomRow, GridRecord> | null = null;
  private previousResult: QueryResult | null = null;
  private renderedMode: ViewMode | null = null;
  private updating = false;
  readonly result = input.required<QueryResult>();
  readonly queryKey = input('');
  readonly mode = input<ViewMode>('tree');
  readonly compact = input(true);
  readonly columns = input(DEFAULT_COLUMNS);
  readonly selection = input<string | null>(null);
  readonly expanded = input<string[]>([]);
  readonly checkedKeys = input<Set<string>>(new Set());
  readonly rowSelect = output<{ row: BomRow; additive: boolean }>();
  readonly enter = output<string>();
  readonly checked = output<{ key: string; checked: boolean; members?: string[] }>();
  readonly expandedChange = output<string[]>();
  readonly columnWidths = output<{ field: string; width: number }[]>();
  readonly scrollMetrics = output<{ width: number; viewport: number; left: number }>();

  constructor() {
    effect(() => {
      this.result();
      this.mode();
      this.compact();
      this.columns();
      untracked(() => {
        if (this.table) this.refresh();
      });
    });
    effect(() => {
      const keys = this.expanded();
      if (keys.length === this.expandedKeys.size && keys.every(key => this.expandedKeys.has(key))) return;
      this.expandedKeys = new Set(keys);
      untracked(() => {
        if (this.table) this.refresh();
      });
    });
    effect(() => {
      const selection = this.selection();
      untracked(() => {
        if (selection && this.table) queueMicrotask(() => this.locate(selection));
      });
    });
    effect(() => {
      const keys = this.checkedKeys();
      untracked(() => this.syncChecks(keys));
    });
  }
  async ngAfterViewInit(): Promise<void> {
    this.factory = await import('@visactor/vtable');
    if (this.released) return;
    this.table = new this.factory.ListTable(this.host().nativeElement, this.options());
    this.bind();
    this.host().nativeElement.addEventListener('pointerdown', this.capturePointer, true);
    this.observer = new ResizeObserver(() => {
      this.table?.resize();
      this.reportScrollMetrics();
    });
    this.observer.observe(this.host().nativeElement);
    this.refresh();
  }
  ngOnDestroy(): void {
    this.released = true;
    this.generation++;
    this.observer?.disconnect();
    this.host().nativeElement.removeEventListener('pointerdown', this.capturePointer, true);
    this.table?.release();
    this.table = null;
    this.windows = null;
  }
  expandTo(depth: number): void {
    const base = this.result().roots[0]?.depth ?? 0;
    this.expandedChange.emit(
      this.result()
        .rows.filter(r => r.depth - base < depth && r.hasChildren)
        .map(r => r.key)
    );
  }
  setHorizontalScroll(left: number): void {
    this.table?.setScrollLeft(left);
  }
  private readonly capturePointer = (event: PointerEvent): void => {
    this.additive = event.ctrlKey || event.metaKey;
  };
  private options(): ListTableConstructorOptions {
    const tree = this.mode() === 'tree';
    const columns: ListTableConstructorOptions['columns'] = [
      { field: 'selected', title: '', width: 38, cellType: 'checkbox', headerType: 'text' },
      ...this.columns()
        .filter(c => c.visible)
        .map(c => ({
          field: c.field,
          title: c.title,
          width: c.width,
          tree: c.field === 'name' && tree,
          sort: false,
          style: {
            color: c.field === 'partId' || c.field === 'compId' ? '#687384' : '#344054',
            fontFamily:
              c.field === 'partId' || c.field === 'compId' ?
                'ui-monospace, monospace'
              : 'Inter, "PingFang SC", sans-serif',
            fontSize: 12,
            padding: [0, 12, 0, 12]
          }
        }))
    ];
    return {
      records: [],
      columns,
      widthMode: 'standard',
      heightMode: 'standard',
      defaultRowHeight: this.compact() ? 35 : 45,
      defaultHeaderRowHeight: 40,
      frozenColCount: 2,
      hierarchyIndent: 18,
      hierarchyExpandLevel: 1,
      autoFillWidth: false,
      enableCheckboxCascade: false,
      enableHeaderCheckboxCascade: false,
      keyboardOptions: { copySelected: true, moveFocusCellOnTab: true },
      tooltip: { renderMode: 'html', isShowOverflowTextTooltip: true },
      theme: {
        underlayBackgroundColor: '#fff',
        defaultStyle: {
          fontSize: 12,
          color: '#344054',
          borderColor: '#edf0f3',
          borderLineWidth: [0, 0, 1, 0],
          bgColor: '#fff'
        },
        headerStyle: {
          color: '#647084',
          fontSize: 11,
          fontWeight: 'normal',
          bgColor: '#f8f9fb',
          borderColor: '#e8ecf1',
          padding: [0, 12, 0, 12]
        },
        bodyStyle: { hover: { cellBgColor: '#edf5f1', inlineRowBgColor: '#f6faf8' } },
        selectionStyle: { cellBorderColor: '#27846c', cellBorderLineWidth: 1, cellBgColor: 'rgba(8,123,105,0.06)' },
        scrollStyle: {
          visible: 'always',
          horizontalVisible: 'none',
          width: 7,
          scrollSliderColor: '#c7cbd3',
          scrollRailColor: '#f8f9fb'
        },
        frozenColumnLine: { shadow: { width: 5, startColor: 'rgba(20,30,50,0.035)', endColor: 'rgba(20,30,50,0)' } }
      }
    };
  }
  private refresh(preserveScroll = false): void {
    if (!this.table || !this.factory) return;
    const scroll = preserveScroll ? { top: this.table.scrollTop, left: this.table.scrollLeft } : null;
    const generation = ++this.generation;
    this.updating = true;
    this.host().nativeElement.setAttribute('aria-busy', 'true');
    this.renderedMode = this.mode();
    if (this.previousResult !== this.result()) {
      this.pageLimits.clear();
      this.previousResult = this.result();
    }
    this.positions.clear();
    this.result().roots.forEach((row, index) => this.positions.set(row.key, index));
    const options = this.options();
    if (this.mode() === 'tree') {
      this.windows = null;
      options.records = this.build(this.result().roots, null);
    } else {
      const windows = new RowWindows(this.result().roots, row => this.project(row));
      this.windows = windows;
      delete options.records;
      options.dataSource = new this.factory.data.DataSource({
        length: this.result().roots.length,
        get: index => windows.get(index)
      });
    }
    void this.table.updateOption(options).then(() => {
      if (this.released || generation !== this.generation) return;
      const selected = this.selection();
      if (selected) this.locate(selected);
      if (scroll) {
        this.table!.scrollTop = scroll.top;
        this.table!.scrollLeft = scroll.left;
      }
      this.updating = false;
      this.host().nativeElement.setAttribute('aria-busy', 'false');
      this.host().nativeElement.dataset['renderedMode'] = this.renderedMode!;
      this.host().nativeElement.dataset['renderedQuery'] = this.queryKey();
      this.reportWindows();
      this.reportScrollMetrics();
    });
  }
  private project(row: BomRow): GridRecord {
    return {
      ...row,
      selected: row.members ? row.members.every(key => this.checkedKeys().has(key)) : this.checkedKeys().has(row.key),
      quantityText: row.quantity ?? '—',
      modelText: row.has3d ? '◈ 可用' : '—',
      statusText:
        row.conflict ? `冲突 ${row.conflict}`
        : row.quantityState === 'confirmed' ? '已确认'
        : row.quantityState === 'reference' ? '参考用量'
        : row.kind === 'system' ? '分类'
        : '用量待补'
    };
  }
  private build(rows: BomRow[], parent: string | null): GridRecord[] {
    const limit = this.pageLimits.get(parent) ?? 500;
    const records = rows.slice(0, limit).map(row => {
      const record = this.project(row);
      const children = this.result().byParent.get(row.key);
      if (!children?.length) return record;
      record.children = this.expandedKeys.has(row.key) ? this.build(children, row.key) : true;
      record.hierarchyState = this.expandedKeys.has(row.key) ? 'expand' : 'collapse';
      return record;
    });
    if (rows.length > limit)
      records.push({
        ...this.project(rows[limit]),
        key: `__page:${parent}:${limit}`,
        pageParent: parent,
        name: `加载后续 ${Math.min(500, rows.length - limit)} 项（已载入 ${limit} / ${rows.length}）`,
        partId: '',
        compId: '',
        quantityText: '',
        statusText: '',
        modelText: '',
        markets: '',
        hasChildren: false
      });
    return records;
  }
  private bind(): void {
    if (!this.table) return;
    this.table.on('click_cell', event => {
      if (event.row === 0) return;
      const record = this.raw(event.col, event.row);
      if (record?.pageParent !== undefined) {
        this.more(record.pageParent);
        return;
      }
      if (!record || event.col === 0) return;
      this.rowSelect.emit({
        row: record,
        additive: Boolean(event.event && 'ctrlKey' in event.event && (event.event.ctrlKey || event.event.metaKey))
      });
    });
    this.table.on('dblclick_cell', event => {
      const row = this.raw(event.col, event.row);
      if (row?.hasChildren && row.pageParent === undefined) this.enter.emit(row.key);
    });
    this.table.on('checkbox_state_change', event => {
      const row = this.raw(event.col, event.row);
      if (row && row.pageParent === undefined)
        this.checked.emit({ key: row.key, members: row.members, checked: Boolean(event.checked) });
    });
    this.table.on('tree_hierarchy_state_change', event => {
      const record = this.raw(event.col, event.row);
      if (!record || !this.table) return;
      if (event.hierarchyState === 'expand') this.expandedKeys.add(record.key);
      else this.expandedKeys.delete(record.key);
      if (event.hierarchyState === 'expand' && !Array.isArray(record.children))
        this.table.setRecordChildren(
          this.build(this.result().byParent.get(record.key) ?? [], record.key),
          event.col,
          event.row,
          false
        );
      this.expandedChange.emit([...this.expandedKeys]);
      this.reportWindows();
    });
    this.table.on('selected_cell', event => {
      if (this.suppressSelection || event.row === 0 || event.col === 0) return;
      const row = this.raw(event.col, event.row);
      if (row && row.pageParent === undefined) this.rowSelect.emit({ row, additive: this.additive });
    });
    this.table.on('resize_column_end', () =>
      {
        this.columnWidths.emit(
          this.columns()
            .filter(c => c.visible)
            .map((c, i) => ({ field: c.field, width: this.table!.getColWidth(i + 1) }))
        );
        this.reportScrollMetrics();
      }
    );
    this.table.on('scroll', () => {
      this.reportWindows();
      this.reportScrollMetrics();
    });
    this.table.on('keydown', event => {
      this.additive = event.event.ctrlKey || event.event.metaKey;
    });
    this.table.on('after_render', () => {
      if (
        performance.getEntriesByName('bom2:data-ready').length &&
        !performance.getEntriesByName('bom2:first-interactive').length
      ) {
        const first = performance.measure('bom2:first-interactive', 'bom2:data-ready');
        this.host().nativeElement.dataset['firstInteractiveMs'] = String(first.duration);
      }
      this.host().nativeElement.dataset['renderId'] = String(this.generation);
      if (performance.getEntriesByName('bom2:interaction-start').length) {
        const measure = performance.measure('bom2:interaction', 'bom2:interaction-start');
        this.host().nativeElement.dataset['interactionMs'] = String(measure.duration);
        performance.clearMarks('bom2:interaction-start');
        performance.clearMeasures('bom2:interaction');
      }
      this.reportScrollMetrics();
    });
    this.host()
      .nativeElement.querySelector('input,textarea')
      ?.setAttribute('aria-label', 'BOM 表格，方向键移动，双击进入装配');
  }
  private raw(col: number, row: number): GridRecord | null {
    if (this.updating || this.previousResult !== this.result() || this.renderedMode !== this.mode()) return null;
    const value: unknown = this.table?.getCellOriginRecord(col, row);
    return value && typeof value === 'object' && 'key' in value ? (value as GridRecord) : null;
  }
  private more(parent: string | null): void {
    this.pageLimits.set(parent, (this.pageLimits.get(parent) ?? 500) + 500);
    this.refresh(true);
  }
  private address(key: string): { col: number; row: number } | null {
    if (!this.table) return null;
    if (this.mode() !== 'tree') {
      const index = this.positions.get(key);
      return index === undefined ? null : { col: 1, row: index + 1 };
    }
    return this.table.getCellAddress(
      (record: unknown) => Boolean(record && typeof record === 'object' && 'key' in record && record.key === key),
      'name'
    );
  }
  private locate(key: string): void {
    if (!this.table) return;
    const address = this.address(key);
    if (!address || address.row < 1) return;
    this.suppressSelection = true;
    try {
      this.table.selectCell(address.col, address.row, false, false, true);
    } finally {
      this.suppressSelection = false;
    }
  }
  private syncChecks(keys: Set<string>): void {
    this.windows?.forEach(record => {
      record.selected = record.members ? record.members.every(key => keys.has(key)) : keys.has(record.key);
    });
    if (!this.table) return;
    const range = this.table.getBodyVisibleCellRange();
    for (let row = range.rowStart; row <= range.rowEnd; row++) {
      const record = this.raw(0, row);
      if (record)
        this.table.setCellCheckboxState(
          0,
          row,
          record.members ? record.members.every(key => keys.has(key)) : keys.has(record.key)
        );
    }
  }
  private reportWindows(): void {
    this.host().nativeElement.dataset['windowRecords'] = String(this.windows?.size ?? this.table?.rowCount ?? 0);
  }
  private reportScrollMetrics(): void {
    if (!this.table) return;
    this.scrollMetrics.emit({
      width: this.table.getAllColsWidth(),
      viewport: this.host().nativeElement.clientWidth,
      left: this.table.scrollLeft
    });
  }
}
