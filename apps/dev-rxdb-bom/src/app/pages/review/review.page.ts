import {
  decimalAdd,
  decimalFromCanonical,
  decimalSub,
  decimalToCanonical,
  type CostNodeDetail,
  type ExplosionResult,
  type RequirementLine
} from '@aiao/rxdb-plugin-bom';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BomDemoService } from '../../bom-demo.service';
import { BomWorkspaceState } from '../../bom-workspace-state';
import { StepPanel, type RequirementCalculationBasis } from '../../components/step-panel';
import type { BomChangeReview, BomMaterialChange } from '../../presentation/change-review';
import { formatDecimal } from '../../presentation/decimal-format';
import { materialLabel } from '../../presentation/material-label';

interface ReviewView {
  result: BomChangeReview;
  key: string;
  epoch: number;
  revision: number;
  confirmedAt: string | null;
}

interface CostSource {
  key: string;
  label: string;
  before: string;
  after: string;
  delta: string;
}

/** 将根节点的成本构成对齐；普通子装配的内部明细不重复计入本层。 */
const sourceAmounts = (node: CostNodeDetail): Map<string, { itemId?: string; label: string; amount: string }> => {
  const rows = new Map<string, { itemId?: string; label: string; amount: string }>();
  const add = (key: string, label: string, amount: string, itemId?: string): void => {
    const previous = rows.get(key)?.amount ?? '0';
    rows.set(key, {
      label,
      itemId,
      amount: decimalToCanonical(decimalAdd(decimalFromCanonical(previous), decimalFromCanonical(amount)))
    });
  };
  for (const line of node.material) add(`material:${line.childItemId}`, '材料', line.amount, line.childItemId);
  for (const line of node.processing)
    add(`processing:${line.operationSeq}`, `加工 · 工序 ${line.operationSeq}`, line.amount);
  if (node.overhead !== '0') add('overhead', '制费', node.overhead);
  for (const line of node.credits)
    add(
      `credit:${line.childItemId}`,
      '副产抵减',
      decimalToCanonical(decimalSub(decimalFromCanonical('0'), decimalFromCanonical(line.amount))),
      line.childItemId
    );
  return rows;
};

/** 将生产条件、改版对比和人工核对结论组织成一条可恢复的业务流程。 */
@Component({
  selector: 'bom-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, StepPanel],
  templateUrl: './review.page.html',
  styleUrl: './review.page.scss',
  host: { '(window:online)': 'online.set(true)', '(window:offline)': 'online.set(false)' }
})
export class ReviewPage {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private requestId = 0;
  private pendingKey = '';
  private readonly pendingBasis = new Set<string>();
  readonly service = inject(BomDemoService);
  readonly workspace = inject(BomWorkspaceState);
  readonly ready = this.service.ready;
  readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  readonly selectedEcnId = this.workspace.reviewEcnId;
  readonly phase = signal<'conditions' | 'compare' | 'conclusion'>('conditions');
  readonly detailTab = signal<'materials' | 'cost' | 'conditions'>('materials');
  readonly view = signal<ReviewView | null>(null);
  readonly acknowledged = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly selectedKey = signal('');
  readonly basis = signal<Record<string, RequirementCalculationBasis>>({});
  readonly basisErrors = signal<Record<string, string>>({});
  readonly materialLabel = materialLabel;
  readonly ecnKindLabels = {
    added: '新增需求',
    removed: '停止需求',
    qty_changed: '用量调整',
    child_changed: '替换子件'
  };
  readonly ecnLines = computed(() => this.result()?.diff.headers.flatMap(header => header.entries) ?? []);
  readonly ecns = computed(() => [...this.service.ecns()].map(([id, value]) => ({ id, ...value })));
  readonly selectedEcn = computed(() => this.ecns().find(ecn => ecn.id === this.selectedEcnId()));
  readonly inputKey = computed(() => JSON.stringify([this.selectedEcnId(), this.workspace.context()]));
  readonly result = computed(() => this.view()?.result ?? null);
  readonly stale = computed(() => {
    const view = this.view();
    return (
      view !== null &&
      (view.key !== this.inputKey() ||
        view.epoch !== this.service.dataEpoch() ||
        view.revision !== this.service.dataRevision() ||
        !this.ready())
    );
  });
  readonly caseMismatch = computed(
    () => this.workspace.rootKey() !== 'SC-100' || this.workspace.plannedUom() !== 'pcs'
  );
  readonly canConfirm = computed(
    () =>
      this.view() !== null && this.view()!.confirmedAt === null && !this.stale() && !this.busy() && this.acknowledged()
  );
  readonly canDownload = computed(
    () => this.view()?.confirmedAt != null && this.acknowledged() && !this.stale() && !this.busy()
  );
  readonly selectedChange = computed(() => this.result()?.changes.find(row => row.key === this.selectedKey()) ?? null);
  readonly configLabel = computed(() =>
    Object.entries(this.workspace.configSelection())
      .map(([key, values]) => `${key}：${values.join('、')}`)
      .join('；')
  );
  readonly costSources = computed<CostSource[]>(() => {
    const result = this.result();
    if (!result) return [];
    const before = sourceAmounts(result.before.cost.root);
    const after = sourceAmounts(result.after.cost.root);
    return [...new Set([...before.keys(), ...after.keys()])].map(key => {
      const source = after.get(key) ?? before.get(key)!;
      const beforeAmount = before.get(key)?.amount ?? '0';
      const afterAmount = after.get(key)?.amount ?? '0';
      return {
        key,
        label: source.itemId ? `${source.label} · ${this.itemLabel(source.itemId)}` : source.label,
        before: beforeAmount,
        after: afterAmount,
        delta: decimalToCanonical(decimalSub(decimalFromCanonical(afterAmount), decimalFromCanonical(beforeAmount)))
      };
    });
  });

