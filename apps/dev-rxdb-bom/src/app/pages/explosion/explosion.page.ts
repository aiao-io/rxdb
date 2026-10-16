import type { CostNodeDetail, ExplosionResult, PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { goldenItemId } from '@aiao/rxdb-plugin-bom/testing';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../../bom-demo.service';

/** 一次展开的页面状态（信号集）。 */
interface ExplosionView {
  result: ExplosionResult;
  selected: RequirementLine | null;
}

/** 双图并排视图（US-525 AC#13：EBOM / MBOM 各自展开）。 */
interface DualView {
  ebom: ExplosionResult;
  mbom: ExplosionResult;
}

/** 卷算明细的扁平行（模板无递归，逐层缩进展示）。 */
interface CostFlatRow {
  depth: number;
  label: string;
  kind: 'head' | 'material' | 'processing' | 'overhead' | 'credit';
  itemNo?: string;
  amount?: string;
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
  readonly rootKey = signal('SC-100');
  readonly substituteResult = signal('');
  readonly busy = signal(false);
  readonly ecns = this.service.ecns;
  readonly selectedEcnId = signal<string | null>(null);
  readonly impactLines = signal<string[]>([]);
  readonly diffLines = signal<string[]>([]);
  readonly ecnActionResult = signal('');
  readonly dualView = signal<DualView | null>(null);
  readonly coverageLines = signal<string[]>([]);
  readonly gapLines = signal<string[]>([]);
  readonly costRows = signal<CostFlatRow[]>([]);
  readonly costError = signal('');
  readonly costRootKey = signal('SC-100');

  ngOnInit(): void {
    // 页面重载走既有库路径：连接即安装插件触发器（幂等），种子行原样可用
    void this.service.connectExisting().catch(() => undefined);
  }

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  /** ecnNo → ecnId 反查（ECN 下拉的 option 值）。 */
  ecnsKey(ecnNo: string): string {
    for (const [id, entry] of this.ecns().entries()) {
      if (entry.ecnNo === ecnNo) return id;
    }
    return ecnNo;
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
        result.nodes.map(
          node => `${node.path.length} 跳：${node.path.slice(0, 8).join(' → ')}（${this.itemNo(node.itemId)}）`
        )
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
      const result = await this.service.explode(this.asOfDate(), this.plannedQty(), this.rootKey());
      this.view.set({ result, selected: null });
    } catch (error) {
      this.rawResult.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  async runSubstituteDemo(): Promise<void> {
    this.busy.set(true);
    try {
      this.substituteResult.set(await this.service.demoSubstitutePublishRejection());
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

  /** 选中 ECN 并查影响面（AC#1 / US-525 AC#11）。 */
  async runEcnImpact(): Promise<void> {
    const ecnId = this.selectedEcnId();
    if (!ecnId) return;
    this.busy.set(true);
    try {
      const impact = await this.service.ecnImpact(ecnId);
      this.impactLines.set([
        `被改物料：${impact.affectedItemIds.map(id => this.itemNo(id)).join('、') || '（无）'}`,
        `受影响整机：${impact.topItems.map(top => this.itemNo(top.itemId)).join('、') || '（无）'}`,
        ...impact.topItems.flatMap(top =>
          top.paths.map(path => `路径 ${this.itemNo(top.itemId)}：${path.slice(0, 8).join(' → ')}`)
        )
      ]);
    } catch (error) {
      this.impactLines.set([String(error)]);
    } finally {
      this.busy.set(false);
    }
  }

  /** 查差异（AC#2 / US-525 AC#11）：新增 / 删除 / 改量 / 改版四类。 */
  async runEcnDiff(): Promise<void> {
    const ecnId = this.selectedEcnId();
    if (!ecnId) return;
    this.busy.set(true);
    try {
      const diff = await this.service.ecnDiff(ecnId);
      const kindLabel: Record<string, string> = {
        added: '新增',
        removed: '删除（截止）',
        qty_changed: '改量',
        child_changed: '改版'
      };
      this.diffLines.set(
        diff.headers.flatMap(header =>
          header.entries.map(
            entry =>
              `${kindLabel[entry.kind] ?? entry.kind}：行 ${entry.lineNo} ` +
              `${entry.before?.qty ?? '—'}${entry.kind === 'child_changed' ? `（${this.itemNo(entry.before?.childItemId ?? '')}）` : ''} → ` +
              `${entry.after?.qty ?? '—'}${entry.kind === 'child_changed' ? `（${this.itemNo(entry.after?.childItemId ?? '')}）` : ''}`
          )
        )
      );
    } catch (error) {
      this.diffLines.set([String(error)]);
    } finally {
      this.busy.set(false);
    }
  }

  /** 现场新建并发布 ECN（US-525 AC#12 ① 的前半段）。 */
  async runCreateAndReleaseEcn(): Promise<void> {
    this.busy.set(true);
    try {
      const error = await this.service.demoCreateAndReleaseEcn();
      this.ecnActionResult.set(error || '发布成功（现场 ECN 已就位，可取消演示整体回退）');
    } finally {
      this.busy.set(false);
    }
  }

  /** 取消现场 ECN（US-525 AC#12 ①）：未生效 → 5 行整体回退。 */
  async runCancelLiveEcn(): Promise<void> {
    this.busy.set(true);
    try {
      const error = await this.service.demoCancelLiveEcn();
      this.ecnActionResult.set(error || '取消成功：现场 ECN 的 5 行整体回退（无部分生效中间态）');
    } finally {
      this.busy.set(false);
    }
  }

  /** 对已生效的种子 ECN 点取消（US-525 AC#12 ②）：拒绝。 */
  async runCancelEffectiveEcn(): Promise<void> {
    this.busy.set(true);
    try {
      this.ecnActionResult.set(await this.service.demoCancelEffectiveEcn());
    } finally {
      this.busy.set(false);
    }
  }

  /** 双图并排展开（US-525 AC#13）：EBOM / MBOM 两张图同评估日。 */
  async runDualExplode(): Promise<void> {
    this.busy.set(true);
    try {
      this.dualView.set(await this.service.dualExplode(this.asOfDate()));
    } catch (error) {
      this.coverageLines.set([String(error)]);
    } finally {
      this.busy.set(false);
    }
  }

  /** 覆盖率查询（US-516 AC#5/#6）：已覆盖 / 未覆盖 / 失效三段。 */
  async runCoverage(): Promise<void> {
    this.busy.set(true);
    try {
      const coverage = await this.service.mapCoverage(this.asOfDate());
      this.coverageLines.set([
        ...coverage.covered.map(
          entry => `已覆盖：${this.itemNo(entry.lineId)}（路径 ${entry.pathKey.split('>').slice(0, 8).join(' → ')}）`
        ),
        ...coverage.uncovered.flatMap(entry =>
          entry.paths.map(path => `未覆盖：${this.itemNo(entry.lineId)}（路径 ${path.slice(0, 8).join(' → ')}）`)
        ),
        ...coverage.invalid.map(entry => `失效映射：${entry.reason}`)
      ]);
    } catch (error) {
      this.coverageLines.set([String(error)]);
    } finally {
      this.busy.set(false);
    }
  }

  /** 跟进缺口查询（US-516 AC#16~#22）：解析步骤集合比对点名。 */
  async runGaps(): Promise<void> {
    this.busy.set(true);
    try {
      const gaps = await this.service.mapGaps(this.asOfDate());
      this.gapLines.set(
        gaps.gaps.map(gap => {
          if (gap.undecidable !== null) return `无法判定：${gap.undecidable.reason}`;
          const diff =
            gap.differences
              .map(
                entry =>
                  `${entry.kind === 'missing' ? '消失' : '变化'}：${entry.baseline.lineId.slice(0, 8)} → ${entry.current?.lineId.slice(0, 8) ?? '—'}`
              )
              .join('；') || '（无差异）';
          const appeared = gap.appeared.length > 0 ? `；新出现：${gap.appeared.join('、')}` : '';
          return `映射 ${gap.mappingId.slice(0, 8)}：${diff}${appeared}`;
        })
      );
    } catch (error) {
      this.gapLines.set([String(error)]);
    } finally {
      this.busy.set(false);
    }
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

  /** 七步算式面板的展示行（第 5 步未交付占位）。 */
  stepRows(): { label: string; value: string; uom: string; source: string }[] {
    const line = this.view()?.selected;
    if (!line) return [];
    const steps = line.steps;
    const phantomSource =
      steps.phantom.source === 'override' ? '行级 phantom_override'
      : steps.phantom.source === 'revision' ? '修订级 default_phantom'
      : '均未声明（按实体件）';
    const rows = [
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
    return rows;
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
