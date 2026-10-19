import {
  decimalAdd,
  decimalFromCanonical,
  decimalToCanonical,
  type CostNodeDetail,
  type CostRollupResult
} from '@aiao/rxdb-plugin-bom';
import { COPRODUCT_DATASET } from '@aiao/rxdb-plugin-bom/testing';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';
import { BomWorkspaceState } from '../bom-workspace-state';
import { formatDecimal } from '../presentation/decimal-format';
import { materialLabel } from '../presentation/material-label';

interface CostRawField {
  label: string;
  value: string;
}

interface CostFlatRow {
  key: string;
  depth: number;
  label: string;
  basis: string;
  kind: 'head' | 'material' | 'processing' | 'overhead' | 'credit' | 'joint-net' | 'joint-output';
  itemNo?: string;
  amount: string;
  rawFields: readonly CostRawField[];
}

const amountText = (value: string): string => formatDecimal(value, { fractionDigits: 2 });
const unitText = (value: string): string => formatDecimal(value, { fractionDigits: 6, trimTrailingZeros: true });
const sumAmounts = (values: readonly string[]): string =>
  decimalToCanonical(
    values.reduce((sum, value) => decimalAdd(sum, decimalFromCanonical(value)), decimalFromCanonical('0'))
  );

/** 先展示本次成本结论，再按生产层级解释投入和分配。 */
@Component({
  selector: 'bom-cost-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  styles: [
    `
      .cost-toolbar {
        margin-bottom: 24px;
      }
      .cost-context {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        margin: 0 0 16px;
        color: var(--color-text-secondary);
        font-size: 13px;
      }
      .cost-context strong {
        color: var(--color-text);
        font-size: 16px;
      }
      .cost-summary {
        display: grid;
        gap: 18px;
        margin-bottom: 28px;
      }
      .cost-primary-metrics {
        grid-template-columns: 1.25fr 1fr 0.85fr;
      }
      .cost-primary-metrics .metric-card:first-child {
        border-color: #b7dacf;
        background: var(--color-primary-bg);
      }
      .cost-primary-metrics .metric-card:first-child .metric-value {
        color: var(--color-primary-hover);
      }
      .cost-composition {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin: 0;
      }
      .cost-composition > div {
        min-width: 0;
        padding: 14px 16px;
        border-radius: var(--radius-sm);
        background: var(--color-surface-alt);
      }
      .cost-composition dt {
        color: var(--color-text-secondary);
        font-size: 12px;
      }
      .cost-composition dd {
        margin: 6px 0 0;
        font-size: 17px;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
      }
      .cost-layer-note {
        margin: 10px 0 0;
        color: var(--color-text-muted);
        font-size: 12px;
      }
      .cost-joint-note {
        margin: 0;
        padding: 14px 16px;
        border-left: 3px solid var(--color-primary);
        background: var(--color-primary-bg);
        color: var(--color-text-secondary);
        font-size: 13px;
      }
      .cost-detail-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
      }
      .cost-detail-head h3 {
        margin: 0;
        font-size: 15px;
      }
      .cost-detail-head p {
        margin: 0;
        color: var(--color-text-muted);
        font-size: 12px;
      }
      .cost-table {
        min-width: 760px;
      }
      .cost-table .cost-row {
        display: table-row;
      }
      .cost-table .num {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .cost-table .cost-basis {
        color: var(--color-text-secondary);
        font-size: 13px;
      }
      .cost-table .cost-row[data-kind='head'] {
        background: var(--color-surface-alt);
      }
      .cost-table .cost-row[data-kind='credit'] .num {
        color: var(--color-success);
      }
      .cost-table .cost-row[data-kind='head'] td:first-child {
        border-left: 3px solid #b7dacf;
      }
      .cost-raw {
        min-width: 62px;
        font-weight: 400;
      }
      .cost-raw summary {
        color: var(--color-primary);
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
      }
      .cost-raw dl {
        min-width: 180px;
        max-width: 280px;
        margin: 12px 0 0;
      }
      .cost-raw dt {
        margin-top: 8px;
        color: var(--color-text-muted);
        font-size: 11px;
      }
      .cost-raw dd {
        margin: 3px 0 0;
      }
      .cost-raw code {
        white-space: normal;
        overflow-wrap: anywhere;
      }
      @media (max-width: 900px) {
        .cost-primary-metrics {
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr);
        }
        .cost-primary-metrics .metric-card:first-child {
          grid-column: 1 / -1;
        }
        .cost-primary-metrics .metric-value {
          font-size: 25px;
        }
        .cost-composition {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 640px) {
        .cost-primary-metrics {
          grid-template-columns: minmax(0, 1fr);
        }
        .cost-primary-metrics .metric-card {
          padding: 16px;
        }
        .cost-primary-metrics .metric-card:last-child {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
        }
        .cost-primary-metrics .metric-card:last-child .metric-label {
          margin: 0;
        }
        .cost-primary-metrics .metric-card:last-child .metric-note {
          grid-column: 1 / -1;
          margin-top: 5px;
        }
        .cost-detail-head {
          align-items: flex-start;
          flex-direction: column;
          gap: 4px;
        }
      }
    `
  ],
  template: `
    <section class="panel" [attr.aria-busy]="busy()">
      <div class="panel-head">
        <h2>成本结果</h2>
        <p class="panel-desc">选择物料并卷算，先看本批总成本，再查看材料、加工和抵减来自哪一层。</p>
      </div>
      <div class="toolbar cost-toolbar">
        <label>
          目标物料
          <select
            [(ngModel)]="costRootKey"
            [disabled]="busy()"
            (ngModelChange)="changeRoot($event)"
            data-testid="cost-root-select"
          >
            <option value="SC-100">{{ materialLabel('SC-100') }}</option>
            <option value="COST-DEMO">{{ materialLabel('COST-DEMO') }} · 故意缺成本</option>
            @if (jointReady()) {
              <option value="JOINT-MAIN">{{ materialLabel('JOINT-MAIN') }} · 基准 100 kg 联合生产</option>
              <option value="JOINT-CONSUMER">{{ materialLabel('JOINT-CONSUMER') }} · 消费联产品 10 kg</option>
            }
            @for (key of otherRoots(); track key) {
              <option [value]="key">{{ materialLabel(key) }}</option>
            }
          </select>
        </label>
        <label
          >核算批量<input
            [(ngModel)]="workspace.plannedQty"
            [disabled]="busy()"
            data-testid="cost-planned-qty"
            inputmode="decimal"
        /></label>
        <label
          >单位<select [(ngModel)]="workspace.plannedUom" [disabled]="busy()" data-testid="cost-uom">
            <option value="pcs">件（pcs）</option>
            <option value="kg">千克（kg）</option>
            <option value="m">米（m）</option>
          </select></label
        >
        @if (jointReady() && costRootKey() === dataset.consumerKey) {
          <label>
            联产成本来源
            <select
              [(ngModel)]="jointSourceKey"
              [disabled]="busy()"
              (ngModelChange)="clearResult()"
              data-testid="joint-source-select"
            >
              <option value="">请选择已发布生产头</option>
              <option value="JOINT-MAIN">{{ materialLabel('JOINT-MAIN') }} · 固定份额 0.6 / 0.4</option>
            </select>
          </label>
        }
        <button
          class="btn btn-primary"
          [disabled]="busy() || !ready() || !!workspace.validationError()"
          (click)="runRollup()"
        >
          {{ busy() ? '处理中…' : '卷算' }}
        </button>
        <button class="btn btn-secondary" [disabled]="busy() || !ready() || jointReady()" (click)="loadCoproductDemo()">
          装载联产演示
        </button>
        <span class="field-hint" data-testid="coproduct-load-status">{{
          jointReady() ? '联产演示已装载' : '联产演示尚未装载'
        }}</span>
      </div>
      @if (workspace.validationError()) {
        <p class="error-box" role="alert">{{ workspace.validationError() }}</p>
      }
      @if (stale()) {
        <p class="workspace-stale" data-testid="cost-stale" role="status">
          条件已修改。下方为上次确认的成本，请重新卷算。
        </p>
      }
      @if (costError()) {
        <div class="error-box" data-testid="cost-error" role="alert">{{ costError() }}</div>
      }
      @if (costResult(); as result) {
        @if (costSummary(); as summary) {
          <section class="cost-summary" aria-label="本次卷算结果" data-testid="cost-summary">
            <p class="cost-context">
              <strong>{{ materialLabel(itemNo(result.root.itemId)) }}</strong>
              <span
                >{{ resultDate() }} · {{ result.context.bomType.toUpperCase() }} · {{ result.context.currency }}</span
              >
            </p>
            <div class="summary-grid cost-primary-metrics">
              <div class="metric-card">
                <span class="metric-label">{{ result.root.jointCost ? '本产物分摊成本' : '本批总成本' }}</span>
                <strong class="metric-value" data-testid="cost-summary-total"
                  >{{ result.context.currency }} {{ amount(result.root.batchCost) }}</strong
                >
                <span class="metric-note">本次批量对应的成本</span>
              </div>
              <div class="metric-card">
                <span class="metric-label">标准单位成本</span>
                <strong class="metric-value" data-testid="cost-summary-unit"
                  >{{ result.context.currency }} {{ unit(result.root.unitCost) }} / {{ result.root.baseUom }}</strong
                >
                <span class="metric-note"
                  >按标准批量 {{ unit(result.root.costLotQty) }} {{ result.root.baseUom }} 折算</span
                >
              </div>
              <div class="metric-card">
                <span class="metric-label">本次批量</span>
                <strong class="metric-value" data-testid="cost-summary-quantity"
                  >{{ unit(result.root.batchQty) }} {{ result.root.baseUom }}</strong
                >
                <span class="metric-note">更完整的计算值见下方原值</span>
              </div>
            </div>
            <div>
              <dl class="cost-composition" aria-label="本层成本组成">
                <div>
                  <dt>材料与子件</dt>
                  <dd data-testid="cost-summary-material">
                    {{ result.context.currency }} {{ amount(summary.material) }}
                  </dd>
                </div>
                <div>
                  <dt>本层加工</dt>
                  <dd data-testid="cost-summary-processing">
                    {{ result.context.currency }} {{ amount(summary.processing) }}
                  </dd>
                </div>
                <div>
                  <dt>本层制费</dt>
                  <dd data-testid="cost-summary-overhead">
                    {{ result.context.currency }} {{ amount(summary.overhead) }}
                  </dd>
                </div>
                <div>
                  <dt>副产抵减</dt>
                  <dd data-testid="cost-summary-credit">
                    {{ summary.credit === '0' ? '' : '− ' }}{{ result.context.currency }} {{ amount(summary.credit) }}
                  </dd>
                </div>
              </dl>
              <p class="cost-layer-note">子件成本已计入材料；下方展开的子件明细用于解释来源，不再重复加总。</p>
            </div>
            @if (result.root.jointCost; as joint) {
              <p class="cost-joint-note">
                联合生产先核算整批净成本 {{ result.context.currency }}
                {{ amount(joint.netCost) }}，再按明确份额分给各产物。本层组成显示分配前投入，本产物成本以分配结果为准。
              </p>
            }
          </section>
        }
        <div class="cost-detail-head">
          <h3>逐层成本明细</h3>
          <p>金额保留两位，单位成本最多六位；每行「原值」可查看完整数值。</p>
        </div>
        <div class="table-scroll">
          <table class="data-table cost-table">
            <caption class="sr-only">
              {{
                materialLabel(itemNo(result.root.itemId))
              }}
              的成本组成与逐层明细，金额单位
              {{
                result.context.currency
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">项目</th>
                <th scope="col">计价依据</th>
                <th class="num" scope="col">金额（{{ result.context.currency }}）</th>
                <th scope="col">完整数值</th>
              </tr>
            </thead>
            <tbody>
              @for (row of costRows(); track row.key) {
                <tr
                  class="cost-row"
                  [attr.data-item]="row.itemNo"
                  [attr.data-kind]="row.kind"
                  [attr.data-testid]="row.kind === 'joint-net' ? 'cost-joint-net' : null"
                >
                  <td class="label" [style.padding-inline-start.px]="16 + row.depth * 16">{{ row.label }}</td>
                  <td class="cost-basis">{{ row.basis }}</td>
                  <td class="num amount">
                    <span class="qty" [attr.data-amount]="row.amount">{{ amount(row.amount) }}</span>
                  </td>
                  <td>
                    <details class="cost-raw">
                      <summary [attr.aria-label]="'查看' + row.label + '原值'">原值</summary>
                      <dl>
                        @for (field of row.rawFields; track field.label) {
                          <dt>{{ field.label }}</dt>
                          <dd>
                            <code>{{ field.value }}</code>
                          </dd>
                        }
                      </dl>
                    </details>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (!costError()) {
        <div class="empty-state" role="status">
          <strong>{{ busy() ? '正在计算成本' : '从一份成本结果开始' }}</strong>
          {{ busy() ? '正在读取各层投入与价格，请稍候。' : '选择目标物料后点击「卷算」，查看总成本和逐层明细。' }}
        </div>
      }
    </section>
  `
})
export class CostPanel {
  private readonly service = inject(BomDemoService);
  private requestId = 0;
  private revision = this.service.dataRevision();
  readonly workspace = inject(BomWorkspaceState);
  readonly asOfDate = input.required<string>();
  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly costRootKey = this.workspace.rootKey;
  readonly costResult = signal<CostRollupResult | null>(this.workspace.cost()?.result ?? null);
  readonly resultKey = signal(this.workspace.cost()?.key ?? '');
  readonly requestKey = computed(() =>
    JSON.stringify({ ...this.workspace.context(), asOfDate: this.asOfDate(), jointSource: this.jointSourceKey() })
  );
  readonly stale = computed(() => this.costResult() !== null && this.resultKey() !== this.requestKey());
  readonly otherRoots = computed(() =>
    [...this.itemNos().values()].filter(key => !['SC-100', 'COST-DEMO', 'JOINT-MAIN', 'JOINT-CONSUMER'].includes(key))
  );
  readonly costRows = computed(() => {
    const result = this.costResult();
    return result === null ? [] : flattenCost(this.itemNo.bind(this), result.root, result.context.currency);
  });
  readonly costSummary = computed(() => {
    const root = this.costResult()?.root;
    return root === undefined ? null : (
        {
          material: sumAmounts(root.material.map(line => line.amount)),
          processing: sumAmounts(root.processing.map(line => line.amount)),
          overhead: root.overhead,
          credit: sumAmounts(root.credits.map(line => line.amount))
        }
      );
  });
  readonly resultDate = computed(() => this.costResult()?.context.asOfDate.toISOString().slice(0, 10) ?? '');
  readonly costError = signal('');
  readonly busy = signal(false);
  readonly dataset = COPRODUCT_DATASET;
  readonly jointSourceKey = this.workspace.jointSourceKey;
  readonly jointReady = computed(() => [...this.itemNos().values()].includes(COPRODUCT_DATASET.primaryKey));
  readonly amount = amountText;
  readonly unit = unitText;
  readonly materialLabel = materialLabel;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.requestId++);
    effect(() => {
      const epoch = this.service.dataEpoch();
      const revision = this.service.dataRevision();
      const cache = untracked(this.workspace.cost);
      if (!this.service.ready() || (cache !== null && cache.epoch !== epoch)) {
        this.requestId++;
        this.busy.set(false);
        this.clearResult();
      }
      if (revision !== this.revision) {
        this.revision = revision;
        this.clearResult();
      }
    });
  }

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  clearResult(): void {
    this.costResult.set(null);
    this.workspace.cost.set(null);
    this.costError.set('');
  }

  /** 沿用显式生产来源与原始领域错误，失败时不保留上一份结果。 */
  async runRollup(): Promise<void> {
    if (this.busy() || !this.ready() || this.service.resetting() || this.workspace.validationError()) return;
    const id = ++this.requestId;
    const epoch = this.service.dataEpoch();
    const revision = this.service.dataRevision();
    const key = this.requestKey();
    this.busy.set(true);
    this.clearResult();
    try {
      const root = this.costRootKey();
      const result = await this.service.rollup(root, this.asOfDate(), {
        ...this.workspace.resolutionOptions(),
        plannedQty: { value: this.workspace.plannedQty(), uom: this.workspace.plannedUom() },
        ...(root === COPRODUCT_DATASET.consumerKey && this.jointSourceKey() === COPRODUCT_DATASET.primaryKey ?
          { jointCostSources: { [COPRODUCT_DATASET.ids.coproductRevisionId]: COPRODUCT_DATASET.ids.producerHeaderId } }
        : {})
      });
      if (
        id !== this.requestId ||
        epoch !== this.service.dataEpoch() ||
        revision !== this.service.dataRevision() ||
        !this.ready()
      )
        return;
      this.costResult.set(result);
      this.resultKey.set(key);
      this.workspace.cost.set({ result, key, epoch });
    } catch (error) {
      if (id === this.requestId && epoch === this.service.dataEpoch()) this.costError.set(String(error));
    } finally {
      if (id === this.requestId) this.busy.set(false);
    }
  }

  /** 切换联合生产场景时明确使用其标准批量与计量单位。 */
  changeRoot(root: string): void {
    this.clearResult();
    this.jointSourceKey.set('');
    const uom = this.service.itemUoms().get(root)!;
    const ordinaryQty = this.workspace.plannedUom() === uom ? this.workspace.plannedQty() : '1';
    const plannedQty =
      root === COPRODUCT_DATASET.primaryKey ? '100'
      : root === COPRODUCT_DATASET.consumerKey ? '1'
      : ordinaryQty;
    this.workspace.update({ rootKey: root, plannedQty, plannedUom: uom });
  }

  /** 按需追加联产场景，保留已发布生产头的显式选择。 */
  async loadCoproductDemo(): Promise<void> {
    if (this.busy() || !this.ready() || this.service.resetting()) return;
    const id = ++this.requestId;
    const epoch = this.service.dataEpoch();
    this.busy.set(true);
    this.clearResult();
    try {
      await this.service.loadCoproductDemo();
      if (id !== this.requestId || epoch !== this.service.dataEpoch() || !this.ready()) return;
      this.changeRoot(COPRODUCT_DATASET.primaryKey);
    } catch (error) {
      if (id === this.requestId && epoch === this.service.dataEpoch()) this.costError.set(String(error));
    } finally {
      if (id === this.requestId) this.busy.set(false);
    }
  }
}