  constructor() {
    const requestedEcn = this.route.snapshot.queryParamMap.get('ecn');
    if (requestedEcn !== null) this.selectedEcnId.set(requestedEcn);
    inject(DestroyRef).onDestroy(() => this.requestId++);
    effect(() => {
      const ecns = this.ecns();
      if (untracked(this.selectedEcnId)) return;
      const example = ecns.find(ecn => ecn.ecnNo === 'ECN-2026-014');
      if (example) this.selectedEcnId.set(example.id);
    });
    effect(() => {
      const key = this.inputKey();
      if (this.pendingKey && this.pendingKey !== key) {
        this.requestId++;
        this.pendingKey = '';
        this.busy.set(false);
      }
      const view = untracked(this.view);
      if (view && view.key !== key) this.acknowledged.set(false);
    });
    effect(() => {
      const ready = this.ready();
      const resetting = this.service.resetting();
      const epoch = this.service.dataEpoch();
      const revision = this.service.dataRevision();
      const view = untracked(this.view);
      if (view && view.revision !== revision) this.acknowledged.set(false);
      if (ready && !resetting && (!view || view.epoch === epoch)) return;
      this.requestId++;
      this.pendingKey = '';
      this.view.set(null);
      this.busy.set(false);
      this.acknowledged.set(false);
      this.phase.set('conditions');
    });
  }

  /** 显式载入案例条件，保留数据库中的所有已有业务记录。 */
  loadCase(): void {
    this.workspace.update({
      rootKey: 'SC-100',
      asOfDate: '2026-10-01',
      plannedQty: '10',
      plannedUom: 'pcs',
      unit: 137,
      lot: '',
      alternativeNo: null,
      configSelection: { 颜色: ['红'] },
      substituteSelections: {}
    });
    const example = this.ecns().find(ecn => ecn.ecnNo === 'ECN-2026-014');
    this.selectedEcnId.set(example?.id ?? '');
    this.view.set(null);
    this.acknowledged.set(false);
    this.phase.set('conditions');
    this.error.set('');
  }

