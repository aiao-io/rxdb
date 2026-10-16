import type { ExplosionResult, PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../../bom-demo.service';
import { ConfigPanel } from '../../components/config-panel';
import { DemoChecks } from '../../components/demo-checks';
import { IntegrationPanel } from '../../components/integration-panel';
import { ReqTree } from '../../components/req-tree';
import { StepPanel } from '../../components/step-panel';

/** 一次展开的页面状态（信号集）。 */
interface ExplosionView {
  result: ExplosionResult;
  selected: RequirementLine | null;
}

/**
 * 展开专项页：EBOM 树与七步算式、配置选择、导入导出及保存/发布校验演示。
 */
@Component({
  selector: 'bom-explosion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfigPanel, DemoChecks, FormsModule, IntegrationPanel, ReqTree, StepPanel],
  templateUrl: './explosion.page.html'
})
export class ExplosionPage {
  private readonly service = inject(BomDemoService);

  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly designators = this.service.designators;
  readonly asOfDate = signal('2026-09-22');
  readonly plannedQty = signal('1');
  readonly rootKey = signal('SC-100');
  readonly unit = signal<number | null>(137);
  readonly view = signal<ExplosionView | null>(null);
  readonly explodeError = signal('');
  readonly busy = signal(false);

  /** 按评估日与计划量展开整机（根物料可选，默认整机 SC-100）。 */
  async runExplode(): Promise<void> {
    this.busy.set(true);
    this.explodeError.set('');
    this.view.set(null);
    try {
      const result = await this.service.explode(this.asOfDate(), this.plannedQty(), this.rootKey(), {
        unit: this.unit() ?? undefined
      });
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
