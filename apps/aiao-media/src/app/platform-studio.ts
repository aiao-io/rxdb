import { ChangeDetectionStrategy, Component, effect, input, OnDestroy, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { openPayment } from '../platform/local-backend';
import {
  PlatformClient,
  PlatformRequestError,
  type PlatformAccount,
  type PlatformCatalog,
  type PlatformJob
} from './platform-client';
import { PlatformSubmission } from './platform-submission';
import type { ProductClient } from './product-client';

@Component({
  selector: 'app-platform-studio',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './platform-studio.html'
})
export class PlatformStudio implements OnDestroy {
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private journal: PlatformSubmission | null = null;
  private checkoutId = '';
  readonly client = input.required<ProductClient>();
  readonly identity = input.required<string>();
  readonly scope = input.required<string>();
  readonly prompt = input.required<string>();
  readonly valid = input.required<boolean>();
  readonly size = input.required<string>();
  readonly received = output<{ job: PlatformJob; blob: Blob; ownerId: string; scope: string }>();
  readonly catalog = signal<PlatformCatalog | null>(null);
  readonly account = signal<PlatformAccount | null>(null);
  readonly jobs = signal<PlatformJob[]>([]);
  readonly model = signal('');
  readonly billing = signal<'free' | 'credits'>('free');
  readonly busy = signal(false);
  readonly message = signal('');
  constructor() {
    effect(() => {
      const identity = this.identity();
      const scope = this.scope();
      ++this.generation;
      this.journal = identity && scope ? new PlatformSubmission(localStorage, identity, scope) : null;
      this.checkoutId = '';
      this.catalog.set(null);
      this.account.set(null);
      this.jobs.set([]);
      this.busy.set(false);
      this.message.set('');
      if (this.timer) clearTimeout(this.timer);
      if (identity)
        untracked(() => {
          void this.refresh();
        });
    });
  }
  ngOnDestroy() {
    ++this.generation;
    if (this.timer) clearTimeout(this.timer);
  }
  async refresh() {
    const generation = this.generation;
    try {
      const api = this.api();
      const [catalog, account, result] = await Promise.all([
        api.request<PlatformCatalog>('catalog'),
        api.request<PlatformAccount>('account'),
        api.request<{ jobs: PlatformJob[] }>('jobs')
      ]);
      if (generation !== this.generation) return;
      this.catalog.set(catalog);
      this.account.set(account);
      this.jobs.set(result.jobs);
      const pending = this.journal?.pending();
      if (pending && result.jobs.some(job => job.requestId === pending.requestId))
        this.journal?.confirm(pending.requestId);
      if (!catalog.models.some(m => m.id === this.model())) this.model.set(catalog.models[0]?.id ?? '');
      this.schedule(result.jobs.some(job => ['queued', 'generating'].includes(job.status)));
    } catch (error) {
      if (generation === this.generation) {
        this.message.set(error instanceof Error ? error.message : '平台暂不可用。');
        this.schedule(true);
      }
    }
  }
  async submit() {
    if (this.busy() || !this.valid()) return;
    const generation = this.generation;
    await navigator.locks.request(
      `aiao-platform-submit:${this.identity()}:${this.scope()}`,
      { ifAvailable: true },
      async lock => {
        if (!lock) {
          this.message.set('另一窗口正在确认平台接单，请先核对任务。');
          return;
        }
        if (generation === this.generation) await this.submitLocked();
      }
    );
  }
  async cancel(job: PlatformJob) {
    const generation = this.generation;
    try {
      await this.api().request(`jobs/${job.id}/cancel`, {});
      if (generation === this.generation) await this.refresh();
    } catch (error) {
      if (generation === this.generation) this.message.set(error instanceof Error ? error.message : '取消未确认。');
    }
  }
  async receive(job: PlatformJob) {
    if (this.busy()) return;
    this.busy.set(true);
    const generation = this.generation,
      scope = this.scope(),
      ownerId = this.identity();
    try {
      const blob = await this.api().result(job);
      if (generation !== this.generation) return;
      this.received.emit({ job, blob, scope, ownerId });
      this.message.set('原图已读取，正在交给本机作品库保存。请查看本机保存状态。');
    } catch (error) {
      if (generation === this.generation) this.message.set(error instanceof Error ? error.message : '原图读取失败。');
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  async checkout() {
    if (this.busy()) return;
    this.busy.set(true);
    const generation = this.generation;
    this.checkoutId ||= crypto.randomUUID();
    try {
      const result = await this.api().request<{ url: string }>('checkout', { requestId: this.checkoutId });
      if (generation === this.generation) await openPayment(result.url);
    } catch (error) {
      if (generation === this.generation) this.message.set(error instanceof Error ? error.message : '支付会话未确认。');
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  status(job: PlatformJob) {
    return {
      queued: '排队中',
      generating: '生成中',
      completed: '生成完成',
      failed: '失败，额度已释放',
      cancelled: '已取消',
      needs_review: '结果待核对'
    }[job.status];
  }
  private async submitLocked() {
    if (this.busy() || !this.valid() || !this.prompt().trim() || !this.model()) return;
    let submission;
    try {
      submission = this.journal?.prepare({
        model: this.model(),
        prompt: this.prompt(),
        size: this.size(),
        billing: this.billing()
      });
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : '接单记录不可写。');
      return;
    }
    if (!submission) return;
    if (
      !window.confirm(
        `确认平台请求：${submission.prompt.slice(0, 60)}。使用 ${submission.model}，${submission.billing === 'free' ? '消耗免费额度' : '预占积分'}。若原提交未确认，将核对同一请求。`
      )
    )
      return;
    this.busy.set(true);
    this.message.set('');
    const generation = this.generation;
    try {
      await this.api().request('jobs', submission);
      if (generation === this.generation) {
        this.journal?.confirm(submission.requestId);
        await this.refresh();
      }
    } catch (error) {
      if (
        generation === this.generation &&
        error instanceof PlatformRequestError &&
        [400, 401, 402, 403, 429].includes(error.status)
      )
        this.journal?.confirm(submission.requestId);
      if (generation === this.generation)
        this.message.set(
          `${error instanceof Error ? error.message : '提交未确认。'}再次点击将核对同一请求，不会新增任务。`
        );
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  private api() {
    return new PlatformClient(this.client(), this.identity());
  }
  private schedule(poll: boolean) {
    if (this.timer) clearTimeout(this.timer);
    if (poll)
      this.timer = setTimeout(() => {
        void this.refresh();
      }, 5000);
  }
}
