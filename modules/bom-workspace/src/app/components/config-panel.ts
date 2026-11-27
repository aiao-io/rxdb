import type { ExplosionResult } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';
import { materialLabel } from '../presentation/material-label';
import { ReqTree } from './req-tree';

/** 按颜色选择查看物料选用结果，同时保留冲突与缺少配置的验证入口。 */
@Component({
  selector: 'bom-config-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReqTree],
  template: `
    <section class="panel" [attr.aria-busy]="busy()">
      <div class="panel-head">
        <h2>产品配置</h2>
        <p class="panel-desc">
          为 {{ materialLabel('CONFIG-DEMO') }} 选择颜色。红色使用
          {{ materialLabel('CONFIG-PART') }}，蓝色不使用；必须选择一种颜色。
        </p>
      </div>
      <div class="toolbar" aria-label="产品颜色" role="group">
        <label><input [(ngModel)]="red" [disabled]="busy()" data-testid="config-red" type="checkbox" />红色</label>
        <label><input [(ngModel)]="blue" [disabled]="busy()" data-testid="config-blue" type="checkbox" />蓝色</label>
        <button class="btn btn-primary" [disabled]="busy() || !ready()" (click)="run()" data-testid="config-explode">
          {{ busy() ? '正在应用配置…' : '按配置展开' }}
        </button>
      </div>
      <p class="hint result-title">可以尝试同时选择或全部取消，查看配置规则如何保护结果。</p>
      @if (error()) {
        <div class="error-box" data-testid="config-error" role="alert">
          <p>配置无法应用，请检查颜色选项。</p>
          <details>
            <summary>查看具体原因</summary>
            <pre>{{ error() }}</pre>
          </details>
        </div>
      }
      <div class="result-title" data-testid="config-tree">
        @if (busy()) {
          <p class="hint" role="status">正在按所选颜色展开物料…</p>
        } @else if (result(); as current) {
          <bom-req-tree [designators]="designators()" [itemNos]="itemNos()" [result]="current" />
          @if (current.requirementLines.length === 0) {
            <div class="empty-state" data-testid="config-empty">当前配置没有选中的物料行。</div>
          }
        } @else if (!error()) {
          <div class="empty-state">选择颜色后点击「按配置展开」，查看配置对应的物料。</div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `
  ]
})
export class ConfigPanel {
  private readonly service = inject(BomDemoService);
  readonly asOfDate = input.required<string>();
  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly materialLabel = materialLabel;
  readonly designators = this.service.designators;
  readonly red = signal(true);
  readonly blue = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly result = signal<ExplosionResult | null>(null);

  constructor() {
    effect(() => {
      if (this.ready()) return;
      this.result.set(null);
      this.error.set('');
    });
  }

  /** 每次按明确的配置重新计算，失败时清除上次结果。 */
  async run(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    this.busy.set(true);
    this.result.set(null);
    this.error.set('');
    const colors = [this.red() ? '红' : '', this.blue() ? '蓝' : ''].filter(Boolean);
    try {
      this.result.set(
        await this.service.explode(this.asOfDate(), '1', 'CONFIG-DEMO', { configSelection: { 颜色: colors } })
      );
    } catch (error) {
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
