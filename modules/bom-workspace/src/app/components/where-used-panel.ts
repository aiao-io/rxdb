import type { ExpansionResult } from '@aiao/rxdb-plugin-bom';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';
import { BomWorkspaceState } from '../bom-workspace-state';
import { itemLabelById, itemNoById, materialLabel } from '../presentation/material-label';
import { buildWhereUsedTree } from '../presentation/where-used-tree';

/**
 * where-used 反查面板：从子件出发向上反查全部父件与路径（含虚拟件路径），默认反查 M3 螺钉。
 * overview（验收面板）与 where-used（反查页）两处复用；testid：where-used-line。
 */
@Component({
  selector: 'bom-where-used-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './where-used-panel.html',
  styleUrl: './where-used-panel.scss'
})
export class WhereUsedPanel {
  private readonly service = inject(BomDemoService);
  private readonly workspace = inject(BomWorkspaceState);
  private request = 0;

  readonly asOfDate = input.required<string>();
  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly materialLabel = materialLabel;
  readonly selectedItem = this.workspace.selectedItem;
  readonly result = signal<ExpansionResult | null>(null);
  readonly queried = signal<{ item: string; date: string } | null>(null);
  readonly error = signal('');
  readonly tree = computed(() => buildWhereUsedTree(this.result()?.nodes ?? []));
  readonly collapsed = signal(new Set<string>());
  readonly expandableKeys = computed(() => {
    const pending = [...this.tree()];
    const keys: string[] = [];
    while (pending.length > 0) {
      const branch = pending.pop()!;
      if (branch.children.length === 0) continue;
      keys.push(branch.key);
      pending.push(...branch.children);
    }
    return keys;
  });
  readonly parentCount = computed(() => new Set(this.result()?.nodes.map(node => node.itemId)).size);
  readonly busy = signal(false);
  readonly stale = computed(() => {
    const query = this.queried();
    return query !== null && (query.item !== this.selectedItem() || query.date !== this.asOfDate());
  });

  constructor() {
    effect(() => {
      this.service.dataEpoch();
      this.service.ready();
      this.service.resetting();
      this.request += 1;
      this.result.set(null);
      this.queried.set(null);
      this.error.set('');
      this.busy.set(false);
      this.expandAll();
    });
  }

  itemNo(itemId: string): string {
    return itemNoById(this.itemNos(), itemId);
  }

  itemLabel(itemId: string): string {
    return itemLabelById(this.itemNos(), itemId);
  }

  toggleBranch(key: string): void {
    const next = new Set(this.collapsed());
    if (!next.delete(key)) next.add(key);
    this.collapsed.set(next);
  }

  expandAll(): void {
    this.collapsed.set(new Set());
  }

  collapseAll(): void {
    this.collapsed.set(new Set(this.expandableKeys()));
  }

  branchId(path: string[]): string {
    return `usage-${path.join('_')}`;
  }

  /** 反查（AC#6：M3 螺钉的全部父件与路径，含虚拟件路径）。 */
  async runWhereUsed(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    const epoch = this.service.dataEpoch();
    const request = ++this.request;
    const current = () =>
      request === this.request && epoch === this.service.dataEpoch() && this.ready() && !this.service.resetting();
    this.busy.set(true);
    this.error.set('');
    this.result.set(null);
    this.expandAll();
    const query = { item: this.selectedItem(), date: this.asOfDate() };
    this.queried.set(query);
    try {
      const result = await this.service.whereUsed(query.date, this.itemIdOf(query.item));
      if (current()) this.result.set(result);
    } catch (error) {
      if (current()) this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** itemNo → itemId 反查（下拉选项来自 itemNos，反查必然命中；不命中即种子异常，直接抛出）。 */
  private itemIdOf(itemNo: string): string {
    for (const [id, no] of this.itemNos().entries()) {
      if (no === itemNo) return id;
    }
    throw new Error(`物料不在种子清单：${itemNo}`);
  }
}
