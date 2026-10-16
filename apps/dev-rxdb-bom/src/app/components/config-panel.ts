import type { ExplosionResult } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';
import { ReqTree } from './req-tree';

/** 演示颜色必选特征、条件选行与互斥冲突。 */
@Component({
  selector: 'bom-config-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReqTree],
  template: `
    <section class="panel" [attr.aria-busy]="busy()">
      <div class="panel-head">
        <h2>配置选择</h2>
        <p class="panel-desc">CONFIG-DEMO 的颜色为必选特征。红色选中 CONFIG-PART，蓝色不选中；红与蓝互斥。</p>
      </div>
      <div class="toolbar">
        <label><input [(ngModel)]="red" data-testid="config-red" type="checkbox" />红</label>
        <label><input [(ngModel)]="blue" data-testid="config-blue" type="checkbox" />蓝</label>
        <button class="btn btn-primary" [disabled]="busy() || !ready()" (click)="run()" data-testid="config-explode">
          {{ busy() ? '解析中…' : '按配置展开' }}
        </button>
      </div>
      @if (error()) {
        <p class="error-box" data-testid="config-error" role="alert">{{ error() }}</p>
      }
      <div data-testid="config-tree">
        @if (result(); as result) {
          <bom-req-tree [designators]="designators()" [itemNos]="itemNos()" [result]="result" />
          @if (result.requirementLines.length === 0) {
            <div class="empty-state" data-testid="config-empty">当前配置没有选中的物料行。</div>
          }
        } @else if (!error() && !busy()) {
          <div class="empty-state">选择颜色后点击「按配置展开」。</div>
        }
      </div>
    </section>
  `
})
export class ConfigPanel {
  private readonly service = inject(BomDemoService);
  readonly asOfDate = input.required<string>();
  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
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

  /** 每次解析先清空旧结构，失败时只呈现本次错误。 */
  async run(): Promise<void> {
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
