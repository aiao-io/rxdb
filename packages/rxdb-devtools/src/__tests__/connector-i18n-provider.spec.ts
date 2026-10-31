import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createConnectorProviders } from '../connector-providers.js';
import type { DevToolsI18nPort } from '../i18n-port.js';
import { createMockRxDB } from './fixtures/mock-rxdb.js';

const snapshot = { locale: 'en', availableLocales: ['en'], messages: [], missingMessages: [] };
const setup = (canClearI18nMissing = true) => {
  const inspection$ = new BehaviorSubject(0);
  const i18n: DevToolsI18nPort = {
    inspection$,
    inspect: vi.fn(async () => snapshot),
    clearMissingMessages: vi.fn(async () => undefined)
  };
  const emitEvent = vi.fn();
  const database = createMockRxDB();
  const providers = createConnectorProviders({
    i18n,
    canClearI18nMissing,
    database: { getRxDB: () => database, getEntityMetadata: () => ({ name: 'Entity', namespace: 'public' }), emitEvent }
  });
  return { providers, i18n, inspection$, emitEvent };
};

describe('兼容的国际化provider接线', () => {
  it('默认settings仅为诊断scope补clear能力，不新增wire领域或修改旧clear结果', async () => {
    const { providers, i18n } = setup();
    expect(providers.descriptors.map(value => value.domain)).toEqual(['database', 'settings']);
    expect(providers.provider('settings').descriptor.operations).toEqual(['clear', 'export']);
    expect(await providers.provider('database').invoke('inspect', {})).toMatchObject({
      outcome: 'ok',
      result: { i18n: { locale: 'en', canClearMissing: true } }
    });
    expect(await providers.provider('settings').invoke('clear', {})).toMatchObject({
      outcome: 'failed',
      error: { code: 'provider_unsupported' }
    });
    expect(i18n.clearMissingMessages).not.toHaveBeenCalled();
    expect(await providers.provider('settings').invoke('clear', { scope: 'i18n-missing' })).toEqual({
      outcome: 'ok',
      result: null
    });
    expect(i18n.clearMissingMessages).toHaveBeenCalledTimes(1);
    providers.dispose();
  });
  it('未允许mutation时snapshot明确canClearMissing=false', async () => {
    const { providers } = setup(false);
    expect(await providers.provider('database').invoke('inspect', {})).toMatchObject({
      result: { i18n: { canClearMissing: false } }
    });
    providers.dispose();
  });
  it('events推送当前快照，重复订阅幂等，dispose后退订且不再发消息', async () => {
    const { providers, inspection$, emitEvent } = setup();
    await providers.provider('database').invoke('events', {});
    await providers.provider('database').invoke('events', {});
    expect(inspection$.observers).toHaveLength(1);
    await vi.waitFor(() =>
      expect(emitEvent).toHaveBeenCalledWith('I18N_CHANGED', expect.objectContaining({ locale: 'en' }))
    );
    emitEvent.mockClear();
    providers.dispose();
    expect(inspection$.observed).toBe(false);
    inspection$.next(1);
    await Promise.resolve();
    expect(emitEvent).not.toHaveBeenCalled();
  });
  it('dispose丢弃还在等待的快照，不把旧会话结果送进下一会话', async () => {
    const { providers, i18n, emitEvent } = setup();
    const pending = Promise.withResolvers<typeof snapshot>();
    vi.mocked(i18n.inspect).mockReturnValueOnce(pending.promise);
    await providers.provider('database').invoke('events', {});
    providers.dispose();
    pending.resolve(snapshot);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(emitEvent).not.toHaveBeenCalled();
  });
});
