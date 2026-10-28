import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { isDevToolsI18nSnapshot, withI18nSettings, type DevToolsI18nPort } from '../i18n-port.js';
import type { DevToolsProvider } from '../provider/types.js';
import { authorizeOperation } from '../v2/authorization.js';

const settings = (): DevToolsProvider => ({
  descriptor: {
    domain: 'settings',
    version: 1,
    kind: 'opfs',
    runtime: 'browser',
    limits: { maxTransferBytes: 0 },
    operations: ['clear', 'export']
  },
  invoke: vi.fn(async () => ({ outcome: 'ok' as const, result: 'legacy result' }))
});
const source = (): DevToolsI18nPort => ({
  inspection$: new BehaviorSubject(0),
  inspect: async () => ({ locale: 'en', availableLocales: ['en'], messages: [], missingMessages: [] }),
  clearMissingMessages: vi.fn(async () => undefined)
});

describe('国际化诊断清空边界', () => {
  it('无scope时原参数、返回值和旧settings调用完全保留', async () => {
    const original = settings();
    const port = source();
    const wrapped = withI18nSettings(original, port);
    const params = { path: 'original' };
    expect(await wrapped.invoke('clear', params)).toEqual({ outcome: 'ok', result: 'legacy result' });
    expect(original.invoke).toHaveBeenCalledWith('clear', params);
    expect(port.clearMissingMessages).not.toHaveBeenCalled();
  });
  it('export-only descriptor下即使底层host支持clear，普通clear仍不得越过旧能力边界', async () => {
    const original = settings();
    const wrapped = withI18nSettings(
      { ...original, descriptor: { ...original.descriptor, operations: ['export'] } },
      source()
    );
    expect(wrapped.descriptor.operations).toEqual(['clear', 'export']);
    expect(await wrapped.invoke('clear', {})).toMatchObject({
      outcome: 'failed',
      error: { code: 'provider_unsupported' }
    });
    expect(original.invoke).not.toHaveBeenCalled();
  });
  it('i18n scope只触碰诊断，未知scope或混入其它字段均拒绝且不委托settings', async () => {
    const original = settings();
    const port = source();
    const wrapped = withI18nSettings(original, port);
    expect(await wrapped.invoke('clear', { scope: 'i18n-missing' })).toEqual({ outcome: 'ok', result: null });
    expect(port.clearMissingMessages).toHaveBeenCalledTimes(1);
    for (const params of [{ scope: 'unknown' }, { scope: 'i18n-missing', path: '/' }, { scope: undefined }])
      expect(await wrapped.invoke('clear', params)).toMatchObject({
        outcome: 'failed',
        error: { code: 'provider_unsupported' }
      });
    expect(original.invoke).not.toHaveBeenCalled();
  });
  it('没有清空端口时拒绝，readonly与未opt-in的full档仍由既有矩阵拦截', async () => {
    const original = settings();
    const wrapped = withI18nSettings(original);
    expect(await wrapped.invoke('clear', { scope: 'i18n-missing' })).toMatchObject({ outcome: 'failed' });
    const input = { descriptors: [original.descriptor], domain: 'settings' as const, operation: 'clear' };
    expect(authorizeOperation({ ...input, capability: 'readonly', mutationPolicy: 'allow' }).outcome).toBe(
      'silent-drop'
    );
    expect(authorizeOperation({ ...input, capability: 'full', mutationPolicy: 'omit' }).outcome).toBe('rejected');
    expect(authorizeOperation({ ...input, capability: 'full', mutationPolicy: 'allow' }).outcome).toBe('allowed');
  });
  it('wire快照逐行校验，非法行不能被静默丢弃', () => {
    const snapshot = {
      locale: 'en',
      availableLocales: ['en'],
      messages: [],
      missingMessages: [],
      canClearMissing: false
    };
    expect(isDevToolsI18nSnapshot(snapshot)).toBe(true);
    expect(isDevToolsI18nSnapshot({ ...snapshot, messages: [{ locale: 'en' }] })).toBe(false);
    expect(
      isDevToolsI18nSnapshot({
        ...snapshot,
        messages: [
          { locale: 'en', namespace: 'app', key: 'x', value: 'x', source: { toString: () => 'db' }, active: true }
        ]
      })
    ).toBe(false);
    expect(isDevToolsI18nSnapshot({ ...snapshot, missingMessages: [{ key: 'missing' }] })).toBe(false);
  });
});
