import type {
  DevToolsEventPayload,
  DevToolsI18nSnapshot,
  DevToolsPanelEndpoint,
  DevToolsPanelNegotiationState,
  DevToolsPanelRequestResult,
  DevToolsProviderDomain
} from '@aiao/rxdb-devtools';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevToolsEndpointService } from './devtools-endpoint.service';
import { I18nStateService } from './i18n-state.service';

const snapshot = (canClearMissing = true): DevToolsI18nSnapshot => ({
  locale: 'en',
  availableLocales: ['en'],
  messages: [{ locale: 'en', namespace: 'app', key: 'hello', value: 'Hello', source: 'bundle', active: true }],
  missingMessages: [
    { id: 'missing', locale: 'en', namespace: 'app', key: 'missing', updatedAt: '2026-10-28T00:00:00Z' }
  ],
  canClearMissing
});
const setup = (payload: unknown = { i18n: snapshot() }, capability: 'full' | 'readonly' = 'full') => {
  const listeners = new Set<(event: DevToolsEventPayload) => void>();
  const request = vi.fn<
    (domain: DevToolsProviderDomain, operation: string, params: unknown) => Promise<DevToolsPanelRequestResult>
  >(async () => ({ outcome: 'ok' as const, result: payload }));
  const endpoint = {
    capability,
    request,
    onEvent: (callback: (event: DevToolsEventPayload) => void) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    }
  } as unknown as DevToolsPanelEndpoint;
  const state = signal<DevToolsPanelNegotiationState | null>('v2');
  TestBed.configureTestingModule({
    providers: [I18nStateService, { provide: DevToolsEndpointService, useValue: { state, resolve: () => endpoint } }]
  });
  const service = TestBed.inject(I18nStateService);
  TestBed.tick();
  return { service, listeners, request, state };
};
afterEach(() => TestBed.resetTestingModule());

describe('国际化面板的会话状态', () => {
  it('读取快照并沿已有database.events接收语言、目录和诊断变化', async () => {
    const { service, request, listeners } = setup();
    await vi.waitFor(() => expect(service.snapshot()?.locale).toBe('en'));
    expect(request).toHaveBeenCalledWith('database', 'inspect', {});
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('database', 'events', {}));
    for (const listener of listeners)
      listener({ eventType: 'I18N_CHANGED', data: { ...snapshot(), locale: 'zh-Hans' } });
    expect(service.snapshot()?.locale).toBe('zh-Hans');
    TestBed.resetTestingModule();
    expect(listeners.size).toBe(0);
  });
  it('旧connector无i18n字段，或readonly/未授权时，绝不发送任何清空请求', async () => {
    const old = setup({ version: '1', entities: [] });
    await vi.waitFor(() => expect(old.service.loading()).toBe(false));
    await old.service.clearMissing();
    expect(old.request.mock.calls.some(call => call[0] === 'settings')).toBe(false);
    TestBed.resetTestingModule();
    const readonly = setup({ i18n: snapshot(true) }, 'readonly');
    await vi.waitFor(() => expect(readonly.service.snapshot()).not.toBeNull());
    await readonly.service.clearMissing();
    expect(readonly.request.mock.calls.some(call => call[0] === 'settings')).toBe(false);
  });
  it('显式允许时只发送精确i18n scope，并在成功后重新读快照', async () => {
    const { service, request } = setup();
    await vi.waitFor(() => expect(service.snapshot()).not.toBeNull());
    request.mockClear();
    await service.clearMissing();
    expect(request).toHaveBeenCalledWith('settings', 'clear', { scope: 'i18n-missing' });
    expect(request).toHaveBeenCalledWith('database', 'inspect', {});
  });
  it('断连后丢弃在途快照，不把旧会话数据带进新页面', async () => {
    const { service, request, state } = setup();
    await vi.waitFor(() => expect(service.snapshot()).not.toBeNull());
    const pending = Promise.withResolvers<{ outcome: 'ok'; result: unknown }>();
    request.mockReturnValueOnce(pending.promise as ReturnType<typeof request>);
    const refresh = service.refresh();
    state.set(null);
    TestBed.tick();
    pending.resolve({ outcome: 'ok', result: { i18n: snapshot() } });
    await refresh;
    expect(service.snapshot()).toBeNull();
  });
  it('较旧的inspect响应不能覆盖已收到的新语言事件', async () => {
    const { service, request, listeners } = setup();
    await vi.waitFor(() => expect(service.snapshot()).not.toBeNull());
    const pending = Promise.withResolvers<DevToolsPanelRequestResult>();
    request.mockReturnValueOnce(pending.promise);
    const refresh = service.refresh();
    for (const listener of listeners) listener({ eventType: 'I18N_CHANGED', data: { ...snapshot(), locale: 'fr' } });
    pending.resolve({ outcome: 'ok', result: { i18n: snapshot() } });
    await refresh;
    expect(service.snapshot()?.locale).toBe('fr');
  });
});
