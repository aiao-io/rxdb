import type { PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** 七步算式面板行（第 5 步工序损耗未交付时为占位）。 */
interface StepRow {
  label: string;
  value: string;
  uom: string;
  source: string;
}

/**
 * 七步算式面板：选中需求行的 P/P′/G/G′/G″/D/需求 手算式 + 穿透记录（COALESCE 判定来源）。
 * overview 与 explosion 两处复用。
 */
@Component({
  selector: 'bom-step-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!line()) {
      <p class="hint">选中一条需求行查看七步手算式。</p>
    } @else {
      @for (row of stepRows(); track row.label) {
        <div class="step-row" [attr.data-step]="row.label">
          <span class="label">{{ row.label }}</span>
          <span class="value" [attr.data-value]="row.value">{{ row.value }} {{ row.uom }}</span>
          <span class="label">取自</span>
          <span class="source">{{ row.source }}</span>
        </div>
      }
      @for (penetration of penetrations(); track penetration.occurrenceId) {
        <div class="step-row" data-step="penetration">
          <span class="label">穿透</span>
          <span class="value">
            {{ itemNo(penetration.childItemId) }} → P = {{ penetration.childPlanned.value }}
            {{ penetration.childPlanned.uom }}
          </span>
          <span class="label">判定</span>
          <span class="source">COALESCE(phantom_override, default_phantom) = {{ penetration.source }}</span>
        </div>
      }
    }
  `
})
export class StepPanel {
  readonly line = input<RequirementLine | null>(null);
  readonly penetrations = input<PenetrationRecord[]>([]);
  readonly itemNos = input.required<Map<string, string>>();

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  /** 七步手算式的展示行（第 5 步未交付占位）。 */
  stepRows(): StepRow[] {
    const line = this.line();
    if (!line) return [];
    const steps = line.steps;
    const phantomSource =
      steps.phantom.source === 'override' ? '行级 phantom_override'
      : steps.phantom.source === 'revision' ? '修订级 default_phantom'
      : '均未声明（按实体件）';
    return [
      { label: '1. P', value: steps.planned.value, uom: steps.planned.uom, source: '父计划量（头基准单位）' },
      {
        label: "2. P'",
        value: steps.assemblyScrapped.value,
        uom: steps.assemblyScrapped.uom,
        source: 'h.assembly_scrap'
      },
      { label: '3. G', value: steps.gross.value, uom: steps.gross.uom, source: 'qty / qty_formula × P′ / h.base_qty' },
      {
        label: "4. G'",
        value: steps.componentScrapped.value,
        uom: steps.componentScrapped.uom,
        source: 'l.component_scrap(+fixed)'
      },
      {
        label: '5. G″',
        value: steps.operationScrapped?.value ?? '—',
        uom: steps.operationScrapped?.uom ?? '',
        source: steps.operationScrapped ? '投料工序（含）至末工序逐道累乘' : '工序损耗未交付（无路线行）'
      },
      { label: '6. D', value: steps.converted.value, uom: steps.converted.uom, source: '行 UoM → 子件库存单位' },
      { label: '7. 需求', value: line.qty, uom: line.uom, source: `phantom = ${phantomSource}（向上取整）` }
    ];
  }
}
