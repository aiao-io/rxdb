import type { PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatDecimal } from '../presentation/decimal-format';
import { materialLabel } from '../presentation/material-label';

interface StepRow {
  key: string;
  label: string;
  value: string | null;
  uom: string;
  source: string;
}

/** 当前发生项的原始计算系数，只用于说明，不重新计算领域结果。 */
export interface RequirementCalculationBasis {
  headerId: string;
  occurrenceId: string;
  baseQty: string;
  baseUom: string;
  assemblyScrap: string;
  assemblyScrapConvention: 'additive' | 'yield';
  qty: string | null;
  qtyFormula: string | null;
  isFixedQty: boolean;
  tierGroupNo?: string | null;
  lotsizeFrom?: string | null;
  lotsizeTo?: string | null;
  componentScrap: string;
  componentScrapConvention: 'additive' | 'yield';
  componentScrapFixed: string;
  occurrenceUom: string;
  occurrenceUomConversion: string | null;
  itemUomConversion: string | null;
  stockUom: string;
  uomDecimals: number;
  operations?: readonly {
    operationSeq: number;
    scrap: string;
    scrapConvention: 'additive' | 'yield';
    ratio?: string;
    splitFrom?: number;
  }[];
}

/** 只展示所选需求行的计算依据，不重新计算业务数量。 */
@Component({
  selector: 'bom-step-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!line()) {
      <div class="empty-state">选择一条物料需求，查看从计划量到最终需求的计算过程。</div>
    } @else {
      @if (basis(); as source) {
        <details class="calculation-source">
          <summary>查看计算来源标识</summary>
          <p class="hint basis-source">
            来源：BOM 头 <code>{{ source.headerId }}</code> · 发生项 <code>{{ source.occurrenceId }}</code>
          </p>
        </details>
      } @else {
        <p class="hint basis-source">原始系数尚未载入；以下保留本次展开返回的中间量。</p>
      }
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
            {{ itemLabel(penetration.childItemId) }} → P = {{ quantity(penetration.childPlanned.value) }}
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

      .basis-source {
        margin: 0 0 16px;
        overflow-wrap: anywhere;
      }
      .calculation-source {
        margin-bottom: 16px;
      }
      .calculation-source .basis-source {
        margin: 8px 0 0;
      }
      .step-row .source {
        overflow-wrap: anywhere;
      }
    `
  ]
})
export class StepPanel {
  readonly line = input<RequirementLine | null>(null);
  readonly penetrations = input<PenetrationRecord[]>([]);
  readonly itemNos = input.required<Map<string, string>>();
  readonly basis = input<RequirementCalculationBasis | null>(null);

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  itemLabel(itemId: string): string {
    return materialLabel(this.itemNo(itemId));
  }

  quantity(value: string | null): string {
    return value === null ? '无需调整' : formatDecimal(value, { fractionDigits: 6, trimTrailingZeros: true });
  }

  /** 保留七步数据标识，使用可理解的业务名称解释每一步。 */
  stepRows(): StepRow[] {
    const line = this.line();
    if (!line) return [];
    const steps = line.steps;
    const basis = this.basis();
    const phantomSources = { override: '发生项设置', revision: '物料修订设置', fallback: '默认设置' };
    return [
      {
        key: '1. P',
        label: '计划投入',
        value: steps.planned.value,
        uom: steps.planned.uom,
        source: basis ? `父级计划生产数量，头基准单位 ${basis.baseUom}` : '父级计划生产数量'
      },
      {
        key: "2. P'",
        label: '装配损耗后',
        value: steps.assemblyScrapped.value,
        uom: steps.assemblyScrapped.uom,
        source:
          basis ?
            `${this.scrapExpression('P', basis.assemblyScrap, basis.assemblyScrapConvention)}；装配损耗，BOM 头设置`
          : '原始装配损耗系数尚未载入'
      },
      {
        key: '3. G',
        label: '子件毛需求',
        value: steps.gross.value,
        uom: steps.gross.uom,
        source: basis ? this.grossSource(basis, steps.planned) : '原始单件用量、公式与头基准量尚未载入'
      },
      {
        key: "4. G'",
        label: '组件损耗后',
        value: steps.componentScrapped.value,
        uom: steps.componentScrapped.uom,
        source:
          basis ?
            `${this.scrapExpression('G', basis.componentScrap, basis.componentScrapConvention)} + 固定损耗 ${basis.componentScrapFixed} ${basis.occurrenceUom}；发生项设置`
          : '原始组件损耗与固定损耗系数尚未载入'
      },
      {
        key: '5. G″',
        label: '工序损耗后',
        value: steps.operationScrapped?.value ?? null,
        uom: steps.operationScrapped?.uom ?? '',
        source: steps.operationScrapped ? this.operationSource(basis) : '未关联工序，本步无需调整'
      },
      {
        key: '6. D',
        label: '单位换算后',
        value: steps.converted.value,
        uom: steps.converted.uom,
        source: basis ? this.conversionSource(basis) : '换算为物料库存单位；原始换算率尚未载入'
      },
      {
        key: '7. 需求',
        label: '最终需求',
        value: line.qty,
        uom: line.uom,
        source: `${steps.phantom.value ? '虚拟件' : '实物件'}，依据${phantomSources[steps.phantom.source]}，${basis ? `按库存精度 ${basis.uomDecimals} 位小数` : '按库存精度'}向上取整`
      }
    ];
  }

  private scrapExpression(symbol: string, rate: string, convention: 'additive' | 'yield'): string {
    return convention === 'additive' ? `${symbol} × (1 + ${rate})，加成制` : `${symbol} ÷ (1 − ${rate})，良率制`;
  }

  private grossSource(basis: RequirementCalculationBasis, planned: { value: string; uom: string }): string {
    const quantity = basis.qtyFormula === null ? `${basis.qty} ${basis.occurrenceUom}` : `公式 ${basis.qtyFormula}`;
    const tier =
      basis.tierGroupNo == null ?
        ''
      : `按损耗前计划量 P=${planned.value} ${planned.uom}，阶梯组 ${basis.tierGroupNo}，命中 [${basis.lotsizeFrom ?? '不限'}, ${basis.lotsizeTo ?? '不限'})（左闭右开）；`;
    const source =
      basis.isFixedQty ?
        `固定用量 ${quantity}，不随计划量缩放；发生项设置`
      : `${quantity} × P′ ÷ 基准量 ${basis.baseQty} ${basis.baseUom}；发生项用量与 BOM 头基准量`;
    return `${tier}${source}`;
  }

  private operationSource(basis: RequirementCalculationBasis | null): string {
    if (!basis?.operations?.length) return '从投料工序到末工序累计损耗；原始工序系数尚未载入';
    return basis.operations
      .map(
        operation =>
          `${operation.ratio === undefined ? '' : `分摊 ${operation.ratio}（从工序 ${operation.splitFrom} 投料）；`}工序 ${operation.operationSeq}：${this.scrapExpression('投入', operation.scrap, operation.scrapConvention)}`
      )
      .join('；');
  }

  private conversionSource(basis: RequirementCalculationBasis): string {
    if (basis.occurrenceUom === basis.stockUom) return `相同单位 ${basis.stockUom}，无需换算`;
    if (basis.occurrenceUomConversion !== null)
      return `${basis.occurrenceUom} → ${basis.stockUom}；发生项换算率 ${basis.occurrenceUomConversion}`;
    if (basis.itemUomConversion !== null)
      return `${basis.occurrenceUom} → ${basis.stockUom}；物料换算率 ${basis.itemUomConversion}`;
    return `${basis.occurrenceUom} → ${basis.stockUom}；标准单位换算`;
  }
}