  /** 条件与数据版本共同绑定结果，迟到的旧请求不再更新当前任务。 */
  async runReview(): Promise<void> {
    if (this.busy() || !this.ready() || this.service.resetting()) return;
    this.error.set('');
    const ecn = this.selectedEcn();
    if (!ecn || ecn.state !== 'released') {
      this.error.set('请选择一张已发布的变更单。');
      return;
    }
    if (this.caseMismatch()) {
      this.error.set('这份案例使用 SC-100 整机与 pcs 计划单位，请先载入案例条件。');
      return;
    }
    this.workspace.asOfDate.set(ecn.effectiveDate);
    if (this.workspace.validationError()) {
      this.error.set(this.workspace.validationError());
      return;
    }
    const context = structuredClone(this.workspace.context());
    const key = this.inputKey();
    const id = ++this.requestId;
    const epoch = this.service.dataEpoch();
    const revision = this.service.dataRevision();
    this.pendingKey = key;
    this.busy.set(true);
    this.acknowledged.set(false);
    this.view.set(null);
    this.phase.set('conditions');
    this.basis.set({});
    this.basisErrors.set({});
    void this.router.navigate([], {
      queryParams: { ...this.workspace.queryParams(), ecn: ecn.id },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    try {
      const result = await this.service.reviewChange(ecn.id, context);
      if (
        id !== this.requestId ||
        key !== this.inputKey() ||
        epoch !== this.service.dataEpoch() ||
        revision !== this.service.dataRevision() ||
        !this.ready()
      )
        return;
      this.workspace.asOfDate.set(result.afterDate);
      this.pendingKey = this.inputKey();
      this.view.set({ result, key: this.inputKey(), epoch, revision, confirmedAt: null });
      this.selectedKey.set(result.changes[0]?.key ?? '');
      this.detailTab.set('materials');
      this.phase.set('compare');
      this.focusResult('review-result-title');
    } catch (error) {
      if (id === this.requestId && epoch === this.service.dataEpoch()) this.error.set(String(error));
    } finally {
      if (id === this.requestId) {
        this.busy.set(false);
        this.pendingKey = '';
      }
    }
  }

  complete(): void {
    if (!this.canConfirm()) return;
    this.view.update(view => (view ? { ...view, confirmedAt: new Date().toISOString() } : null));
    this.phase.set('conclusion');
    this.focusResult('review-conclusion-title');
  }

  updateAcknowledgement(value: boolean): void {
    this.acknowledged.set(value);
    if (value || this.view()?.confirmedAt == null) return;
    this.view.update(view => (view ? { ...view, confirmedAt: null } : null));
    this.phase.set('compare');
  }

  download(): void {
    const view = this.view();
    if (!view || !this.canDownload()) return;
    const result = view.result;
    const report = {
      kind: 'bom-change-review',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      ecn: { id: result.ecnId, ecnNo: result.ecnNo, beforeDate: result.beforeDate, afterDate: result.afterDate },
      context: result.context,
      beforeAfterCosts: {
        currency: result.after.cost.context.currency,
        before: result.before.cost.root.batchCost,
        after: result.after.cost.root.batchCost,
        delta: result.costDelta
      },
      changeRows: result.changes.map(row => ({
        key: row.key,
        itemId: row.itemId,
        itemNo: this.service.itemNos().get(row.itemId),
        uom: row.uom,
        beforeQty: row.beforeQty,
        afterQty: row.afterQty,
        delta: row.delta,
        kind: row.kind,
        paths: { before: row.beforeLines.map(line => line.path), after: row.afterLines.map(line => line.path) },
        beforeLines: row.beforeLines.map(({ itemId, revisionId, qty, uom, path }) => ({
          itemId,
          revisionId,
          qty,
          uom,
          path
        })),
        afterLines: row.afterLines.map(({ itemId, revisionId, qty, uom, path }) => ({
          itemId,
          revisionId,
          qty,
          uom,
          path
        }))
      })),
      revisions: result.revisions,
      costSources: this.costSources(),
      comparisonScope: 'effective-structure-snapshots',
      ecnDiff: result.diff,
      manifests: { before: result.before.explosion.manifest, after: result.after.explosion.manifest },
      confirmedAt: view.confirmedAt
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${result.context.rootKey}-${result.ecnNo}-核对摘要.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  itemLabel(id: string): string {
    return materialLabel(this.service.itemNos().get(id) ?? id);
  }
  revisionLabel(line: RequirementLine): string {
    if (line.revisionId === null) return '未限定修订';
    const revision = this.result()?.revisions[line.revisionId];
    if (!revision) return '修订信息未载入';
    return `${revision.revisionNo}${revision.effectiveFrom ? ` · 生效 ${revision.effectiveFrom.slice(0, 10)}` : ''}`;
  }
  basisKey(line: RequirementLine): string {
    return JSON.stringify([line.path, line.revisionId]);
  }
  async loadBasis(line: RequirementLine, event: Event): Promise<void> {
    if (!(event.target as HTMLDetailsElement).open || this.stale()) return;
    const view = this.view();
    const key = this.basisKey(line);
    if (!view || this.basis()[key] || this.pendingBasis.has(key)) return;
    this.pendingBasis.add(key);
    this.basisErrors.update(errors => ({ ...errors, [key]: '' }));
    try {
      const basis = await this.service.readCalculationBasis(line);
      const current = this.view();
      if (
        current?.key === view.key &&
        current.epoch === view.epoch &&
        current.revision === view.revision &&
        !this.stale()
      )
        this.basis.update(values => ({ ...values, [key]: basis }));
    } catch (error) {
      const current = this.view();
      if (
        current?.key === view.key &&
        current.epoch === view.epoch &&
        current.revision === view.revision &&
        !this.stale()
      )
        this.basisErrors.update(errors => ({ ...errors, [key]: String(error) }));
    } finally {
      this.pendingBasis.delete(key);
    }
  }
  amount(value: string): string {
    return formatDecimal(value, { fractionDigits: 2 });
  }
  quantity(value: string): string {
    return formatDecimal(value, { fractionDigits: 6, trimTrailingZeros: true });
  }
  difference(value: string, money = false): string {
    const formatted = money ? this.amount(value) : this.quantity(value);
    return value !== '0' && !value.startsWith('-') ? `+${formatted}` : formatted;
  }
  changeLabel(row: BomMaterialChange): string {
    if (row.kind === 'added') return '新增备料';
    if (row.kind === 'removed') return '停止使用';
    return row.delta === '0' ? '修订变化' : '用量变化';
  }
  paths(line: RequirementLine, result: ExplosionResult): string {
    const nodes = new Map(result.requirementLines.map(row => [row.path.join('>'), row.itemId]));
    for (const row of result.penetrations) nodes.set(row.path.join('>'), row.childItemId);
    const labels = line.path
      .map((_, index) => nodes.get(line.path.slice(0, index + 1).join('>')))
      .filter((id): id is string => id !== undefined);
    return [materialLabel(this.view()!.result.context.rootKey), ...labels.map(id => this.itemLabel(id))].join(' → ');
  }
  detailParams(date: string, itemNo?: string): Record<string, string> {
    const result = this.view()!.result;
    const context = result.context;
    return {
      root: context.rootKey,
      date,
      qty: context.plannedQty,
      uom: context.plannedUom,
      unit: context.unit === null ? 'none' : String(context.unit),
      lot: context.lot,
      alternative: context.alternativeNo === null ? '' : String(context.alternativeNo),
      config: JSON.stringify(context.configSelection),
      substitutes: JSON.stringify(context.substituteSelections),
      ecn: result.ecnId,
      item: itemNo ?? context.rootKey,
      guide: '0',
      costSource: ''
    };
  }

  private focusResult(id: string): void {
    const key = this.view()?.key;
    afterNextRender(
      () => {
        if (this.view()?.key !== key || this.stale()) return;
        const heading = this.element.nativeElement.querySelector<HTMLElement>(`#${id}`);
        if (!heading) return;
        heading.focus();
        heading.scrollIntoView({ block: 'start' });
      },
      { injector: this.injector }
    );
  }
}
