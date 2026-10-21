import type { ExplosionResult, MappingGap, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { BomDemoService } from '../bom-demo.service';
import { materialLabel } from '../presentation/material-label';
import { LineList } from './line-list';
import { ReqTree } from './req-tree';

/** 双图并排视图（US-525 AC#13：EBOM / MBOM 各自展开）。 */
interface DualView {
  ebom: ExplosionResult;
  mbom: ExplosionResult;
}

/**
 * EBOM ↔ MBOM 双图与映射面板：双图并排展开 + 覆盖率 + 跟进缺口。
 * overview（验收面板）与 mapping（双图映射页）两处复用。
 * testid：ebom-tree / mbom-tree / coverage-line / gap-line。
 */
@Component({
  selector: 'bom-mapping-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LineList, ReqTree],
  template: `
    <section class="panel">
      <div class="panel-head">
        <h2>对照设计与制造清单</h2>
        <p class="panel-desc">
          先展开
          {{ materialLabel('SHEET-ASSY') }} 的两张清单，再检查设计需求是否已落实到制造环节。修改评估日后，请重新查询。
        </p>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" [disabled]="busy() || !ready()" (click)="runDualExplode()">
          {{ busy() ? '处理中…' : '双图并排展开' }}
        </button>
        <button class="btn" [disabled]="busy() || !ready()" (click)="runCoverage()">
          {{ busy() ? '处理中…' : '查覆盖率' }}
        </button>
        <button class="btn" [disabled]="busy() || !ready()" (click)="runGaps()">
          {{ busy() ? '处理中…' : '查跟进缺口' }}
        </button>
      </div>
      @if (!ready()) {
        <p class="hint">请先到概览装载示例数据，再开始对照。</p>
      }
      @if (stale()) {
        <p class="error-box" role="status">条件已修改，下方保留的是此前评估日的结果。请重新查询后再确认映射。</p>
      }
      @if (error()) {
        <div class="error-box" role="alert">{{ errorTitle() }}。请检查评估日后重试。</div>
        <details class="details-panel">
          <summary>查看错误详情</summary>
          <pre>{{ error() }}</pre>
        </details>
      }
      @if (dualView()) {
        <div class="dual">
          <div class="panel-inset tree" data-testid="ebom-tree">
            <h3>设计清单 · EBOM</h3>
            <p class="panel-desc">{{ materialLabel('SHEET-ASSY') }}的设计清单：设计需要哪些零件</p>
            <bom-req-tree
              [designators]="designators()"
              [itemNos]="itemNos()"
              [result]="dualView()!.ebom"
              [selected]="locatedLine()"
            />
          </div>
          <div class="panel-inset tree" data-testid="mbom-tree">
            <h3>制造清单 · MBOM</h3>
            <p class="panel-desc">{{ materialLabel('SHEET-ASSY') }}的制造清单：生产需要哪些材料与工序件</p>
            <bom-req-tree [designators]="designators()" [itemNos]="itemNos()" [result]="dualView()!.mbom" />
          </div>
        </div>
      } @else {
        <div class="empty-state">确认上方评估日，点击「双图并排展开」，同时查看设计零件与制造用料。</div>
      }
      <h3 class="result-title">设计需求的落实情况</h3>
      @if (coverageSummary(); as summary) {
        <div class="summary-grid" aria-label="映射覆盖情况">
          <div class="metric-card">
            <span class="metric-label">已覆盖路径</span><strong class="metric-value">{{ summary.covered }}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">未覆盖路径</span><strong class="metric-value">{{ summary.uncovered }}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">失效映射</span><strong class="metric-value">{{ summary.invalid }}</strong>
          </div>
        </div>
        <details class="details-panel">
          <summary>查看覆盖路径明细</summary>
          <bom-line-list
            [lines]="coverageLines()"
            emptyText="当前评估日没有可核对的映射路径。"
            testId="coverage-line"
          />
        </details>
      } @else {
        <div class="empty-state">点击「查覆盖率」，找出未落实或已经失效的映射。</div>
      }
      <h3 class="result-title">需要跟进的变化</h3>
      @if (gapsLoaded()) {
        <p class="hint" role="status">
          按 {{ gapsDate() }} 核对 {{ gaps().length }} 条映射，其中 {{ pendingCount() }} 条需要跟进。
        </p>
        @for (gap of gaps(); track gap.mappingId) {
          <article class="panel-inset mapping-gap" data-testid="gap-line">
            <h4>{{ gap.targetLineId ? lineLabel(gap.targetLineId) : '设计侧移除的对应关系' }}</h4>
            @if (gap.undecidable; as unknown) {
              <p class="error-box">当前结构不完整，无法确认这条映射。</p>
              <details>
                <summary>查看判定原因</summary>
                <p>{{ unknown.reason }}</p>
              </details>
            } @else {
              @for (change of gap.differences; track change.baseline.lineId + change.baseline.occurrenceId) {
                <p>
                  {{ change.kind === 'missing' ? '原路径已消失' : '路径内容已变化' }}：{{
                    lineLabel(change.baseline.lineId)
                  }}
                </p>
              }
              @for (appeared of gap.appeared; track appeared.lineId + appeared.occurrenceId) {
                <p>新出现的路径：{{ lineLabel(appeared.lineId) }}</p>
              }
              @if (!needsFollowUp(gap)) {
                <p class="status-success">已一致：当前解析依据与已确认基线相同。</p>
              }
            }
            <div class="toolbar">
              @if (needsFollowUp(gap) && !gap.undecidable) {
                <button
                  class="btn"
                  [disabled]="busy() || stale()"
                  (click)="locateGap(gap)"
                  data-testid="mapping-locate"
                >
                  定位设计路径
                </button>
                <button
                  class="btn btn-primary"
                  [disabled]="busy() || stale()"
                  (click)="confirmGap(gap)"
                  data-testid="mapping-confirm"
                >
                  确认当前映射
                </button>
              }
            </div>
            <details class="details-panel">
              <summary>核对完整记录标识</summary>
              <code>{{ gap.mappingId }}</code>
              @for (change of gap.differences; track change.baseline.lineId + change.baseline.occurrenceId) {
                <p>
                  原行 {{ change.baseline.lineId }} · 发生项 {{ change.baseline.occurrenceId }} →
                  {{ change.current?.occurrenceId ?? '已消失' }}
                </p>
              }
            </details>
          </article>
        } @empty {
          <div class="empty-state">未发现需要跟进的映射变化。</div>
        }
      } @else {
        <div class="empty-state">点击「查跟进缺口」，检查原有映射是否随清单变化而失配。</div>
      }
      @if (locatedPath()) {
        <p class="hint" data-testid="mapping-located-path" role="status">已定位：{{ locatedPath() }}</p>
      }
      @if (confirmationResult()) {
        <p class="status-success" data-testid="mapping-confirm-result" role="status">{{ confirmationResult() }}</p>
      }
    </section>
  `,
  styles: `
    .summary-grid + .details-panel {
      margin-top: 16px;
    }
    .mapping-gap {
      margin-top: 16px;
    }
    .mapping-gap h4 {
      margin-top: 0;
    }
  `
})
export class MappingPanel {
  private readonly service = inject(BomDemoService);
  private request = 0;

  readonly asOfDate = input.required<string>();
  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly materialLabel = materialLabel;
  readonly designators = this.service.designators;
  readonly dualView = signal<DualView | null>(null);
  readonly coverageLines = signal<string[]>([]);
  readonly gapLines = signal<string[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly errorTitle = signal('');
  readonly coverageSummary = signal<{ covered: number; uncovered: number; invalid: number } | null>(null);
  readonly gapsLoaded = signal(false);
  readonly gaps = signal<MappingGap[]>([]);
  readonly labels = signal(new Map<string, string>());
  readonly dualDate = signal<string | null>(null);
  readonly coverageDate = signal<string | null>(null);
  readonly gapsDate = signal<string | null>(null);
  readonly stale = computed(() =>
    [this.dualDate(), this.coverageDate(), this.gapsDate()].some(date => date !== null && date !== this.asOfDate())
  );
  readonly pendingCount = computed(() => this.gaps().filter(gap => this.needsFollowUp(gap)).length);
  readonly locatedLine = signal<RequirementLine | null>(null);
  readonly locatedPath = signal('');
  readonly confirmationResult = signal('');

  constructor() {
    effect(() => {
      this.service.dataEpoch();
      this.service.ready();
      this.service.resetting();
      this.request += 1;
      this.dualView.set(null);
      this.coverageLines.set([]);
      this.gapLines.set([]);
      this.gaps.set([]);
      this.labels.set(new Map());
      this.error.set('');
      this.errorTitle.set('');
      this.coverageSummary.set(null);
      this.gapsLoaded.set(false);
      this.dualDate.set(null);
      this.coverageDate.set(null);
      this.gapsDate.set(null);
      this.locatedLine.set(null);
      this.locatedPath.set('');
      this.confirmationResult.set('');
      this.busy.set(false);
    });
  }

  lineLabel(id: string): string {
    return this.labels().get(id) ?? '尚未识别的物料路径';
  }

  needsFollowUp(gap: MappingGap): boolean {
    return gap.undecidable !== null || gap.differences.length > 0 || gap.appeared.length > 0;
  }

  /** 双图并排展开（US-525 AC#13）：EBOM / MBOM 两张图同评估日。 */
  async runDualExplode(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    const date = this.asOfDate();
    const current = this.beginRequest();
    this.dualView.set(null);
    this.dualDate.set(null);
    this.locatedLine.set(null);
    this.locatedPath.set('');
    try {
      const view = await this.service.dualExplode(date);
      if (!current()) return;
      this.dualView.set(view);
      this.dualDate.set(date);
    } catch (error) {
      if (!current()) return;
      this.errorTitle.set('清单展开未完成');
      this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 覆盖率查询（US-516 AC#5/#6）：已覆盖 / 未覆盖 / 失效三段。 */
  async runCoverage(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    const date = this.asOfDate();
    const current = this.beginRequest();
    this.coverageSummary.set(null);
    this.coverageLines.set([]);
    this.coverageDate.set(null);
    try {
      const [coverage, labels] = await Promise.all([this.service.mapCoverage(date), this.service.mappingLabels()]);
      if (!current()) return;
      this.labels.set(labels);
      this.coverageDate.set(date);
      this.coverageSummary.set({
        covered: coverage.covered.length,
        uncovered: coverage.uncovered.reduce((count, entry) => count + entry.paths.length, 0),
        invalid: coverage.invalid.length
      });
      this.coverageLines.set([
        ...coverage.covered.map(
          entry =>
            `已覆盖：${this.lineLabel(entry.lineId)}（路径 ${entry.pathKey
              .split('>')
              .map(id => this.lineLabel(id))
              .join(' → ')}）`
        ),
        ...coverage.uncovered.flatMap(entry =>
          entry.paths.map(
            path => `未覆盖：${this.lineLabel(entry.lineId)}（路径 ${path.map(id => this.lineLabel(id)).join(' → ')}）`
          )
        ),
        ...coverage.invalid.map(entry => `失效映射：${entry.reason}`)
      ]);
    } catch (error) {
      if (!current()) return;
      this.errorTitle.set('覆盖情况查询未完成');
      this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 跟进缺口查询（US-516 AC#16~#22）：解析步骤集合比对点名。 */
  async runGaps(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    const current = this.beginRequest();
    const date = this.asOfDate();
    this.gapLines.set([]);
    this.gaps.set([]);
    this.gapsLoaded.set(false);
    this.gapsDate.set(null);
    try {
      await this.readGaps(date, current);
    } catch (error) {
      if (!current()) return;
      this.errorTitle.set('跟进变化查询未完成');
      this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 从缺口的发生项定位到设计侧完整路径，不把记录标识当物料名。 */
  async locateGap(gap: MappingGap): Promise<void> {
    if (this.busy() || this.stale() || !this.ready()) return;
    const current = this.beginRequest();
    const date = this.gapsDate()!;
    try {
      const view = this.dualDate() === date ? this.dualView()! : await this.service.dualExplode(date);
      if (!current()) return;
      this.dualView.set(view);
      this.dualDate.set(date);
      const occurrenceIds = new Set([
        ...gap.differences.flatMap(change => (change.current ? [change.current.occurrenceId] : [])),
        ...gap.appeared.map(step => step.occurrenceId)
      ]);
      const line = view.ebom.requirementLines.find(entry => entry.path.some(id => occurrenceIds.has(id))) ?? null;
      this.locatedLine.set(line);
      this.locatedPath.set(
        line ? line.path.map(id => this.lineLabel(id)).join(' → ') : '原路径已消失，请核对该映射的移除记录。'
      );
    } catch (error) {
      if (!current()) return;
      this.errorTitle.set('路径定位未完成');
      this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 推进完整基线后重新读取，成功提示不代替实际缺口结果。 */
  async confirmGap(gap: MappingGap): Promise<void> {
    if (this.busy() || this.stale() || !this.ready() || gap.undecidable) return;
    const current = this.beginRequest();
    const date = this.gapsDate()!;
    this.confirmationResult.set('');
    let confirmed = false;
    try {
      await this.service.confirmMap(gap.mappingId, date);
      if (!current()) return;
      confirmed = true;
      this.gaps.set([]);
      this.gapsLoaded.set(false);
      await this.readGaps(date, current);
      if (current()) this.confirmationResult.set(`已确认 ${date} 的映射依据，并重新读取跟进缺口。`);
    } catch (error) {
      if (!current()) return;
      this.errorTitle.set(confirmed ? '确认已保存，缺口回读未完成，请重新查询' : '映射确认未完成');
      this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  private beginRequest(): () => boolean {
    const epoch = this.service.dataEpoch();
    const request = ++this.request;
    this.busy.set(true);
    this.error.set('');
    return () =>
      request === this.request && epoch === this.service.dataEpoch() && this.ready() && !this.service.resetting();
  }

  private async readGaps(date: string, current: () => boolean): Promise<void> {
    const [gaps, labels] = await Promise.all([this.service.mapGaps(date), this.service.mappingLabels()]);
    if (!current()) return;
    this.labels.set(labels);
    this.gaps.set(gaps.gaps);
    this.gapsDate.set(date);
    this.gapLines.set(
      gaps.gaps.map(gap => {
        if (gap.undecidable !== null) return `无法判定：${gap.undecidable.reason}`;
        const diff =
          gap.differences
            .map(
              entry =>
                `${entry.kind === 'missing' ? '消失' : '变化'}：${this.lineLabel(entry.baseline.lineId)} → ${entry.current ? this.lineLabel(entry.current.lineId) : '—'}`
            )
            .join('；') || '（无差异）';
        const appeared =
          gap.appeared.length > 0 ?
            `；新出现：${gap.appeared.map(step => this.lineLabel(step.lineId)).join('、')}`
          : '';
        return `映射核对：${diff}${appeared}`;
      })
    );
    this.gapsLoaded.set(true);
  }
}
