import { RxDB, RxDBIdentityMismatchError } from '@aiao/rxdb';
import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DemoSession } from './demo-session';
import { getErrorMessage } from './error-message';
import type { PageWorkbenchRegistration, WorkbenchAction } from './page-workbench';
import { RemoteSyncState } from './remote-sync-state';
import { describePullOutcome, describePushOutcome, type SyncOutcome } from './sync-outcome';
import { type ToastInput, Toasts } from './toasts';

/** 推或拉 */
export type SyncDirection = 'pull' | 'push';

/** 身份守卫拦下这一轮时的说法：守卫自己的报错是写给开发者的英文，这里换成演示读者看得懂的话（US-035） */
const IDENTITY_MISMATCH_REASON =
  '身份不匹配。浏览器里的会话已经换成另一个身份，本页还开着上一个身份的库，本地数据没动；重新加载打开新身份的库';

/** 一轮推拉的结果 */
export interface SyncRoundResult {
  readonly direction: SyncDirection;
  /** 完成时的说法 */
  readonly notice: string | null;
  /** 没有全部完成或失败的原因 */
  readonly error: string | null;
  /** 会话已在别的标签页换成另一个身份，要重新加载（US-035） */
  readonly identityMismatch: boolean;
  /** 这一轮结束的时刻 */
  readonly at: Date;
}

/**
 * 整机的推送与拉取（US-230）
 *
 * @remarks
 * 推送、拉取作用于当前身份的整个本地库，不分页面：三页登记的是这同一组命令，顶栏与同步中心读同一份状态。
 * 每轮结束弹一条消息（`source` 是 `sync-round-<轮次>`）；同步中心的「最近一次」留着最近一轮的结果。
 * 不做成按页：推上去至少一条时，历史插件清的是整条分支的撤销栈，只推本页会让别的页没推的修改也失去撤销。
 * 拉取带 `fetchAll`：一次拉到底，与原商品页「同步」等价。
 */
@Injectable({ providedIn: 'root' })
export class SyncCommands {
  readonly #rxdb = inject(RxDB);
  readonly #remote = inject(RemoteSyncState);
  readonly #session = inject(DemoSession);
  readonly #toasts = inject(Toasts);
  readonly #running = signal<SyncDirection | null>(null);
  readonly #round = signal(0);
  readonly #result = signal<SyncRoundResult | null>(null);

  /** 本机还没推送的修改（一个事务一条） */
  readonly pushableCount = toSignal(this.#rxdb.versionManager.pushableCount$, { initialValue: 0 });
  /** 远端还没拉到本机的修改 */
  readonly pullableCount = toSignal(this.#rxdb.versionManager.pullableCount$, { initialValue: 0 });
  /** 正在跑的方向 */
  readonly running = this.#running.asReadonly();
  /** 已经结束的轮数（成功或失败），e2e 靠它等一轮推拉结束 */
  readonly round = this.#round.asReadonly();
  /** 最近一轮的结果 */
  readonly result = this.#result.asReadonly();

  readonly pull: WorkbenchAction = {
    run: () =>
      this.#sync('pull', async () => describePullOutcome(await this.#rxdb.syncManager.pull({ fetchAll: true }))),
    count: this.pullableCount,
    pending: computed(() => this.#running() === 'pull'),
    disabledReason: computed(() => (this.#running() ? '正在同步' : null))
  };

  readonly push: WorkbenchAction = {
    run: () => this.#sync('push', async () => describePushOutcome(await this.#rxdb.syncManager.push())),
    count: this.pushableCount,
    pending: computed(() => this.#running() === 'push'),
    disabledReason: computed(() => {
      if (this.#running()) return '正在同步';
      return this.pushableCount() === 0 ? '没有待推送的修改' : null;
    })
  };

  /**
   * 页面登记的推拉
   *
   * @returns 连着远端时是整机的推送与拉取；本地模式（没有 Supabase 配置）两个都是 `null`，顶栏不显示同步组
   */
  forPage(): Pick<PageWorkbenchRegistration, 'push' | 'pull'> {
    return this.#remote.$connected() ? { push: this.push, pull: this.pull } : { push: null, pull: null };
  }

  async #sync(direction: SyncDirection, operation: () => Promise<SyncOutcome>): Promise<void> {
    this.#running.set(direction);
    let toast: Omit<ToastInput, 'source'>;
    try {
      const outcome = await operation();
      this.#result.set({
        direction,
        notice: outcome.notice,
        error: outcome.error,
        identityMismatch: false,
        at: new Date()
      });
      toast =
        outcome.error === null ?
          { kind: outcome.needsAttention ? 'warning' : 'success', message: outcome.notice }
        : { kind: 'error', message: outcome.error };
    } catch (error) {
      const label = direction === 'pull' ? '拉取' : '推送';
      const identityMismatch = error instanceof RxDBIdentityMismatchError;
      const reason = identityMismatch ? IDENTITY_MISMATCH_REASON : getErrorMessage(error, '未知错误');
      const message = `${label}失败：${reason}`;
      this.#result.set({ direction, notice: null, error: message, identityMismatch, at: new Date() });
      toast = {
        kind: 'error',
        message,
        ...(identityMismatch ? { action: { label: '重新加载', run: () => this.#session.reload() } } : {})
      };
    } finally {
      this.#running.set(null);
      this.#round.update(round => round + 1);
    }
    this.#toasts.show({ ...toast, source: `sync-round-${this.#round()}` });
  }
}
