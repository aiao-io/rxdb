import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import type { ExplosionResult, PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { goldenItemId } from '@aiao/rxdb-plugin-bom/testing';
import { BomDemoService } from '../../bom-demo.service';

/** 一次展开的页面状态（信号集）。 */
interface ExplosionView {
  result: ExplosionResult;
  selected: RequirementLine | null;
}

@Component({
  selector: 'bom-explosion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe],
  templateUrl: './explosion.page.html',
  styleUrl: './explosion.page.scss'
})
export class ExplosionPage implements OnInit {
  private readonly service = inject(BomDemoService);

  ngOnInit(): void {
    // 页面重载走既有库路径：连接即安装插件触发器（幂等），种子行原样可用
    void this.service.connectExisting().catch(() => undefined);
  }

  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly seedBatchNo = this.service.seedBatchNo;
  readonly seedTimestamp = this.service.seedTimestamp;
  readonly asOfDate = signal('2026-09-22');
  readonly plannedQty = signal('1');
  readonly view = signal<ExplosionView | null>(null);
  readonly rawResult = signal('');
  readonly formResult = signal('');
  readonly rowCounts = signal('');
  readonly publishResult = signal('');
  readonly whereUsedLines = signal<string[]>([]);
  readonly busy = signal(false);

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  /** 行对应的位号清单（AC#2 的行级位号展示）。 */
  designatorsOf(line: RequirementLine): string[] {
    const occurrenceId = line.path[line.path.length - 1];
    return this.service.designators().get(occurrenceId) ?? [];
  }

  async publishDemoHeader(): Promise<void> {
    this.busy.set(true);
    try {
      this.publishResult.set(await this.service.publishDemoHeader());
    } finally {
      this.busy.set(false);
    }
  }

  async runWhereUsed(): Promise<void> {
    this.busy.set(true);
    try {
      const result = await this.service.whereUsed(this.asOfDate(), goldenItemId('M3'));
      this.whereUsedLines.set(
        result.nodes.map(node => `${node.path.length} 跳：${node.path.slice(0, 8).join(' → ')}（${this.itemNo(node.itemId)}）`)
      );
    } catch (error) {
      this.whereUsedLines.set([String(error)]);
    } finally {
      this.busy.set(false);
    }
  }

  /** 行在树里的缩进层级（path 长度 - 1）。 */
  depth(line: RequirementLine): number {
    return line.path.length - 1;
  }

  async resetAndSeed(): Promise<void> {
    this.busy.set(true);
    try {
      await this.service.resetAndSeed();
      this.rowCounts.set(await this.service.dumpRowCounts());
      this.view.set(null);
      this.rawResult.set('');
    } finally {
      this.busy.set(false);
    }
  }

  async runExplode(): Promise<void> {
    this.busy.set(true);
    try {
      const result = await this.service.explode(this.asOfDate(), this.plannedQty());
      this.view.set({ result, selected: null });
    } catch (error) {
      this.rawResult.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  select(line: RequirementLine): void {
    const current = this.view();
    if (current) this.view.set({ ...current, selected: line });
  }

  /** 该需求行路径上的穿透记录（算式面板第 7 步的展示）。 */
  penetrationsOn(line: RequirementLine): PenetrationRecord[] {
    const result = this.view()?.result;
    if (!result) return [];
    const pathKey = line.path.join('>');
    return result.penetrations.filter(entry => pathKey.startsWith(entry.path.join('>')));
  }

  async runRawCycle(): Promise<void> {
    this.busy.set(true);
    try {
      this.rawResult.set(await this.service.rawCycleInsert());
    } finally {
      this.busy.set(false);
    }
  }

  async runFormCycle(): Promise<void> {
    this.busy.set(true);
    try {
      this.formResult.set(await this.service.formCycleInsert());
    } finally {
      this.busy.set(false);
    }
  }

  /** 七步算式面板的展示行（第 5 步未交付占位）。 */
  stepRows(): { label: string; value: string; uom: string; source: string }[] {
    const line = this.view()?.selected;
    if (!line) return [];
    const steps = line.steps;
    const phantomSource = steps.phantom.source === 'override' ? '行级 phantom_override' : steps.phantom.source === 'revision' ? '修订级 default_phantom' : '均未声明（按实体件）';
    const rows = [
      { label: '1. P', value: steps.planned.value, uom: steps.planned.uom, source: '父计划量（头基准单位）' },
      { label: "2. P'", value: steps.assemblyScrapped.value, uom: steps.assemblyScrapped.uom, source: 'h.assembly_scrap' },
      { label: '3. G', value: steps.gross.value, uom: steps.gross.uom, source: 'qty / qty_formula × P′ / h.base_qty' },
      { label: "4. G'", value: steps.componentScrapped.value, uom: steps.componentScrapped.uom, source: 'l.component_scrap(+fixed)' },
      { label: '5. G″', value: '—', uom: '', source: '工序损耗未交付（阶段 B）' },
      { label: '6. D', value: steps.converted.value, uom: steps.converted.uom, source: '行 UoM → 子件库存单位' },
      { label: '7. 需求', value: line.qty, uom: line.uom, source: `phantom = ${phantomSource}（向上取整）` }
    ];
    return rows;
  }
}
