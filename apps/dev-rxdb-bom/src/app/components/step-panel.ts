import type { PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatDecimal } from '../presentation/decimal-format';

interface StepRow {
  key: string;
  label: string;
  value: string | null;
  uom: string;
  source: string;
}

/** 只展示所选需求行的计算依据，不重新计算业务数量。 */
@Component({
  selector: 'bom-step-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!line()) {
      <div class="empty-state">选择一条物料需求，查看从计划量到最终需求的计算过程。</div>
    } @else {
      @for (row of stepRows(); track row.key) {
        <div class="step-row" [attr.data-step]="row.key">
          <span class="label">{{ row.label }}</span>
          <span
            class="value"
            [attr.data-value]="row.value"
            [title]="row.value === null ? row.source : row.value + ' ' + row.uom"
          >
            {{ quantity(row.value) }} {{ row.uom }}
          </span>
          <span class="label">依据</span>
          <span class="source">{{ row.source }}</span>
        </div>
      }
      @for (penetration of penetrations(); track penetration.occurrenceId) {
        <div class="step-row" data-step="penetration">
          <span class="label">虚拟件穿透</span>
          <span class="value" [title]="penetration.childPlanned.value + ' ' + penetration.childPlanned.uom">
            {{ itemNo(penetration.childItemId) }} → P = {{ quantity(penetration.childPlanned.value) }}
            {{ penetration.childPlanned.uom }}
          </span>
          <span class="label">下层计划量</span>
          <span class="source">
            {{ penetration.source === 'override' ? '按当前行设置继续展开' : '按物料修订设置继续展开' }}
            <details>
              <summary>查看来源</summary>
              {{ penetration.source }}
            </details>
          </span>
        </div>
      }
      <details class="details-panel calculation-details">
        <summary>查看原始数量</summary>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">计算步骤</th>
                <th scope="col">原始数量</th>
              </tr>
            </thead>
            <tbody>
              @for (row of stepRows(); track row.key) {
                <tr>
                  <td>{{ row.label }}</td>
                  <td>{{ row.value === null ? '不适用' : row.value }} {{ row.uom }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </details>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .calculation-details {
        margin-top: 20px;
      }

      .data-table td {
        overflow-wrap: anywhere;
      }

      .source details {
        margin-top: 6px;
      }
    `
  ]
})
export class StepPanel {
  readonly line = input<RequirementLine | null>(null);
  readonly penetrations = input<PenetrationRecord[]>([]);
  readonly itemNos = input.required<Map<string, string>>();

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  quantity(value: string | null): string {
    return value === null ? '无需调整' : formatDecimal(value, { fractionDigits: 6, trimTrailingZeros: true });
  }

  /** 保留七步数据标识，使用可理解的业务名称解释每一步。 */
  stepRows(): StepRow[] {
    const line = this.line();
    if (!line) return [];
    const steps = line.steps;
    const phantomSources = { override: '发生项设置', revision: '物料修订设置', fallback: '默认设置' };
    return [
      {
        key: '1. P',
        label: '计划投入',
        value: steps.planned.value,
        uom: steps.planned.uom,
        source: '父级计划生产数量'
      },
      {
        key: "2. P'",
        label: '装配损耗后',
        value: steps.assemblyScrapped.value,
        uom: steps.assemblyScrapped.uom,
        source: '计入装配过程损耗'
      },
      {
        key: '3. G',
        label: '子件毛需求',
        value: steps.gross.value,
        uom: steps.gross.uom,
        source: '按单件用量、公式或阶梯用量计算'
      },
      {
        key: "4. G'",
        label: '组件损耗后',
        value: steps.componentScrapped.value,
        uom: steps.componentScrapped.uom,
        source: '计入组件损耗与固定损耗'
      },
      {
        key: '5. G″',
        label: '工序损耗后',
        value: steps.operationScrapped?.value ?? null,
        uom: steps.operationScrapped?.uom ?? '',
        source: steps.operationScrapped ? '从投料工序到末工序累计损耗' : '未关联工序，本步无需调整'
      },
      {
        key: '6. D',
        label: '单位换算后',
        value: steps.converted.value,
        uom: steps.converted.uom,
        source: '换算为物料库存单位'
      },
      {
        key: '7. 需求',
        label: '最终需求',
        value: line.qty,
        uom: line.uom,
        source: `${steps.phantom.value ? '虚拟件' : '实物件'}，依据${phantomSources[steps.phantom.source]}，按库存精度向上取整`
      }
    ];
  }
}
