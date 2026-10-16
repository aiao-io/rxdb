import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';
import { LineList } from './line-list';

/**
 * ECN 变更管理面板：ECN 选择 + 影响面/差异查询 + 现场 ECN 新建/取消演示。
 * overview（验收面板）与 timeline（时间轴页）两处复用。
 * testid：ecn-select / ecn-impact-line / ecn-diff-line / ecn-action-result。
 */
@Component({
  selector: 'bom-ecn-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LineList],
  template: `
    <section class="panel">
      <div class="panel-head">
        <h2>ECN 变更管理（US-525 AC#10~#12）</h2>
        <p class="panel-desc">
          选择一张 ECN 查影响面（整机与命中路径）与差异（新增/删除/改量/改版）；现场 ECN 演示发布与取消窗口。
        </p>
      </div>
      <div class="toolbar">
        <label for="ecn-select">选择 ECN：</label>
        <select id="ecn-select" [(ngModel)]="selectedEcnId" data-testid="ecn-select">
          <option [ngValue]="null">—</option>
          @for (entry of ecns().values(); track entry.ecnNo) {
            <option [attr.data-state]="entry.state" [ngValue]="ecnsKey(entry.ecnNo)">
              {{ entry.ecnNo }}（{{ entry.state }}，{{ entry.effectiveDate }}）
            </option>
          }
        </select>
        <button class="btn" [disabled]="busy() || !ready() || !selectedEcnId()" (click)="runEcnImpact()">
          {{ busy() ? '处理中…' : '查影响面' }}
        </button>
        <button class="btn" [disabled]="busy() || !ready() || !selectedEcnId()" (click)="runEcnDiff()">
          {{ busy() ? '处理中…' : '查差异' }}
        </button>
      </div>
      <div class="toolbar">
        <button class="btn" [disabled]="busy() || !ready()" (click)="runCreateAndReleaseEcn()">
          {{ busy() ? '处理中…' : '现场新建并发布 ECN（改 3 张 BOM 5 行）' }}
        </button>
        <button class="btn" [disabled]="busy() || !ready()" (click)="runCancelLiveEcn()">取消现场 ECN</button>
        <button class="btn btn-danger" [disabled]="busy() || !ready()" (click)="runCancelEffectiveEcn()">
          对已生效种子 ECN 点取消
        </button>
      </div>
      @if (ecnActionResult()) {
        <div class="error-box" data-testid="ecn-action-result">{{ ecnActionResult() }}</div>
      }
      <h3 class="result-title">影响面</h3>
      <bom-line-list [lines]="impactLines()" emptyText="选中 ECN 后点击「查影响面」。" testId="ecn-impact-line" />
      <h3 class="result-title">差异</h3>
      <bom-line-list [lines]="diffLines()" emptyText="选中 ECN 后点击「查差异」。" testId="ecn-diff-line" />
    </section>
  `
})
export class EcnPanel {
  private readonly service = inject(BomDemoService);

  readonly ready = this.service.ready;
  readonly ecns = this.service.ecns;
  readonly selectedEcnId = signal<string | null>(null);
  readonly impactLines = signal<string[]>([]);
  readonly diffLines = signal<string[]>([]);
  readonly ecnActionResult = signal('');
  readonly busy = signal(false);

  constructor() {
    // 重置种子（ready 翻转为真）后清空 ECN 选择与查询结果（旧 ecnId 已随清库失效）
    effect(() => {
      if (this.service.ready()) {
        this.selectedEcnId.set(null);
        this.impactLines.set([]);
        this.diffLines.set([]);
        this.ecnActionResult.set('');
      }
    });
  }

  /** ecnNo → ecnId 反查（ECN 下拉的 option 值）。 */
  ecnsKey(ecnNo: string): string {
    for (const [id, entry] of this.ecns().entries()) {
      if (entry.ecnNo === ecnNo) return id;
    }
    return ecnNo;
  }

  itemNo(itemId: string): string {
    return this.service.itemNos().get(itemId) ?? itemId.slice(0, 8);
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
}
