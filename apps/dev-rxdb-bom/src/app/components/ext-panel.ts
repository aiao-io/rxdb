import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';

/** 扩展属性的写入校验与查询演示。 */
@Component({
  selector: 'bom-ext-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="panel" [attr.aria-busy]="busy()">
      <div class="panel-head">
        <h2>扩展属性</h2>
        <p class="panel-desc">B-01 的 rohs 为必填字符串枚举，合法值为 yes、no。缺字段与空值均不参与比较。</p>
      </div>
      <div class="toolbar">
        <label>rohs <input [(ngModel)]="value" data-testid="ext-value" /></label>
        <button class="btn btn-primary" [disabled]="busy() || !ready()" (click)="write(false)" data-testid="ext-save">
          保存属性
        </button>
        <button
          class="btn btn-danger"
          [disabled]="busy() || !ready()"
          (click)="write(true)"
          data-testid="ext-clear-required"
        >
          完整更新不填 rohs
        </button>
      </div>
      @if (message()) {
        <p [class.error-box]="failed()" [class.status-success]="!failed()" data-testid="ext-result" role="status">
          {{ message() }}
        </p>
      }
      <div class="toolbar result-title">
        <label
          >过滤条件
          <select [(ngModel)]="op" data-testid="ext-filter-op">
            <option value="eq">等于</option>
            <option value="ne">不等于</option>
          </select>
        </label>
        <label>rohs <input [(ngModel)]="filterValue" data-testid="ext-filter-value" /></label>
        <button class="btn" [disabled]="busy() || !ready()" (click)="filter()" data-testid="ext-filter">
          过滤物料
        </button>
      </div>
      @if (rows(); as result) {
        @for (row of result; track row.itemNo) {
          <div class="where-used-row" data-testid="ext-filter-row">{{ row.itemNo }} · {{ row.ext }}</div>
        } @empty {
          <div class="empty-state">没有满足条件的物料。</div>
        }
      }
      @if (busy()) {
        <p class="hint" role="status">正在处理扩展属性…</p>
      }
    </section>
  `
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

  /** 使用完整属性更新验证非法值与必填字段。 */
  async write(empty: boolean): Promise<void> {
    this.busy.set(true);
    this.message.set('');
    try {
      const error = await this.service.extWrite('B-01', empty ? {} : { rohs: this.value() });
      this.failed.set(error.length > 0);
      this.message.set(error || '保存成功');
    } catch (error) {
      this.failed.set(true);
      this.message.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 在声明类型下执行等值或不等值查询。 */
  async filter(): Promise<void> {
    this.busy.set(true);
    this.message.set('');
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
