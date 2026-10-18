import { ChangeDetectionStrategy, Component, effect, inject, signal, type WritableSignal } from '@angular/core';
import { BomDemoService } from '../bom-demo.service';

/** 把循环引用、位号和替代分配的异常保护集中在独立示例中。 */
@Component({
  selector: 'bom-demo-checks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" [attr.aria-busy]="busy()">
      <div class="panel-head">
        <h2>异常校验示例</h2>
        <p class="panel-desc">尝试几种不允许的修改，了解系统如何保护结构和发布结果。每项都保留具体返回原因。</p>
      </div>
      @if (busy()) {
        <p class="hint" role="status">正在执行校验，请稍候…</p>
      }
      @if (actionError()) {
        <div class="error-box" role="alert">
          <p>校验暂时未能完成，请稍后重试。</p>
          <details>
            <summary>查看原因</summary>
            <pre>{{ actionError() }}</pre>
          </details>
        </div>
      }
      <div class="check-grid">
        <div class="check-card">
          <h3>循环引用保护</h3>
          <p class="check-desc">尝试让 PCBA 再引用整机 SC-100。结构会绕回自身，这种修改应被拒绝。</p>
          <div class="toolbar">
            <button class="btn" [disabled]="busy() || !ready()" (click)="runRawCycle()">直接写入循环引用</button>
            <button class="btn" [disabled]="busy() || !ready()" (click)="runFormCycle()">通过表单写入循环引用</button>
          </div>
          @if (rawResult()) {
            <details class="check-result" data-testid="raw-cycle-result">
              <summary>查看直接写入结果</summary>
              <pre>{{ rawResult() }}</pre>
            </details>
          }
          @if (formResult()) {
            <details class="check-result" data-testid="form-cycle-result">
              <summary>查看表单写入结果</summary>
              <pre>{{ formResult() }}</pre>
            </details>
          }
          @if (!rawResult() && !formResult()) {
            <p class="hint">两条入口都应拒绝相同的循环引用。</p>
          }
        </div>
        <div class="check-card">
          <h3>位号数量保护</h3>
          <p class="check-desc">某行用量为100，却只填写39个位号。草稿可继续编辑，发布时应指出数量不一致。</p>
          <button class="btn" [disabled]="busy() || !ready()" (click)="publishDemoHeader()">检查位号不足的发布</button>
          @if (publishResult()) {
            <details class="check-result" data-testid="publish-result">
              <summary>查看发布结果</summary>
              <pre>{{ publishResult() }}</pre>
            </details>
          } @else {
            <p class="hint">预期指出39个位号与用量100不一致。</p>
          }
        </div>
        <div class="check-card">
          <h3>替代分配比例保护</h3>
          <p class="check-desc">两个替代物料分配50%与30%，合计只有80%。发布时应拒绝缺少分配的结构。</p>
          <button class="btn" [disabled]="busy() || !ready()" (click)="runSubstituteDemo()">检查分配不足的发布</button>
          @if (substituteResult()) {
            <details class="check-result" data-testid="substitute-result">
              <summary>查看分配校验结果</summary>
              <pre>{{ substituteResult() }}</pre>
            </details>
          } @else {
            <p class="hint">分配比例必须合计100%。</p>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .check-result {
        margin-top: 4px;
        overflow-wrap: anywhere;
      }
      .check-result summary {
        color: var(--color-primary);
        cursor: pointer;
        font-weight: 600;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `
  ]
})
export class DemoChecks {
  private readonly service = inject(BomDemoService);
  readonly ready = this.service.ready;
  readonly rawResult = signal('');
  readonly formResult = signal('');
  readonly publishResult = signal('');
  readonly substituteResult = signal('');
  readonly actionError = signal('');
  readonly busy = signal(false);

  constructor() {
    effect(() => {
      if (this.ready()) return;
      this.rawResult.set('');
      this.formResult.set('');
      this.publishResult.set('');
      this.substituteResult.set('');
      this.actionError.set('');
    });
  }

  publishDemoHeader(): Promise<void> {
    return this.runCheck(() => this.service.publishDemoHeader(), this.publishResult);
  }

  runRawCycle(): Promise<void> {
    return this.runCheck(() => this.service.rawCycleInsert(), this.rawResult);
  }

  runFormCycle(): Promise<void> {
    return this.runCheck(() => this.service.formCycleInsert(), this.formResult);
  }

  runSubstituteDemo(): Promise<void> {
    return this.runCheck(() => this.service.demoSubstitutePublishRejection(), this.substituteResult);
  }

  private async runCheck(check: () => Promise<string>, result: WritableSignal<string>): Promise<void> {
    if (this.busy() || !this.ready()) return;
    this.busy.set(true);
    this.actionError.set('');
    result.set('');
    try {
      result.set(await check());
    } catch (error) {
      this.actionError.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
