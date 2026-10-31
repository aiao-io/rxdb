import { isDevToolsI18nSnapshot, type DevToolsI18nSnapshot, type DevToolsPanelEndpoint } from '@aiao/rxdb-devtools';
import { effect, inject, Injectable, signal } from '@angular/core';
import { DevToolsEndpointService } from './devtools-endpoint.service';

/** 当前面板会话的国际化检视；全部请求沿既有v2数据面发送。 */
@Injectable()
export class I18nStateService {
  private readonly endpoints = inject(DevToolsEndpointService);
  private endpoint: DevToolsPanelEndpoint | null = null;
  private generation = 0;
  private eventRevision = 0;
  /** 当前可检视快照，未接入时为空。 */
  readonly snapshot = signal<DevToolsI18nSnapshot | null>(null);
  /** 首次加载或手动刷新中。 */
  readonly loading = signal(false);
  /** 诊断清空请求中。 */
  readonly clearing = signal(false);
  /** 最近一次结构化错误码。 */
  readonly error = signal<string | null>(null);

  constructor() {
    effect(onCleanup => {
      const state = this.endpoints.state();
      const generation = ++this.generation;
      this.endpoint = state === 'v2' ? this.endpoints.resolve() : null;
      this.snapshot.set(null);
      this.error.set(null);
      this.loading.set(false);
      this.clearing.set(false);
      const endpoint = this.endpoint;
      if (!endpoint || endpoint.capability === 'none') return;
      const unsubscribe = endpoint.onEvent(event => {
        if (generation !== this.generation) return;
        if (event.eventType === 'I18N_CHANGED' && isDevToolsI18nSnapshot(event.data)) {
          this.eventRevision++;
          this.snapshot.set(event.data);
        }
        if (event.eventType === 'I18N_ERROR') this.error.set('operation_failed');
      });
      onCleanup(() => {
        this.generation++;
        unsubscribe();
      });
      void this.refresh().then(async () => {
        if (generation === this.generation && this.snapshot()) await endpoint.request('database', 'events', {});
      });
    });
  }

  /** 重新读取当前连接的快照，旧会话或旧事件之前的响应不会覆盖新状态。 */
  async refresh(): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint) return;
    const generation = this.generation;
    const revision = this.eventRevision;
    this.loading.set(true);
    this.error.set(null);
    const result = await endpoint.request('database', 'inspect', {});
    if (generation !== this.generation) return;
    this.loading.set(false);
    if (result.outcome === 'failed') {
      this.error.set(result.error.code);
      return;
    }
    const payload =
      typeof result.result === 'object' && result.result !== null ? (result.result as { i18n?: unknown }) : {};
    if (revision !== this.eventRevision) return;
    if (payload.i18n === undefined) {
      this.snapshot.set(null);
      return;
    }
    if (!isDevToolsI18nSnapshot(payload.i18n)) {
      this.error.set('invalid_message');
      return;
    }
    this.snapshot.set(payload.i18n);
  }

  /** 仅清空显式支持且当前session允许写入的缺失文案诊断。 */
  async clearMissing(): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint || endpoint.capability !== 'full' || this.snapshot()?.canClearMissing !== true || this.clearing())
      return;
    const generation = this.generation;
    this.clearing.set(true);
    this.error.set(null);
    const result = await endpoint.request('settings', 'clear', { scope: 'i18n-missing' });
    if (generation !== this.generation) return;
    this.clearing.set(false);
    if (result.outcome === 'failed') {
      this.error.set(result.error.code);
      return;
    }
    await this.refresh();
  }
}