/** 层级路径作为行身份，金额与原始字段不做展示舍入。 */
const flattenCost = (
  itemNo: (id: string) => string,
  node: CostNodeDetail,
  currency: string,
  depth = 0,
  path = node.headerId
): CostFlatRow[] => {
  const rows: CostFlatRow[] = [
    {
      key: `${path}/head`,
      depth,
      kind: 'head',
      itemNo: itemNo(node.itemId),
      label: `${materialLabel(itemNo(node.itemId))} · ${depth === 0 ? '产品成本' : '子件成本'}`,
      basis: `批量 ${unitText(node.batchQty)} ${node.baseUom} · 单位 ${currency} ${unitText(node.unitCost)} / ${node.baseUom}`,
      amount: node.batchCost,
      rawFields: [
        { label: '批次成本', value: node.batchCost },
        { label: '单位成本', value: node.unitCost },
        { label: '批量', value: node.batchQty },
        { label: '标准批量', value: node.costLotQty }
      ]
    }
  ];
  if (node.jointCost !== undefined) {
    rows.push({
      key: `${path}/joint-net`,
      depth: depth + 1,
      kind: 'joint-net',
      label: '联合净成本（分配前）',
      basis: '整批投入减去副产抵减',
      amount: node.jointCost.netCost,
      rawFields: [{ label: '分配前净成本', value: node.jointCost.netCost }]
    });
    rows.push(
      ...node.jointCost.outputs.map((output, index) => ({
        key: `${path}/joint-output:${index}`,
        depth: depth + 1,
        kind: 'joint-output' as const,
        itemNo: itemNo(output.itemId),
        label: `${output.kind === 'primary' ? '第一主产物' : '联产品'} ${materialLabel(itemNo(output.itemId))}`,
        basis: `产量 ${unitText(output.qty)} ${output.uom} · 份额 ${unitText(output.share)} · 单位 ${currency} ${unitText(output.unitCost)} / ${output.uom}`,
        amount: output.batchCost,
        rawFields: [
          { label: '批次分摊成本', value: output.batchCost },
          { label: '单位成本', value: output.unitCost },
          { label: '产量', value: output.qty },
          { label: '分配份额', value: output.share }
        ]
      }))
    );
  }
  rows.push(
    ...node.material.map(line => ({
      key: `${path}/material:${line.occurrenceId}`,
      depth: depth + 1,
      kind: 'material' as const,
      itemNo: itemNo(line.childItemId),
      label: `材料 ${materialLabel(itemNo(line.childItemId))}`,
      basis: `需求 ${unitText(line.demand)} ${line.demandUom} × 单位 ${currency} ${unitText(line.unitCost)}`,
      amount: line.amount,
      rawFields: [
        { label: '金额', value: line.amount },
        { label: '需求量', value: line.demand },
        { label: '单位成本', value: line.unitCost }
      ]
    }))
  );
  rows.push(
    ...node.processing.map(line => ({
      key: `${path}/processing:${line.operationSeq}`,
      depth: depth + 1,
      kind: 'processing' as const,
      label: `加工 工序 ${line.operationSeq}`,
      basis: `${unitText(line.rateHours)} ${line.rateUom} × 费率 ${currency} ${unitText(line.rate)} / ${line.rateUom}`,
      amount: line.amount,
      rawFields: [
        { label: '金额', value: line.amount },
        { label: `工时（${line.timeUom}）`, value: line.hours },
        { label: `计费工时（${line.rateUom}）`, value: line.rateHours },
        { label: '费率', value: line.rate }
      ]
    }))
  );
  if (node.overhead !== '0')
    rows.push({
      key: `${path}/overhead`,
      depth: depth + 1,
      kind: 'overhead',
      label: '制费',
      basis: node.overheadReason,
      amount: node.overhead,
      rawFields: [{ label: '金额', value: node.overhead }]
    });
  rows.push(
    ...node.credits.map(line => ({
      key: `${path}/credit:${line.occurrenceId}`,
      depth: depth + 1,
      kind: 'credit' as const,
      itemNo: itemNo(line.childItemId),
      label: `副产抵减 ${materialLabel(itemNo(line.childItemId))}`,
      basis: `产出 ${unitText(line.outQty)} ${line.outUom} × 抵减价 ${currency} ${unitText(line.creditPrice)}`,
      amount: `-${line.amount}`,
      rawFields: [
        { label: '抵减金额', value: `-${line.amount}` },
        { label: '产出量', value: line.outQty },
        { label: '抵减单价', value: line.creditPrice }
      ]
    }))
  );
  node.children.forEach((child, index) => {
    rows.push(...flattenCost(itemNo, child, currency, depth + 1, `${path}/child:${index}`));
  });
  return rows;
};
