import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';
import { LineList } from './line-list';

/**
 * where-used 反查面板：从子件出发向上反查全部父件与路径（含虚拟件路径），默认反查 M3 螺钉。
 * overview（验收面板）与 where-used（反查页）两处复用；testid：where-used-line。
 */
@Component({
  selector: 'bom-where-used-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LineList],
  template: `
    <section class="panel">
      <div class="panel-head">
        <h2>where-used 反查（US-510）</h2>
        <p class="panel-desc">从子件出发向上反查全部父件与路径（含虚拟件路径）；默认反查 M3 螺钉。</p>
      </div>
      <div class="toolbar">
        <label>
          反查物料
          <select [(ngModel)]="selectedItem" data-testid="where-used-select">
            @for (no of itemNos().values(); track no) {
              <option [value]="no">{{ no }}</option>
            }
          </select>
        </label>
        <button class="btn btn-primary" [disabled]="busy() || !ready()" (click)="runWhereUsed()">
          {{ busy() ? '处理中…' : '反查 ' + selectedItem() }}
        </button>
      </div>
      <bom-line-list [lines]="lines()" emptyText="点击「反查」查看全部父件与路径。" testId="where-used-line" />
    </section>
  `
})
export class WhereUsedPanel {
  private readonly service = inject(BomDemoService);

  readonly asOfDate = input.required<string>();
  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly selectedItem = signal('M3');
  readonly lines = signal<string[]>([]);
  readonly busy = signal(false);

  constructor() {
    // 重置种子（ready 翻转为真）后清空反查结果（旧路径对新种子无意义）
    effect(() => {
      if (this.service.ready()) {
        this.lines.set([]);
      }
    });
  }

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  /** 反查（AC#6：M3 螺钉的全部父件与路径，含虚拟件路径）。 */
  async runWhereUsed(): Promise<void> {
    this.busy.set(true);
    try {
      const result = await this.service.whereUsed(this.asOfDate(), this.itemIdOf(this.selectedItem()));
      this.lines.set(
        result.nodes.map(
          node => `${node.path.length} 跳：${node.path.slice(0, 8).join(' → ')}（${this.itemNo(node.itemId)}）`
        )
      );
    } catch (error) {
      this.lines.set([String(error)]);
    } finally {
      this.busy.set(false);
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
