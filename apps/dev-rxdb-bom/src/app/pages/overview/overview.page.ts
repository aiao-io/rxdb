import type { ExplosionResult, PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../../bom-demo.service';
import { CostPanel } from '../../components/cost-panel';
import { DemoChecks } from '../../components/demo-checks';
import { EcnPanel } from '../../components/ecn-panel';
import { MappingPanel } from '../../components/mapping-panel';
import { ReqTree } from '../../components/req-tree';
import { StepPanel } from '../../components/step-panel';
import { WhereUsedPanel } from '../../components/where-used-panel';

/** 一次展开的页面状态（信号集）。 */
interface ExplosionView {
  result: ExplosionResult;
  selected: RequirementLine | null;
}

/**
 * 概览页（验收面板）：全部验收区块一页汇总（种子与行数 / 整机展开 / 校验演示 / 反查 /
 * ECN 变更管理 / 双图与映射 / 成本卷算）。专项操作进左侧导航的分页（同组件复用）。
 */
@Component({
  selector: 'bom-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CostPanel, DemoChecks, EcnPanel, FormsModule, MappingPanel, ReqTree, StepPanel, WhereUsedPanel],
  templateUrl: './overview.page.html'
})
export class OverviewPage {
  private readonly service = inject(BomDemoService);

  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly designators = this.service.designators;
  readonly seedBatchNo = this.service.seedBatchNo;
  readonly seedTimestamp = this.service.seedTimestamp;
  readonly asOfDate = signal('2026-09-22');
  readonly plannedQty = signal('1');
  readonly rootKey = signal('SC-100');
  readonly view = signal<ExplosionView | null>(null);
  readonly explodeError = signal('');
  readonly rowCounts = signal('');
  readonly busy = signal(false);

  /** 重置并装载种子（AC#1 的两遍 seed 入口），随后回读行数面板。 */
  async resetAndSeed(): Promise<void> {
    this.busy.set(true);
    try {
      await this.service.resetAndSeed();
      this.rowCounts.set(await this.service.dumpRowCounts());
      this.view.set(null);
      this.explodeError.set('');
    } finally {
      this.busy.set(false);
    }
  }

  /** 按评估日与计划量展开整机（根物料可选，默认整机 SC-100）。 */
  async runExplode(): Promise<void> {
    this.busy.set(true);
    this.explodeError.set('');
    try {
      const result = await this.service.explode(this.asOfDate(), this.plannedQty(), this.rootKey());
      this.view.set({ result, selected: null });
    } catch (error) {
      this.explodeError.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 行选中（算式面板联动）。 */
  select(line: RequirementLine): void {
    const current = this.view();
    if (current) this.view.set({ ...current, selected: line });
  }

  /** 该需求行路径上的穿透记录（算式面板第 7 步的展示）。 */
  penetrationsOn(line: RequirementLine | null): PenetrationRecord[] {
    const result = this.view()?.result;
    if (!line || !result) return [];
    const pathKey = line.path.join('>');
    return result.penetrations.filter(entry => pathKey.startsWith(entry.path.join('>')));
  }
}
