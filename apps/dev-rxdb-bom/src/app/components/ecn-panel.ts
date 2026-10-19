import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';
import { materialLabel } from '../presentation/material-label';
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
        <h2>查看变更影响</h2>
        <p class="panel-desc">选择一张变更单，先看影响哪些整机，再核对新增、删除、改量和改版的明细。</p>
      </div>
      <div class="toolbar">
        <label>
          变更单
          <select [(ngModel)]="selectedEcnId" [disabled]="busy() || !ready()" data-testid="ecn-select">
            <option [ngValue]="null">请选择变更单</option>
            @for (entry of ecns().values(); track entry.ecnNo) {
              <option [attr.data-state]="entry.state" [ngValue]="ecnsKey(entry.ecnNo)">
                {{ entry.ecnNo }}（{{ entry.state }}，{{ entry.effectiveDate }}）
              </option>
            }
          </select>
        </label>
        <button class="btn btn-primary" [disabled]="busy() || !ready() || !selectedEcnId()" (click)="runEcnImpact()">
          {{ busy() ? '处理中…' : '查影响面' }}
        </button>
        <button class="btn" [disabled]="busy() || !ready() || !selectedEcnId()" (click)="runEcnDiff()">
          {{ busy() ? '处理中…' : '查差异' }}
        </button>
      </div>
      @if (queryError()) {
        <div class="error-box" role="alert">变更查询未完成。请核对变更单后重试。</div>
        <details class="details-panel">
          <summary>查看错误详情</summary>
          <pre>{{ queryError() }}</pre>
        </details>
      }
      @if (selectedEcn(); as selected) {
        <p class="hint" role="status">
          当前对象：{{ selected.ecnNo }} · {{ selected.effectiveDate }}；下方查询与取消均针对这张变更单。
        </p>
      }
      <h3 class="result-title">受影响的物料与整机</h3>
      <bom-line-list
        [lines]="impactLines().slice(0, 2)"
        emptyText="选中变更单后点击「查影响面」，查看涉及哪些物料和整机。"
        testId="ecn-impact-line"
      />
      @if (impactLines().length > 2) {
        <details class="details-panel">
          <summary>查看受影响整机的路径记录</summary>
          <bom-line-list [lines]="impactLines().slice(2)" testId="ecn-impact-line" />
        </details>
      }
      <h3 class="result-title">变更明细</h3>
      <bom-line-list
        [emptyText]="diffLoaded() ? '该变更单没有可展示的差异。' : '点击「查差异」，逐项核对变更前后的内容。'"
        [lines]="diffLines()"
        testId="ecn-diff-line"
      />
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>发布与取消变更</h2>
        <p class="panel-desc">
          新建示例会修改 3 张物料清单的 5 行；取消操作始终针对上方选中的变更单，成功后重新核对影响和差异。
        </p>
      </div>
      <div class="toolbar">
        <button class="btn" [disabled]="busy() || !ready()" (click)="runCreateAndReleaseEcn()">
          {{ busy() ? '处理中…' : '现场新建并发布 ECN（改 3 张 BOM 5 行）' }}
        </button>
        <button
          class="btn btn-danger"
          [disabled]="busy() || !ready() || !selectedEcnId() || selectedEcn()?.state === 'cancelled'"
          (click)="runCancelSelectedEcn()"
          data-testid="ecn-cancel-selected"
        >
          取消当前变更单{{ selectedEcn() ? ' · ' + selectedEcn()!.ecnNo : '' }}
        </button>
      </div>
      @if (ecnActionResult()) {
        <div data-testid="ecn-action-result" role="status">
          @if (ecnActionResult().startsWith('发布成功') || ecnActionResult().startsWith('取消成功')) {
            <p class="hint">{{ ecnActionResult() }}</p>
          } @else {
            <div class="error-box">操作未完成。请展开详情核对原因后重试。</div>
            <details class="details-panel">
              <summary>查看操作详情</summary>
              <pre>{{ ecnActionResult() }}</pre>
            </details>
          }
        </div>
      }
      <details class="details-panel">
        <summary>验证已生效变更的保护规则</summary>
        <p class="panel-desc">已生效的变更不能直接取消。下面的示例会展示拒绝原因，后续调整应另建更正变更单。</p>
        <button class="btn" [disabled]="busy() || !ready()" (click)="runCancelEffectiveEcn()">
          对已生效种子 ECN 点取消
        </button>
      </details>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      min-width: 0;
      gap: 24px;
    }

    .btn {
      max-width: 100%;
      white-space: normal;
    }

    .details-panel {
      margin-top: 16px;
    }
  `
})
export class EcnPanel {
  private readonly service = inject(BomDemoService);
  private request = 0;

  readonly ready = this.service.ready;
  readonly ecns = this.service.ecns;
  readonly selectedEcnId = signal<string | null>(null);
  readonly selectedEcn = computed(() => this.ecns().get(this.selectedEcnId() ?? '') ?? null);
  readonly queryEcnId = signal<string | null>(null);
  readonly impactLines = signal<string[]>([]);
  readonly diffLines = signal<string[]>([]);
  readonly ecnActionResult = signal('');
  readonly busy = signal(false);
  readonly queryError = signal('');
  readonly diffLoaded = signal(false);

  constructor() {
    effect(() => {
      this.service.dataEpoch();
      this.service.ready();
      this.service.resetting();
      this.request += 1;
      this.selectedEcnId.set(null);
      this.clearQuery();
      this.ecnActionResult.set('');
      this.busy.set(false);
    });
    effect(() => {
      const selected = this.selectedEcnId();
      if (this.queryEcnId() === selected) return;
      this.clearQuery();
      this.queryEcnId.set(selected);
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

  itemLabel(itemId: string): string {
    return materialLabel(this.itemNo(itemId));
  }

  /** 选中 ECN 并查影响面（AC#1 / US-525 AC#11）。 */
  async runEcnImpact(): Promise<void> {
    const ecnId = this.selectedEcnId();
    if (!ecnId || this.busy() || !this.ready()) return;
    const current = this.beginRequest();
    this.prepareQuery(ecnId);
    this.impactLines.set([]);
    this.queryError.set('');
    try {
      const impact = await this.service.ecnImpact(ecnId);
      if (!current() || this.selectedEcnId() !== ecnId) return;
      this.impactLines.set([
        `被改物料：${impact.affectedItemIds.map(id => this.itemLabel(id)).join('、') || '（无）'}`,
        `受影响整机：${impact.topItems.map(top => this.itemLabel(top.itemId)).join('、') || '（无）'}`,
        ...impact.topItems.flatMap(top =>
          top.paths.map(path => `路径 ${this.itemLabel(top.itemId)}：${path.slice(0, 8).join(' → ')}`)
        )
      ]);
    } catch (error) {
      if (current() && this.selectedEcnId() === ecnId) {
        this.clearQuery();
        this.queryError.set(String(error));
      }
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 查差异（AC#2 / US-525 AC#11）：新增 / 删除 / 改量 / 改版四类。 */
  async runEcnDiff(): Promise<void> {
    const ecnId = this.selectedEcnId();
    if (!ecnId || this.busy() || !this.ready()) return;
    const current = this.beginRequest();
    this.prepareQuery(ecnId);
    this.diffLines.set([]);
    this.diffLoaded.set(false);
    this.queryError.set('');
    try {
      const diff = await this.service.ecnDiff(ecnId);
      if (!current() || this.selectedEcnId() !== ecnId) return;
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
              `${entry.before?.qty ?? '—'}${entry.kind === 'child_changed' ? `（${this.itemLabel(entry.before?.childItemId ?? '')}）` : ''} → ` +
              `${entry.after?.qty ?? '—'}${entry.kind === 'child_changed' ? `（${this.itemLabel(entry.after?.childItemId ?? '')}）` : ''}`
          )
        )
      );
      this.diffLoaded.set(true);
    } catch (error) {
      if (current() && this.selectedEcnId() === ecnId) {
        this.clearQuery();
        this.queryError.set(String(error));
      }
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 时间轴选中与查询共用同一对象，顺序读取时保留两组结果。 */
  async inspectEcn(ecnId: string): Promise<void> {
    if (this.busy() || !this.ready()) return;
    const epoch = this.service.dataEpoch();
    this.selectedEcnId.set(ecnId);
    this.queryEcnId.set(ecnId);
    this.clearQuery();
    await this.runEcnImpact();
    if (
      epoch === this.service.dataEpoch() &&
      this.selectedEcnId() === ecnId &&
      this.ready() &&
      !this.service.resetting() &&
      !this.queryError()
    )
      await this.runEcnDiff();
  }

  /** 现场新建并发布 ECN（US-525 AC#12 ① 的前半段）。 */
  async runCreateAndReleaseEcn(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    const current = this.beginRequest();
    this.ecnActionResult.set('');
    try {
      const error = await this.service.demoCreateAndReleaseEcn();
      if (!current()) return;
      this.ecnActionResult.set(error || '发布成功（现场 ECN 已就位，可取消演示整体回退）');
      const ecnId = this.service.liveEcnId();
      if (error || !ecnId) return;
      this.busy.set(false);
      await this.inspectEcn(ecnId);
    } catch (error) {
      if (current()) this.ecnActionResult.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 取消现场 ECN（US-525 AC#12 ①）：未生效 → 5 行整体回退。 */
  async runCancelLiveEcn(): Promise<void> {
    if (!window.confirm('取消现场 ECN 将整体撤回 3 张物料清单的 5 行变更。确认取消？')) return;
    if (this.busy() || !this.ready()) return;
    const current = this.beginRequest();
    try {
      const error = await this.service.demoCancelLiveEcn();
      if (!current()) return;
      this.ecnActionResult.set(error || '取消成功：现场 ECN 的 5 行整体回退（无部分生效中间态）');
    } catch (error) {
      if (current()) this.ecnActionResult.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 取消所选变更后回读同一张单据，不隐式切换现场对象。 */
  async runCancelSelectedEcn(): Promise<void> {
    const ecnId = this.selectedEcnId();
    if (!ecnId || this.busy() || !this.ready()) return;
    const label = this.selectedEcn()?.ecnNo ?? ecnId;
    if (!window.confirm(`确认取消 ${label}？该变更单引入的变更将整体撤回。`)) return;
    const current = this.beginRequest();
    this.clearQuery();
    this.queryEcnId.set(ecnId);
    this.ecnActionResult.set('');
    try {
      const error = await this.service.cancelEcn(ecnId);
      if (!current()) return;
      this.ecnActionResult.set(error || `取消成功：${label}，正在回读变更后的影响和差异。`);
      if (error) return;
      this.busy.set(false);
      await this.inspectEcn(ecnId);
    } catch (error) {
      if (current()) this.ecnActionResult.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 对已生效的种子 ECN 点取消（US-525 AC#12 ②）：拒绝。 */
  async runCancelEffectiveEcn(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    const current = this.beginRequest();
    try {
      const result = await this.service.demoCancelEffectiveEcn();
      if (current()) this.ecnActionResult.set(result);
    } catch (error) {
      if (current()) this.ecnActionResult.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  private clearQuery(): void {
    this.impactLines.set([]);
    this.diffLines.set([]);
    this.queryError.set('');
    this.diffLoaded.set(false);
  }

  private prepareQuery(ecnId: string): void {
    if (this.queryEcnId() !== ecnId) this.clearQuery();
    this.queryEcnId.set(ecnId);
  }

  private beginRequest(): () => boolean {
    const epoch = this.service.dataEpoch();
    const request = ++this.request;
    this.busy.set(true);
    return () =>
      request === this.request && epoch === this.service.dataEpoch() && this.ready() && !this.service.resetting();
  }
}
