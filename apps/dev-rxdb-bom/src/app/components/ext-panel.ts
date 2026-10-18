import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';

/** 维护物料合规属性，再按属性查找物料。 */
@Component({
  selector: 'bom-ext-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="panel" [attr.aria-busy]="busy()">
      <div class="panel-head">
        <h2>物料扩展属性</h2>
        <p class="panel-desc">为 B-01 维护 RoHS 合规状态，再按属性筛选物料。yes 表示符合，no 表示不符合。</p>
      </div>
      <div class="toolbar">
        <label>
          B-01 的合规状态
          <input [(ngModel)]="value" [disabled]="busy()" data-testid="ext-value" placeholder="yes 或 no" />
        </label>
        <button class="btn btn-primary" [disabled]="busy() || !ready()" (click)="write(false)" data-testid="ext-save">
          保存属性
        </button>
      </div>
      @if (message()) {
        <div
          [attr.role]="failed() ? 'alert' : 'status'"
          [class.error-box]="failed()"
          [class.status-success]="!failed()"
          data-testid="ext-result"
        >
          @if (failed()) {
            <p>属性操作未完成，请检查输入内容。</p>
            <details>
              <summary>查看具体原因</summary>
              <pre>{{ message() }}</pre>
            </details>
          } @else {
            <p>{{ message() }}</p>
          }
        </div>
      }
      <div class="panel-head result-title">
        <h3>按属性查找</h3>
        <p class="hint">缺少这个属性或值为空的物料，不会被当作符合筛选条件。</p>
      </div>
      <div class="toolbar">
        <label>
          匹配方式
          <select [(ngModel)]="op" [disabled]="busy()" data-testid="ext-filter-op">
            <option value="eq">等于</option>
            <option value="ne">不等于</option>
          </select>
        </label>
        <label>合规状态 <input [(ngModel)]="filterValue" [disabled]="busy()" data-testid="ext-filter-value" /></label>
        <button class="btn" [disabled]="busy() || !ready()" (click)="filter()" data-testid="ext-filter">
          筛选物料
        </button>
      </div>
      @if (rows(); as current) {
        <p class="hint result-title" role="status">找到 {{ current.length }} 项物料</p>
        @for (row of current; track row.itemNo) {
          <div class="where-used-row" data-testid="ext-filter-row">
            <strong>{{ row.itemNo }}</strong>
            <details>
              <summary>查看物料属性</summary>
              <code>{{ row.ext }}</code>
            </details>
          </div>
        } @empty {
          <div class="empty-state">没有满足条件的物料，请调整筛选条件。</div>
        }
      }
      @if (busy()) {
        <p class="hint result-title" role="status">正在处理物料属性，请稍候…</p>
      }
      @if (!ready()) {
        <p class="hint result-title">准备好演示数据后，即可维护和查找属性。</p>
      }
      <details class="details-panel result-title">
        <summary>验证必填属性保护</summary>
        <p class="hint">尝试提交缺少合规状态的完整属性，系统应拒绝保存并说明原因。</p>
        <button class="btn" [disabled]="busy() || !ready()" (click)="write(true)" data-testid="ext-clear-required">
          检查缺少必填属性的情况
        </button>
      </details>
    </section>
  `,
  styles: [
    `
      pre,
      code {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .where-used-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 12px;
      }
      .where-used-row details {
        color: var(--color-text-secondary);
      }
      .details-panel .btn {
        margin-top: 16px;
      }
    `
  ]
})
export class ExtPanel {
  private readonly service = inject(BomDemoService);
  readonly ready = this.service.ready;
  readonly busy = signal(false);
  readonly value = signal('yes');
  readonly filterValue = signal('yes');
  readonly op = signal<'eq' | 'ne'>('eq');
  readonly message = signal('');
  readonly failed = signal(false);
  readonly rows = signal<{ itemNo: string; ext: string }[] | null>(null);

  constructor() {
    effect(() => {
      if (this.ready()) return;
      this.message.set('');
      this.rows.set(null);
    });
  }

  /** 提交完整属性，保留必填与枚举值的业务校验。 */
  async write(empty: boolean): Promise<void> {
    if (this.busy() || !this.ready()) return;
    this.busy.set(true);
    this.message.set('');
    this.rows.set(null);
    this.failed.set(false);
    try {
      const error = await this.service.extWrite('B-01', empty ? {} : { rohs: this.value() });
      this.failed.set(error.length > 0);
      this.message.set(error || '保存成功：属性已更新。');
    } catch (error) {
      this.failed.set(true);
      this.message.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 按声明的属性类型执行筛选。 */
  async filter(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    this.busy.set(true);
    this.message.set('');
    this.failed.set(false);
    this.rows.set(null);
    try {
      this.rows.set(await this.service.filterExt(this.op(), this.filterValue()));
    } catch (error) {
      this.failed.set(true);
      this.message.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
