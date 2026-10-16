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
        <h2>EBOM ↔ MBOM 双图与映射（US-525 AC#13）</h2>
        <p class="panel-desc">SHEET-ASSY 钣金外壳两张图同评估日并排展开；映射覆盖率与跟进缺口按路径级口径核对。</p>
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
      @if (dualView()) {
        <div class="dual">
          <div class="panel-inset tree" data-testid="ebom-tree">
            <h3>EBOM（SHEET-ASSY）</h3>
            <bom-req-tree [designators]="designators()" [itemNos]="itemNos()" [result]="dualView()!.ebom" />
          </div>
          <div class="panel-inset tree" data-testid="mbom-tree">
            <h3>MBOM（SHEET-ASSY-M）</h3>
            <bom-req-tree [designators]="designators()" [itemNos]="itemNos()" [result]="dualView()!.mbom" />
          </div>
        </div>
      } @else {
        <div class="empty-state">点击「双图并排展开」查看两张 BOM 的层级对比。</div>
      }
      <h3 class="result-title">覆盖率</h3>
      <bom-line-list [lines]="coverageLines()" emptyText="点击「查覆盖率」核对映射目标行。" testId="coverage-line" />
      <h3 class="result-title">跟进缺口</h3>
      <bom-line-list [lines]="gapLines()" emptyText="点击「查跟进缺口」比对解析步骤集合。" testId="gap-line" />
    </section>
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

  constructor() {
    // 重置种子（ready 翻转为真）后清空双图与查询结果（旧结果对新种子无意义）
    effect(() => {
      if (this.service.ready()) {
        this.dualView.set(null);
        this.coverageLines.set([]);
        this.gapLines.set([]);
      }
    });
  }

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
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
}
