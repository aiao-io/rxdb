import { signal } from '@angular/core';
import type { DevToolsHostAccess, DevToolsHostAccessState } from '../transport';

/**
 * 纯内存的 {@link DevToolsHostAccess} 实现。
 *
 * @remarks
 * 默认落在 `'granted'`：绝大多数用例关心的是授权之后的行为，把「请求授权」当默认起点
 * 只会让每个用例都先写一行样板。需要验证守卫分支的用例显式 `state.set('required')`。
 */
export class FakeDevToolsHostAccess implements DevToolsHostAccess {
  readonly state = signal<DevToolsHostAccessState>('granted');
  readonly error = signal<string | null>(null);

  /** {@link reloadInspectedPage} 被调用的次数。 */
  reloadCount = 0;

  /** 收到的全部求值请求，按时序记录。 */
  readonly evaluations: { code: string; requestId: string }[] = [];

  /** 由用例登记的求值结果；未登记时 {@link evaluate} 会拒绝，而不是悄悄返回 `undefined`。 */
  private evaluateResult: ((requestId: string) => unknown) | null = null;

  async requestAccess(): Promise<boolean> {
    this.state.set('granted');
    return true;
  }

  reloadInspectedPage(): void {
    this.reloadCount++;
  }

  async evaluate<T>(code: string, requestId: string): Promise<T> {
    this.evaluations.push({ code, requestId });
    if (!this.evaluateResult) throw new Error(`FakeDevToolsHostAccess 未登记求值结果: ${requestId}`);
    return this.evaluateResult(requestId) as T;
  }

  /** 登记后续 {@link evaluate} 的返回值。 */
  respondWith(result: unknown | ((requestId: string) => unknown)): void {
    this.evaluateResult = typeof result === 'function' ? (result as (requestId: string) => unknown) : () => result;
  }
}
