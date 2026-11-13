import { AfterViewInit, Component, ElementRef, OnDestroy, effect, computed, untracked, input, output, signal, viewChild } from '@angular/core';
import type { ModelViewport } from '../core/model-viewport';
import type { BomDataset, BomRow, Part, Market } from '../core/types';
import { Icon } from './icon';
@Component({ selector: 'bom2-model-panel', imports: [Icon], templateUrl: './model-panel.html', styleUrl: './model-panel.scss' })
export class ModelPanel implements AfterViewInit, OnDestroy {
  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');
  private viewport: ModelViewport | null = null;
  private ready = false;
  private destroyed = false;
  private loadId = 0;
  readonly dataset = input.required<BomDataset>();
  readonly market = input<Market | ''>('');
  readonly closed = output<void>();
  readonly selected = input<BomRow | null>(null);
  readonly part = input<Part | null>(null);
  readonly picked = output<{ nodeIndex: number; partId: string }>();
  readonly maximize = output<void>();
  readonly assetId = signal('');
  readonly mode = signal<'vehicle' | 'part'>('vehicle');
  readonly activeAsset = computed(() => {
    const assets = this.part()?.assets ?? [];
    return assets.find(item => item.id === this.assetId()) ?? assets.find(item => item.variants.includes(this.selected()?.compId ?? '')) ?? assets[0];
  });
  readonly loading = signal(true);
  readonly progress = signal('准备模型…');
  readonly error = signal('');
  readonly mapping = signal('EU 参考模型');
  readonly isolated = signal(false);
  readonly ghosted = signal(false);
  readonly nodes = signal(0);

  constructor() {
    effect(() => { this.dataset(); if (this.mode() === 'part') this.activeAsset(); if (this.ready) untracked(() => { void this.load(); }); });
    effect(() => { const row = this.selected(); if (this.mode() === 'vehicle' && this.viewport && !this.loading()) this.applySelection(row); });
  }
  ngAfterViewInit(): void { this.ready = true; void this.load(); }
  ngOnDestroy(): void { this.destroyed = true; this.loadId++; this.viewport?.dispose(); }
  async load(): Promise<void> {
    const id = ++this.loadId;
    const url = this.mode() === 'part' ? this.activeAsset()?.url : this.dataset().vehicle.url;
    this.loading.set(true); this.error.set(''); this.nodes.set(0); this.progress.set('正在读取模型…');
    if (!url) { this.loading.set(false); this.error.set(this.mode() === 'part' ? '当前零件没有独立模型，可切换整车查看关联节点。' : '此数据集未关联整车模型。'); return; }
    try {
      if (!this.viewport) {
        const { ModelViewport } = await import('../core/model-viewport');
        if (this.destroyed || id !== this.loadId) return;
        this.viewport = new ModelViewport(this.canvasHost().nativeElement, {
          progress: (loaded, total) => this.progress.set(total ? `下载 ${Math.round(loaded / total * 100)}% · ${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : `已下载 ${(loaded / 1048576).toFixed(1)} MB`),
          ready: nodes => { this.nodes.set(nodes); this.progress.set(''); },
          selected: identity => this.picked.emit({ nodeIndex: identity.index, partId: identity.partId })
        });
      }
      await this.viewport.load(url, this.mode() === 'part');
      if (id !== this.loadId || this.destroyed) return;
      this.loading.set(false); this.isolated.set(false); this.ghosted.set(false);
      if (this.mode() === 'vehicle') this.applySelection(this.selected());
      else this.mapping.set('独立零件视图 · 未用于整车装配定位');
    } catch (error) { if (id === this.loadId && !this.destroyed) { this.loading.set(false); this.error.set(`3D 加载失败：${String(error)}`); } }
  }
  chooseAsset(event: Event): void { this.assetId.set((event.target as HTMLSelectElement).value); }
  focus(): void { this.viewport?.focus(); }
  fit(): void { this.viewport?.fit(); }
  view(direction: 'front' | 'side' | 'top' | 'iso'): void { this.viewport?.view(direction); }
  toggleIsolate(): void { this.isolated.update(v => !v); this.viewport?.isolate(this.isolated()); }
  toggleGhost(): void { this.ghosted.update(v => !v); this.viewport?.ghost(this.ghosted()); }
  reset(): void { this.isolated.set(false); this.ghosted.set(false); this.viewport?.reset(); this.applySelection(this.selected()); }
  cancel(): void { this.loadId++; this.viewport?.cancel(); this.loading.set(false); this.error.set('模型加载已取消，可重新加载。'); }
  private applySelection(row: BomRow | null): void {
    const result = this.viewport?.select(row);
    if (!result || !row) return;
    const labels: Record<string, string> = { occurrence: '具体模型位置', variant: '完整件号匹配', group: 'Group 级参考', system: '系统范围', none: '整车中未找到关联节点' };
    this.mapping.set(`${labels[result.level]}${result.count ? ` · ${result.count} 个几何节点` : ''}`);
  }
}
