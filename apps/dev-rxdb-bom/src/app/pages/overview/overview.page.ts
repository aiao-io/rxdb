import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BomDemoService } from '../../bom-demo.service';
import { BomWorkspaceState } from '../../bom-workspace-state';
import { ExtPanel } from '../../components/ext-panel';
import { materialName } from '../../presentation/material-label';

/** 从真实已有数据进入物料和六个业务场景。 */
@Component({
  selector: 'bom-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ExtPanel, FormsModule, RouterLink],
  templateUrl: './overview.page.html',
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .inventory-scroll {
        max-height: 420px;
      }

      .inventory-toolbar {
        margin-bottom: 18px;
      }

      .inventory-toolbar label {
        flex: 1 1 240px;
      }

      .item-index {
        width: 64px;
        color: var(--color-text-muted);
        font-variant-numeric: tabular-nums;
      }

      .material-name {
        min-width: 160px;
        font-weight: 600;
      }

      .material-code {
        color: var(--color-text-secondary);
      }

      .data-table th {
        position: sticky;
        top: 0;
      }

      .scenario-number {
        color: var(--color-primary);
        font-size: 12px;
        font-weight: 700;
      }

      .scenario-card h3 {
        margin-top: 8px;
      }

      pre {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      @media (max-width: 640px) {
        .summary-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .metric-card {
          padding: 12px 10px;
        }

        .metric-label {
          font-size: 11px;
        }

        .metric-value {
          font-size: 24px;
        }

        .metric-note {
          display: none;
        }
      }
    `
  ]
})
export class OverviewPage {
  private readonly service = inject(BomDemoService);
  private readonly router = inject(Router);
  private readonly statisticsRevision = signal(0);
  readonly workspace = inject(BomWorkspaceState);

  readonly ready = this.service.ready;
  readonly resetting = this.service.resetting;
  readonly itemNos = this.service.itemNos;
  readonly itemCount = this.service.itemCount;
  readonly changeCount = computed(() => this.service.ecns().size);
  readonly instanceCount = computed(() => this.service.instanceRoots().length);
  readonly inventory = computed(() => [...this.itemNos().values()].sort());
  readonly materialName = materialName;
  readonly filter = signal('');
  readonly filteredInventory = computed(() => {
    const query = this.filter().trim().toLowerCase();
    return this.inventory().filter(itemNo => `${materialName(itemNo)} ${itemNo}`.toLowerCase().includes(query));
  });
  readonly seedBatchNo = this.service.seedBatchNo;
  readonly seedTimestamp = this.service.seedTimestamp;
  readonly rowCounts = signal('');
  readonly statisticsLoading = signal(false);
  readonly statisticsError = signal('');
  readonly resetError = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly scenarios = [
    { path: '/explosion', title: '整机展开', description: '按计划量查看所需物料，逐行了解用量的计算过程。' },
    { path: '/timeline', title: '变更时间轴', description: '选择生效日期，比较工程变更前后的结构。' },
    { path: '/mapping', title: '双图映射', description: '对照设计与生产结构，检查覆盖情况和映射缺口。' },
    { path: '/cost', title: '成本卷算', description: '查看材料、加工与费用，以及多产品的成本分配。' },
    { path: '/where-used', title: '反查影响范围', description: '找到物料被哪些装配使用，了解修改会影响哪里。' },
    { path: '/instances', title: '实例追溯', description: '查看某台整机的安装结构与换件记录。' }
  ];

  constructor() {
    effect(onCleanup => {
      this.statisticsRevision();
      const canRead = this.ready() && this.itemCount() > 0;
      let current = true;
      onCleanup(() => {
        current = false;
      });
      this.rowCounts.set('');
      this.statisticsError.set('');
      this.statisticsLoading.set(canRead);
      if (!canRead) return;
      void this.service.dumpRowCounts().then(
        counts => {
          if (!current) return;
          this.rowCounts.set(counts);
          this.statisticsLoading.set(false);
        },
        error => {
          if (!current) return;
          this.statisticsError.set(String(error));
          this.statisticsLoading.set(false);
        }
      );
    });
  }

  /** 确认清空后重新准备演示数据，阻止重复提交。 */
  async resetAndSeed(): Promise<void> {
    if (this.busy() || this.resetting()) return;
    if (!window.confirm('这会清空当前演示数据并重新准备示例，你的修改将不会保留。确定继续？')) return;
    this.busy.set(true);
    this.resetError.set('');
    this.notice.set('');
    try {
      await this.service.resetAndSeed();
      this.notice.set('演示数据已准备完成，可以选择下方业务场景。');
    } catch (error) {
      this.resetError.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 重新读取数据统计，不清空或修改业务数据。 */
  refreshStatistics(): void {
    this.statisticsRevision.update(value => value + 1);
  }

  /** 体验场景显式设置条件，避免跨页偷偷改动评估日期。 */
  async startWorkflow(kind: 'plan' | 'change' | 'trace'): Promise<void> {
    if (kind === 'plan') {
      this.workspace.update({
        rootKey: 'SC-100',
        asOfDate: '2026-09-22',
        plannedQty: '10',
        plannedUom: 'pcs',
        unit: 137,
        lot: '',
        alternativeNo: null,
        configSelection: { 颜色: ['红'] },
        substituteSelections: {}
      });
      this.workspace.guideStep.set(1);
    }
    if (kind === 'change') this.workspace.update({ asOfDate: '2026-10-15' });
    const path = { plan: '/explosion', change: '/timeline', trace: '/instances' }[kind];
    await this.router.navigate([path], { queryParams: this.workspace.queryParams() });
  }

  materialParams(item: string, target: 'root' | 'item'): Record<string, string> {
    return {
      ...this.workspace.queryParams(),
      [target]: item,
      ...(target === 'root' ? { uom: this.service.itemUoms().get(item)! } : {})
    };
  }
}
