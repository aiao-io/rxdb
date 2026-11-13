import type { CreditSnapshot } from '@aiao-media/api-contracts';
import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';
import type { ProductClient } from './product-client';

@Component({
  selector: 'app-credits-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="平台积分">
      <h3>平台积分</h3>
      @if (snapshot(); as value) {
        <p>
          可用积分 {{ value.account.available }} · 余额 {{ value.account.balance }} · 预占 {{ value.account.reserved }}
        </p>
        <p>图片通过本机验证并确认后才扣减积分。失败或待核对不扣积分。</p>
        <ul>
          @for (entry of value.entries; track entry.id) {
            <li>
              {{ entry.created_at }} · {{ entry.source === 'admin' ? '后台调整' : '生成消费' }} {{ entry.delta }} · 余额
              {{ entry.balance_after }} · {{ entry.reason }} · {{ entry.request_id }}
            </li>
          } @empty {
            <li>暂无积分流水</li>
          }
        </ul>
        @if (value.entries.length === 50) {
          <button
            class="secondary sm"
            [disabled]="busy()"
            (click)="load(value.entries[value.entries.length - 1].id)"
            type="button"
          >
            更早的流水
          </button>
        }
      }
      @if (message()) {
        <p role="status">{{ message() }}</p>
      }
      <button class="secondary sm" [disabled]="busy()" (click)="load()" type="button">
        {{ busy() ? '正在读取积分…' : '刷新积分' }}
      </button>
    </section>
  `
})
export class CreditsPanel {
  private generation = 0;
  readonly client = input.required<ProductClient>();
  readonly identity = input.required<string>();
  readonly snapshot = signal<CreditSnapshot | null>(null);
  readonly message = signal('');
  readonly busy = signal(false);

  constructor() {
    effect(onCleanup => {
      const identity = this.identity();
      untracked(() => {
        ++this.generation;
        this.snapshot.set(null);
        this.message.set('');
        this.busy.set(false);
        if (identity) void this.load();
      });
      onCleanup(() => {
        ++this.generation;
      });
    });
  }

  async load(before?: number): Promise<void> {
    if (this.busy() || !this.identity()) return;
    const generation = this.generation;
    this.busy.set(true);
    this.message.set('');
    try {
      const value = await this.client().credits(before);
      if (generation === this.generation) this.snapshot.set(value);
    } catch (error) {
      if (generation === this.generation)
        this.message.set(error instanceof Error ? error.message : '积分暂不可读，请重试。');
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
}
