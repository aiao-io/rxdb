import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformClient, type PlatformJob } from './platform-client';
import type { ProductClient } from './product-client';

interface Policy {
  enabled: boolean;
  concurrency: number;
  capacity: number;
  freeDaily: number;
  dailyBudgetMicros: number;
}
interface Dashboard {
  policy: Policy;
  jobs: (PlatformJob & { owner: string })[];
  orders: { id: string; owner: string; paid: number; payload: string }[];
  ledger: { id: number; owner: string; reference: string; action: string; amount: number }[];
  audit: { id: number; actor: string; action: string; target: string; detail: string }[];
  budget: { day: string; used: number }[];
}
@Component({
  selector: 'app-platform-admin',
  imports: [FormsModule],
  templateUrl: './platform-admin.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlatformAdmin {
  private generation = 0;
  readonly client = input.required<ProductClient>();
  readonly identity = input.required<string>();
  readonly data = signal<Dashboard | null>(null);
  readonly policy = signal<Policy>({
    enabled: false,
    concurrency: 1,
    capacity: 100,
    freeDaily: 0,
    dailyBudgetMicros: 0
  });
  readonly note = signal('');
  readonly orderId = signal('');
  readonly priceCredits = signal(20);
  readonly priceAmount = signal(500);
  readonly busy = signal(false);
  readonly message = signal('');
  constructor() {
    effect(() => {
      const identity = this.identity();
      ++this.generation;
      this.data.set(null);
      this.busy.set(false);
      if (identity)
        untracked(() => {
          void this.load();
        });
    });
  }
  async load() {
    const generation = this.generation;
    try {
      const data = await new PlatformClient(this.client(), this.identity()).request<Dashboard>('admin');
      if (generation === this.generation) {
        this.data.set(data);
        this.policy.set(data.policy);
      }
    } catch (error) {
      if (generation === this.generation) {
        this.data.set(null);
        this.message.set(error instanceof Error ? error.message : '平台运维不可用。');
      }
    }
  }
  updatePolicy(key: keyof Policy, value: number | boolean) {
    this.policy.update(policy => ({ ...policy, [key]: value }));
  }
  async savePolicy() {
    await this.mutate('policy', { policy: this.policy(), note: this.note() });
  }
  async savePrice() {
    if (window.confirm('更新 USD 积分包价格？已有订单保留原价。'))
      await this.mutate('price', {
        pack: { credits: this.priceCredits(), amount: this.priceAmount(), currency: 'usd' },
        note: this.note()
      });
  }
  async resolve(job: PlatformJob, outcome: 'failed' | 'completed') {
    if (
      window.confirm(
        outcome === 'failed' ? '已在供应商确认未交付？此操作释放预占，不会重发生图。' : (
          '从平台已保存原图恢复回执？不会再次调用供应商。'
        )
      )
    )
      await this.mutate('resolve', { id: job.id, outcome, note: this.note() });
  }
  async refund() {
    if (window.confirm('核对该订单并全额退款？仅未消费积分可冻结退款，未知结果保持冻结；重复提交复用原退款。'))
      await this.mutate('refund', { orderId: this.orderId(), note: this.note() });
  }
  private async mutate(path: string, payload: unknown) {
    if (this.busy()) return;
    this.busy.set(true);
    const generation = this.generation;
    try {
      await new PlatformClient(this.client(), this.identity()).request(`admin/${path}`, payload);
      if (generation === this.generation) {
        this.message.set('操作已确认，具体状态见流水。');
        await this.load();
      }
    } catch (error) {
      if (generation === this.generation) this.message.set(error instanceof Error ? error.message : '操作尚未确认。');
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
}
