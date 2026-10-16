import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { BomDemoService } from '../bom-demo.service';

/**
 * 校验演示区：直连/表单成环写入（US-509 AC#5）、位号发布（US-507 AC#5）、
 * 替代组概率合计（US-525 AC#7 ②）。overview（验收面板）与 explosion（展开专项页）两处复用。
 * 三个结果区沿用 data-testid：raw-cycle-result / form-cycle-result / publish-result / substitute-result。
 */
@Component({
  selector: 'bom-demo-checks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="panel-head">
        <h2>校验演示（存储层与发布校验）</h2>
        <p class="panel-desc">
          直连与表单两条写入路径必须返回同一存储层错误；位号计数与替代组概率合计在发布转移时校验。
        </p>
      </div>
      <div class="check-grid">
        <div class="check-card">
          <h3>成环写入（US-509 AC#5）</h3>
          <p class="check-desc">PCBA 指回 SC-100 的成环边：直连绕过应用层，环约束必须由存储层拒绝。</p>
          <div class="toolbar">
            <button class="btn" [disabled]="busy() || !ready()" (click)="runRawCycle()">
              直连写入成环边（PCBA → SC-100）
            </button>
            <button class="btn" [disabled]="busy() || !ready()" (click)="runFormCycle()">表单写入同一条边</button>
          </div>
          @if (rawResult()) {
            <div class="error-box" data-testid="raw-cycle-result">{{ rawResult() }}</div>
          }
          @if (formResult()) {
            <div class="error-box" data-testid="form-cycle-result">{{ formResult() }}</div>
          }
          @if (!rawResult() && !formResult()) {
            <div class="empty-state">两条路径应报同一错误码（rxdb:bom_cycle:…）</div>
          }
        </div>
        <div class="check-card">
          <h3>位号发布校验（US-507 AC#5）</h3>
          <p class="check-desc">managed 行 qty=100、位号 39 个：草稿可存，发布拒绝且错误同时给两个数。</p>
          <div class="toolbar">
            <button class="btn" [disabled]="busy() || !ready()" (click)="publishDemoHeader()">
              发布演示头（managed 行 qty=100、位号 39 个）
            </button>
          </div>
          @if (publishResult()) {
            <div class="error-box" data-testid="publish-result">{{ publishResult() }}</div>
          } @else {
            <div class="empty-state">发布转移时校验位号计数 39 ≠ qty 100。</div>
          }
        </div>
        <div class="check-card">
          <h3>替代组发布校验（US-525 AC#7 ②）</h3>
          <p class="check-desc">draft 组概率 0.5/0.3：发布拒绝并给实际合计 0.8。</p>
          <div class="toolbar">
            <button class="btn" [disabled]="busy() || !ready()" (click)="runSubstituteDemo()">
              发布 draft 组（概率 0.5/0.3）
            </button>
          </div>
          @if (substituteResult()) {
            <div class="error-box" data-testid="substitute-result">{{ substituteResult() }}</div>
          } @else {
            <div class="empty-state">比例合计必须等于 1（0.5 + 0.3 = 0.8 → 拒绝）。</div>
          }
        </div>
      </div>
    </section>
  `
})
export class DemoChecks {
  private readonly service = inject(BomDemoService);

  readonly ready = this.service.ready;
  readonly rawResult = signal('');
  readonly formResult = signal('');
  readonly publishResult = signal('');
  readonly substituteResult = signal('');
  readonly busy = signal(false);

  constructor() {
    // 重置种子（ready 翻转为真）后清空演示结果，避免旧结果误导新一轮验收
    effect(() => {
      if (this.service.ready()) {
        this.rawResult.set('');
        this.formResult.set('');
        this.publishResult.set('');
        this.substituteResult.set('');
      }
    });
  }

  /** 发布演示头（AC#3：39/100 位号计数违约，错误同时给两个数）。 */
  async publishDemoHeader(): Promise<void> {
    this.busy.set(true);
    try {
      this.publishResult.set(await this.service.publishDemoHeader());
    } finally {
      this.busy.set(false);
    }
  }

  /** 直连写入一条成环边（绕过应用层校验，存储层拒绝）。 */
  async runRawCycle(): Promise<void> {
    this.busy.set(true);
    try {
      this.rawResult.set(await this.service.rawCycleInsert());
    } finally {
      this.busy.set(false);
    }
  }

  /** 同一成环边经表单（实体 API）写入——必须与直连得到同一存储层错误码。 */
  async runFormCycle(): Promise<void> {
    this.busy.set(true);
    try {
      this.formResult.set(await this.service.formCycleInsert());
    } finally {
      this.busy.set(false);
    }
  }

  /** 替代组发布拒绝演示（US-525 AC#7 ②）。 */
  async runSubstituteDemo(): Promise<void> {
    this.busy.set(true);
    try {
      this.substituteResult.set(await this.service.demoSubstitutePublishRejection());
    } finally {
      this.busy.set(false);
    }
  }
}
