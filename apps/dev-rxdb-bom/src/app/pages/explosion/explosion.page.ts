import type { ExplosionResult, PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BomDemoService } from '../../bom-demo.service';
import { ConfigPanel } from '../../components/config-panel';
import { DemoChecks } from '../../components/demo-checks';
import { IntegrationPanel } from '../../components/integration-panel';
import { ReqTree } from '../../components/req-tree';
import { StepPanel } from '../../components/step-panel';

interface ExplosionView {
  result: ExplosionResult;
  selected: RequirementLine | null;
}

/** 先选择展开条件，再查看需求结构与所选物料的用量。 */
@Component({
  selector: 'bom-explosion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfigPanel, DemoChecks, FormsModule, IntegrationPanel, ReqTree, RouterLink, StepPanel],
  templateUrl: './explosion.page.html',
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .result-panel {
        min-width: 0;
      }

      .result-panel h2 {
        margin: 0 0 8px;
        font-size: 16px;
      }

      .selected-material {
        margin: 0 0 18px;
        color: var(--color-text-secondary);
      }

      .selected-material strong {
        color: var(--color-primary);
      }

      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `
  ]
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
  readonly selectedItemNo = computed(() => {
    const line = this.view()?.selected;
    return line ? this.itemNos().get(line.itemId) : null;
  });

  constructor() {
    effect(() => {
      if (this.ready()) return;
      this.view.set(null);
      this.explodeError.set('');
    });
  }

  /** 使用明确的日期、计划量与适用条件计算整机需求。 */
  async runExplode(): Promise<void> {
    if (this.busy() || !this.ready()) return;
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

  /** 选择一条需求行，联动展示它的数量计算依据。 */
  select(line: RequirementLine): void {
    const current = this.view();
    if (current) this.view.set({ ...current, selected: line });
  }

  /** 读取该需求路径经过的虚拟件穿透记录。 */
  penetrationsOn(line: RequirementLine | null): PenetrationRecord[] {
    const result = this.view()?.result;
    if (!line || !result) return [];
    const pathKey = line.path.join('>');
    return result.penetrations.filter(entry => pathKey.startsWith(entry.path.join('>')));
  }
}
