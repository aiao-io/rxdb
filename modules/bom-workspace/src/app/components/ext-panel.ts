import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';
import { materialLabel } from '../presentation/material-label';

/** 维护物料合规属性，再按属性查找物料。 */
@Component({
  selector: 'bom-ext-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="panel" [attr.aria-busy]="busy()">
      <div class="panel-head">
        <h2>物料扩展属性</h2>
        <p class="panel-desc">
          为合规演示件（B-01）维护 RoHS 合规状态，再按属性筛选物料。yes 表示符合，no 表示不符合。
        </p>
      </div>
      <p class="hint" data-testid="ext-current">
        已保存：{{
          savedValue() === null ? '正在读取'
          : savedValue() === 'yes' ? '符合（yes）'
          : savedValue() === 'no' ? '不符合（no）'
          : '未设置'
        }}
      </p>
      @if (loadFailed()) {
        <button class="btn" [disabled]="busy() || !ready() || resetting()" (click)="loadCurrent()">
          重新读取当前属性
        </button>
      }
      <div class="toolbar">
        <label>
          合规演示件（B-01）的合规状态
          <input [(ngModel)]="value" [disabled]="busy()" data-testid="ext-value" placeholder="yes 或 no" />
        </label>
        <button
          class="btn btn-primary"
          [disabled]="busy() || !ready() || resetting() || savedValue() === null"
          (click)="write(false)"
          data-testid="ext-save"
        >
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
            <p>{{ failure() === 'rejected' ? '属性操作未完成，请检查输入内容。' : '属性操作出错，请稍后重试。' }}</p>
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
            <strong>{{ materialLabel(row.itemNo) }}</strong>
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
  readonly materialLabel = materialLabel;
  readonly ready = this.service.ready;
  readonly resetting = this.service.resetting;
  readonly busy = signal(false);
  readonly value = signal('yes');
  readonly savedValue = signal<string | null>(null);
  readonly loadFailed = signal(false);
  readonly filterValue = signal('yes');
  readonly op = signal<'eq' | 'ne'>('eq');
  readonly message = signal('');
  /** 失败分两类：校验拒绝提示检查输入，意外错误不冒充输入问题。 */
  readonly failure = signal<'rejected' | 'error' | null>(null);
  readonly failed = computed(() => this.failure() !== null);
  readonly rows = signal<{ itemNo: string; ext: string }[] | null>(null);

  constructor() {
    effect(() => {
      this.service.dataEpoch();
      this.message.set('');
      this.rows.set(null);
      this.savedValue.set(null);
      this.loadFailed.set(false);
      if (this.ready()) void this.loadCurrent();
    });
  }

  /** 重开与失败重试均读取已经落库的值，不把默认输入当成保存事实。 */
  async loadCurrent(): Promise<void> {
    if (!this.ready() || this.resetting()) return;
    const epoch = this.service.dataEpoch();
    this.busy.set(true);
    this.loadFailed.set(false);
    try {
      await this.#readCurrent(epoch);
    } catch (error) {
      if (epoch !== this.service.dataEpoch()) return;
      this.loadFailed.set(true);
      this.failure.set('error');
      this.message.set(`当前属性读取失败：${String(error)}`);
    } finally {
      this.busy.set(false);
    }
  }

  /** 正常保存仅修改RoHS，保护用例仍提交完整空对象验证必填拒绝。 */
  async write(empty: boolean): Promise<void> {
    if (this.busy() || !this.ready() || this.resetting()) return;
    const epoch = this.service.dataEpoch();
    this.busy.set(true);
    this.message.set('');
    this.rows.set(null);
    this.failure.set(null);
    try {
      const outcome =
        empty ? await this.service.extWrite('B-01', {}) : await this.service.extPatch('B-01', { rohs: this.value() });
      if (epoch !== this.service.dataEpoch()) return;
      if (!outcome.ok) {
        this.failure.set('rejected');
        this.message.set(String(outcome.error));
        return;
      }
      this.message.set('保存成功：属性已更新。');
      await this.#readCurrent(epoch);
    } catch (error) {
      if (epoch !== this.service.dataEpoch()) return;
      this.failure.set('error');
      this.message.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 按声明的属性类型执行筛选。 */
  async filter(): Promise<void> {
    if (this.busy() || !this.ready() || this.resetting()) return;
    const epoch = this.service.dataEpoch();
    this.busy.set(true);
    this.message.set('');
    this.failure.set(null);
    this.rows.set(null);
    try {
      const rows = await this.service.filterExt(this.op(), this.filterValue());
      if (epoch !== this.service.dataEpoch()) return;
      this.rows.set(rows);
    } catch (error) {
      if (epoch !== this.service.dataEpoch()) return;
      this.failure.set('error');
      this.message.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  async #readCurrent(epoch: number): Promise<void> {
    const current = JSON.parse(await this.service.extRead('B-01')) as Record<string, unknown>;
    if (epoch !== this.service.dataEpoch()) return;
    const value = typeof current['rohs'] === 'string' ? current['rohs'] : '';
    this.savedValue.set(value);
    this.value.set(value);
  }
}
