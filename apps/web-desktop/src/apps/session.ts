import { type OrbitClient } from '@aiao/orbit';
import { isRecord } from '../core/catalog.js';
import { errorMessage, requireCondition } from '../core/errors.js';
import { normalizeRoute, readNavigationAction, type NavigationState } from '../core/routes.js';
import { isJson } from '../core/session.js';
import { validateProfile } from '../core/state.js';
import { DesktopTransport } from '../core/transport.js';
import type { Profile } from '../core/types.js';
import { AppNavigation } from './navigation.js';

export class AppSession {
  private readonly transport: DesktopTransport;
  private readonly lifetime = new AbortController();
  private pendingRequests = 0;
  private routeUpdate: NavigationState | null = null;
  private publishingRoute = false;
  private canSuspend: (() => boolean) | null = null;
  private readonly pendingEvents = new Map<(...args: unknown[]) => void, () => void>();
  private readonly eventCleanups = new Set<() => void>();
  readonly navigation: AppNavigation;
  navigationError = '';
  suspended = false;
  profile: Profile;
  revision = 0;
  readonly listeners = new Set<() => void>();

  constructor(readonly client: OrbitClient) {
    this.transport = new DesktopTransport((method, payload) =>
      client.request(method, payload, { signal: this.lifetime.signal, timeout: 120000 })
    );
    const profile = client.context.props['profile'];
    requireCondition(isRecord(profile), 'INVALID', '宿主未提供桌面偏好');
    validateProfile(profile as unknown as Profile);
    this.profile = profile as unknown as Profile;
    this.navigation = new AppNavigation(normalizeRoute(client.context.props['route'] ?? ''), () => {
      this.routeUpdate = this.navigation.state;
      this.navigationError = '';
      this.changed();
      void this.publishRoutes();
    });
    client.onRequest('navigation.navigate', async (payload, signal) => {
      requireCondition(!this.suspended, 'SUSPENDED', '应用已挂起，请先恢复');
      this.pendingRequests++;
      try {
        return await this.navigation.go(readNavigationAction(payload), AbortSignal.any([this.lifetime.signal, signal]));
      } finally {
        this.pendingRequests--;
      }
    });
    this.onEvent('desktop.changed', value => {
      requireCondition(isRecord(value), 'INVALID', '桌面偏好格式无效');
      validateProfile(value as unknown as Profile);
      this.profile = value as unknown as Profile;
      this.changed();
    });
    client.onRequest('application.suspend', () => {
      requireCondition(this.canSuspend, 'UNSUPPORTED', '应用尚未登记挂起协议');
      requireCondition(this.pendingRequests === 0, 'BUSY', '应用正在处理请求，请完成后重试');
      requireCondition(this.canSuspend(), 'DIRTY', '应用有未保存内容或正在处理工作');
      this.suspended = true;
      this.changed();
      return { saved: true };
    });
    client.onRequest('application.resume', () => {
      this.suspended = false;
      const events = [...this.pendingEvents.values()];
      this.pendingEvents.clear();
      for (const event of events) event();
      this.changed();
      return true;
    });
    client.onDispose(() => {
      this.lifetime.abort();
      for (const cleanup of this.eventCleanups) cleanup();
      this.pendingEvents.clear();
      this.listeners.clear();
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  bindSuspension(canSuspend: () => boolean): () => void {
    requireCondition(this.canSuspend === null, 'INVALID', '应用重复登记挂起协议');
    this.canSuspend = canSuspend;
    return () => {
      this.canSuspend = null;
    };
  }

  onEvent(name: string, handler: (...args: unknown[]) => void): () => void {
    const listener = (...args: unknown[]) => {
      if (this.suspended) this.pendingEvents.set(listener, () => handler(...args));
      else handler(...args);
    };
    const cleanup = () => {
      this.client.bus.$off(name, listener);
      this.pendingEvents.delete(listener);
      this.eventCleanups.delete(cleanup);
    };
    this.client.bus.$on(name, listener);
    this.eventCleanups.add(cleanup);
    return cleanup;
  }

  async request<T>(method: string, payload: unknown = null): Promise<T> {
    requireCondition(!this.lifetime.signal.aborted, 'CANCELLED', '应用已销毁');
    requireCondition(!this.suspended, 'SUSPENDED', '应用已挂起，请先恢复');
    requireCondition(isJson(payload), 'INVALID', '请求载荷不是有效 JSON');
    this.pendingRequests++;
    try {
      return (await this.transport.request(method, payload)) as T;
    } finally {
      this.pendingRequests--;
    }
  }

  async confirm(title: string, message: string): Promise<boolean> {
    return this.request('desktop.confirm', { title, message });
  }

  update(value: unknown): Promise<boolean> {
    return this.request('window.update', value);
  }
  changed(): void {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  private async publishRoutes(): Promise<void> {
    if (this.publishingRoute) return;
    this.publishingRoute = true;
    try {
      while (this.routeUpdate && !this.lifetime.signal.aborted) {
        const state = this.routeUpdate;
        this.routeUpdate = null;
        await this.update({ route: state.route, navigation: { back: state.back, forward: state.forward } });
      }
    } catch (error) {
      this.navigationError = errorMessage(error);
      this.changed();
    } finally {
      this.publishingRoute = false;
    }
  }
}

export function download(name: string, bytes: Uint8Array<ArrayBuffer>, mime = 'application/octet-stream'): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
