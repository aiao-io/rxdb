import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BomDemoService } from '../../bom-demo.service';
import { ExtPanel } from '../../components/ext-panel';

/** 物料概览：种子状态、物料清单与扩展属性；专项操作由各自页面承载。 */
@Component({
  selector: 'bom-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ExtPanel],
  templateUrl: './overview.page.html',
  styles: [
    `
      .inventory {
        margin-top: var(--space-4);
        border-top: 1px solid var(--color-border);
      }

      .inventory summary {
        padding: var(--space-3) 0;
        color: var(--color-text-secondary);
        font-weight: 600;
        cursor: pointer;
      }

      .inventory-scroll {
        max-height: 320px;
        overflow: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }

      .inventory table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }

      .inventory th,
      .inventory td {
        padding: var(--space-2) var(--space-3);
        border-bottom: 1px solid var(--color-border);
      }

      .inventory th {
        position: sticky;
        top: 0;
        background: var(--color-surface-alt);
        color: var(--color-text-secondary);
        font-size: 12px;
      }

      .inventory tbody tr:hover {
        background: var(--color-hover);
      }

      .inventory .item-index {
        width: 48px;
        color: var(--color-text-muted);
        font-variant-numeric: tabular-nums;
      }
    `
  ]
})
export class OverviewPage {
  private readonly service = inject(BomDemoService);

  readonly itemNos = this.service.itemNos;
  readonly inventory = computed(() => [...this.itemNos().values()].sort());
  readonly seedBatchNo = this.service.seedBatchNo;
  readonly seedTimestamp = this.service.seedTimestamp;
  readonly rowCounts = signal('');
  readonly busy = signal(false);

  /** 重置并装载种子（AC#1 的两遍 seed 入口），随后回读行数面板。 */
  async resetAndSeed(): Promise<void> {
    this.busy.set(true);
    try {
      await this.service.resetAndSeed();
      this.rowCounts.set(await this.service.dumpRowCounts());
    } finally {
      this.busy.set(false);
    }
  }
}
