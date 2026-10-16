import type { CostNodeDetail } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';

/** 卷算明细的扁平行（模板无递归，逐层缩进展示）。 */
interface CostFlatRow {
  depth: number;
  label: string;
  kind: 'head' | 'material' | 'processing' | 'overhead' | 'credit';
  itemNo?: string;
  amount?: string;
}

/**
 * 成本卷算面板：逐层明细树 + 缺成本整体报缺失。
 * overview（验收面板）与 cost（成本卷算页）两处复用。
 * testid：cost-root-select / cost-error；行面 .cost-row[data-kind] / [data-amount]。
 */
@Component({
  selector: 'bom-cost-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="panel">
      <div class="panel-head">
        <h2>成本卷算（US-525 AC#14 / #15）</h2>
        <p class="panel-desc">
          逐层卷算明细树：材料/加工/制费/副产抵减分列，金额为规范十进制串；缺成本整体报缺失，不以 0 兜底。
        </p>
      </div>
      <div class="toolbar">
        <label>
          卷算根
          <select [(ngModel)]="costRootKey" data-testid="cost-root-select">
            <option value="SC-100">SC-100</option>
            <option value="COST-DEMO">COST-DEMO（故意缺成本）</option>
          </select>
        </label>
        <button class="btn btn-primary" [disabled]="busy() || !ready()" (click)="runRollup()">
          {{ busy() ? '处理中…' : '卷算' }}
        </button>
      </div>
      @if (costError()) {
        <div class="error-box" data-testid="cost-error">{{ costError() }}</div>
      }
      @if (costRows().length === 0 && !costError()) {
        <div class="empty-state">点击「卷算」查看成本明细树（材料/加工/制费/抵减）。</div>
      }
      @for (row of costRows(); track row.label + row.kind) {
        <div
          class="cost-row"
          [attr.data-item]="row.itemNo"
          [attr.data-kind]="row.kind"
          [style.paddingLeft.px]="8 + row.depth * 20"
        >
          <span class="label">{{ row.label }}</span>
          @if (row.amount !== undefined) {
            <span class="qty" [attr.data-amount]="row.amount">{{ row.amount }}</span>
          }
        </div>
      }
    </section>
  `
})
export class CostPanel {
  private readonly service = inject(BomDemoService);

  readonly asOfDate = input.required<string>();
  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly costRootKey = signal('SC-100');
  readonly costRows = signal<CostFlatRow[]>([]);
  readonly costError = signal('');
  readonly busy = signal(false);

  constructor() {
    // 重置种子（ready 翻转为真）后清空卷算结果（旧明细树对新种子无意义）
    effect(() => {
      if (this.service.ready()) {
        this.costRows.set([]);
        this.costError.set('');
      }
    });
  }

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  /** 卷算（US-525 AC#14/#15）：明细树拍平逐层展示；缺成本整体报缺失。 */
  async runRollup(): Promise<void> {
    this.busy.set(true);
    this.costError.set('');
    try {
      const result = await this.service.rollup(this.costRootKey(), this.asOfDate());
      this.costRows.set(flattenCost(this.itemNo.bind(this), result.root));
    } catch (error) {
      this.costRows.set([]);
      this.costError.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }
}

/** 卷算明细树拍平（模板无递归）：头节点 + 材料/加工/制费/抵减行，逐层缩进。 */
const flattenCost = (itemNo: (id: string) => string, node: CostNodeDetail, depth = 0): CostFlatRow[] => {
  const rows: CostFlatRow[] = [
    {
      depth,
      kind: 'head',
      itemNo: itemNo(node.itemId),
      label: `批次 ${node.batchCost}（${node.batchQty} ${node.baseUom}）· 单位 ${node.unitCost}`,
      amount: node.batchCost
    }
  ];
  for (const line of node.material) {
    rows.push({
      depth: depth + 1,
      kind: 'material',
      itemNo: itemNo(line.childItemId),
      label: `材料 ${itemNo(line.childItemId)}：需求 ${line.demand} ${line.demandUom} × 单位 ${line.unitCost}`,
      amount: line.amount
    });
  }
  for (const line of node.processing) {
    rows.push({
      depth: depth + 1,
      kind: 'processing',
      label: `加工 工序 ${line.operationSeq}：${line.hours} ${line.timeUom} × 费率 ${line.rate}`,
      amount: line.amount
    });
  }
  if (node.overhead !== '0') {
    rows.push({ depth: depth + 1, kind: 'overhead', label: `制费（${node.overheadReason}）`, amount: node.overhead });
  }
  for (const line of node.credits) {
    rows.push({
      depth: depth + 1,
      kind: 'credit',
      itemNo: itemNo(line.childItemId),
      label: `副产抵减 ${itemNo(line.childItemId)}：${line.outQty} ${line.outUom} × ${line.creditPrice}`,
      amount: `-${line.amount}`
    });
  }
  for (const child of node.children) {
    rows.push(...flattenCost(itemNo, child, depth + 1));
  }
  return rows;
};
