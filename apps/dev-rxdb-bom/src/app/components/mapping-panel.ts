import type { ExplosionResult } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { BomDemoService } from '../bom-demo.service';
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
          先展开钣金外壳的两张清单，再检查设计需求是否已落实到制造环节。修改评估日后，请重新查询。
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
            <p class="panel-desc">SHEET-ASSY：设计需要哪些零件</p>
            <bom-req-tree [designators]="designators()" [itemNos]="itemNos()" [result]="dualView()!.ebom" />
          </div>
          <div class="panel-inset tree" data-testid="mbom-tree">
            <h3>制造清单 · MBOM</h3>
            <p class="panel-desc">SHEET-ASSY-M：生产需要哪些材料与工序件</p>
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
        <p class="hint" role="status">对照已完成，返回 {{ gapLines().length }} 条映射核对记录。</p>
        <details class="details-panel">
          <summary>查看映射变化明细</summary>
          <bom-line-list [lines]="gapLines()" emptyText="未发现需要跟进的映射变化。" testId="gap-line" />
        </details>
      } @else {
        <div class="empty-state">点击「查跟进缺口」，检查原有映射是否随清单变化而失配。</div>
      }
    </section>
  `,
  styles: `
    .summary-grid + .details-panel {
      margin-top: 16px;
    }
  `
})
export class MappingPanel {
  private readonly service = inject(BomDemoService);

  readonly asOfDate = input.required<string>();
  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly designators = this.service.designators;
  readonly dualView = signal<DualView | null>(null);
  readonly coverageLines = signal<string[]>([]);
  readonly gapLines = signal<string[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly errorTitle = signal('');
  readonly coverageSummary = signal<{ covered: number; uncovered: number; invalid: number } | null>(null);
  readonly gapsLoaded = signal(false);

  constructor() {
    // 重置种子（ready 翻转为真）后清空双图与查询结果（旧结果对新种子无意义）
    effect(() => {
      if (this.service.ready()) {
        this.dualView.set(null);
        this.coverageLines.set([]);
        this.gapLines.set([]);
        this.error.set('');
        this.coverageSummary.set(null);
        this.gapsLoaded.set(false);
      }
    });
  }

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  /** 双图并排展开（US-525 AC#13）：EBOM / MBOM 两张图同评估日。 */
  async runDualExplode(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.dualView.set(await this.service.dualExplode(this.asOfDate()));
    } catch (error) {
      this.errorTitle.set('清单展开未完成');
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 覆盖率查询（US-516 AC#5/#6）：已覆盖 / 未覆盖 / 失效三段。 */
  async runCoverage(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const coverage = await this.service.mapCoverage(this.asOfDate());
      this.coverageSummary.set({
        covered: coverage.covered.length,
        uncovered: coverage.uncovered.reduce((count, entry) => count + entry.paths.length, 0),
        invalid: coverage.invalid.length
      });
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
      this.errorTitle.set('覆盖情况查询未完成');
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 跟进缺口查询（US-516 AC#16~#22）：解析步骤集合比对点名。 */
  async runGaps(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
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
      this.gapsLoaded.set(true);
    } catch (error) {
      this.errorTitle.set('跟进变化查询未完成');
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
