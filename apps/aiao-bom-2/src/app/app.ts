import { DecimalPipe } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { BomGrid, DEFAULT_COLUMNS, type GridColumn } from './components/bom-grid';
import { Icon } from './components/icon';
import { ModelPanel } from './components/model-panel';
import { WorkspaceDialogs } from './components/workspace-dialogs';
import type { Market, QuerySpec, Structure, ViewMode } from './core/types';
import { BomWorkspace } from './core/workspace';

@Component({
  selector: 'bom2-workbench',
  imports: [DecimalPipe, BomGrid, ModelPanel, Icon, WorkspaceDialogs],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(window:keydown)': 'keyboard($event)' }
})
export class App implements OnInit, OnDestroy {
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly ws = inject(BomWorkspace);
  readonly grid = viewChild(BomGrid);
  readonly gridScrollbar = viewChild<ElementRef<HTMLElement>>('gridScrollbar');
  readonly dialogs = viewChild.required(WorkspaceDialogs);
  readonly columns = signal<GridColumn[]>(this.restoreColumns());
  readonly columnsOpen = signal(false);
  readonly navSearch = signal('');
  readonly gridScrollWidth = signal(0);
  readonly gridViewportWidth = signal(0);
  readonly detailTab = signal<'properties' | 'usage' | 'source'>('properties');
  readonly modelLarge = signal(false);
  readonly panelWidth = signal(Number(localStorage.getItem('bom2:panel-width')) || 366);
  readonly navItems = computed(() =>
    this.ws.roots().filter(r => `${r.name} ${r.partId}`.toLowerCase().includes(this.navSearch().toLowerCase()))
  );
  readonly usages = computed(() => {
    const partId = this.ws.selected()?.partId;
    return partId ? [...(this.ws.index()?.rows.values() ?? [])].filter(r => r.partId === partId) : [];
  });
  readonly specs = computed(() => Object.entries(this.ws.part()?.specs ?? {}));
  readonly structures: Structure[] = ['catalog', 'purchase', 'cad', 'draft'];
  readonly structureNames: Record<Structure, string> = {
    catalog: '系统分类',
    purchase: '采购层级',
    cad: 'CAD 场景',
    draft: '工作草稿'
  };

  ngOnInit(): void {
    void this.ws.initialize();
  }
  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }
  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  search(value: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.ws.updateQuery({ search: value }), 180);
  }
  structure(value: string): void {
    this.ws.changeStructure(value as Structure);
  }
  market(value: string): void {
    this.ws.updateQuery({ market: value as Market | '' });
  }
  mode(value: ViewMode): void {
    this.ws.updateQuery({ mode: value });
  }
  issue(value: string): void {
    this.ws.updateQuery({ issue: value as QuerySpec['issue'] });
  }
  sort(value: string): void {
    this.ws.updateQuery({ sort: value as QuerySpec['sort'] });
  }
  gridMetrics(metrics: { width: number; viewport: number; left: number }): void {
    this.gridScrollWidth.set(metrics.width);
    this.gridViewportWidth.set(metrics.viewport);
    const scrollbar = this.gridScrollbar()?.nativeElement;
    if (scrollbar && Math.abs(scrollbar.scrollLeft - metrics.left) > 1) scrollbar.scrollLeft = metrics.left;
  }
  scrollGrid(event: Event): void {
    this.grid()?.setHorizontalScroll((event.target as HTMLElement).scrollLeft);
  }
  checked(event: { key: string; checked: boolean; members?: string[] }): void {
    this.ws.selectedKeys.update(keys => {
      const next = new Set(keys);
      for (const key of event.members ?? [event.key]) {
        if (event.checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }
  toggleColumn(field: string): void {
    this.columns.update(columns => columns.map(c => (c.field === field ? { ...c, visible: !c.visible } : c)));
    this.saveColumns();
  }
  widths(widths: { field: string; width: number }[]): void {
    const saved = new Map(widths.map(c => [c.field, c.width]));
    const next = this.columns().map(c => ({ ...c, width: saved.get(c.field) ?? c.width }));
    localStorage.setItem('bom2:columns', JSON.stringify(next));
  }
  resizePanel(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement;
    const start = event.clientX;
    const width = this.panelWidth();
    target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) =>
      this.panelWidth.set(Math.max(300, Math.min(720, width + start - next.clientX)));
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      localStorage.setItem('bom2:panel-width', String(this.panelWidth()));
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end, { once: true });
  }
  keyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.matches('input,textarea,select') || target.closest('dialog[open]')) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === 'z' && this.ws.query().structure === 'draft') {
      event.preventDefault();
      if (event.shiftKey) this.ws.redo();
      else this.ws.undo();
    }
    if (modifier && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      document.getElementById('bom-search')?.focus();
    }
    if (event.key === 'Escape') {
      this.columnsOpen.set(false);
      this.modelLarge.set(false);
    }
  }
  private saveColumns(): void {
    localStorage.setItem('bom2:columns', JSON.stringify(this.columns()));
  }
  private restoreColumns(): GridColumn[] {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem('bom2:columns') ?? 'null');
      if (!Array.isArray(raw)) return DEFAULT_COLUMNS;
      return DEFAULT_COLUMNS.map(column => {
        const item = raw.find(
          (v: unknown) => typeof v === 'object' && v !== null && 'field' in v && v.field === column.field
        ) as Partial<GridColumn> | undefined;
        return {
          ...column,
          visible: typeof item?.visible === 'boolean' ? item.visible : column.visible,
          width: typeof item?.width === 'number' ? Math.max(60, Math.min(600, item.width)) : column.width
        };
      });
    } catch {
      return DEFAULT_COLUMNS;
    }
  }
}
