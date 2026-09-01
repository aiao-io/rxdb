import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDevToolsBrowserSettingsProvider,
  DEVTOOLS_BROWSER_SETTINGS_DESCRIPTOR
} from '../../browser/settings-provider.js';

/**
 * 装一个**计数**的 `navigator.storage.getDirectory`。
 *
 * 判据是「读取次数为 0」，所以探针必须可数：不存在的方法只能证明「没法读」，
 * 证明不了「实现没读」——拒绝是可数的，沉默不是。
 */
function installStorageProbe(): { calls: number } {
  const probe = { calls: 0 };
  vi.stubGlobal('navigator', {
    storage: {
      getDirectory: () => {
        probe.calls += 1;
        return Promise.reject(new Error('devtools settings provider MUST NOT touch OPFS'));
      }
    }
  });
  return probe;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser settings provider — descriptor', () => {
  it('MUST declare only the export operation', () => {
    // `clear` 缺席是有意的：面板仍走 v1 脚本注入，宣告一个服务不了的操作会让面板点亮按钮。
    expect(DEVTOOLS_BROWSER_SETTINGS_DESCRIPTOR).toEqual({
      domain: 'settings',
      version: 1,
      kind: 'opfs',
      operations: ['export'],
      runtime: 'browser',
      limits: { maxTransferBytes: 0 }
    });
  });
});

describe('browser settings provider — AC#43 connector 侧', () => {
  it('MUST answer export_unsupported without touching OPFS', async () => {
    const probe = installStorageProbe();
    const provider = createDevToolsBrowserSettingsProvider();

    const result = await provider.invoke('export', { path: '' });

    expect(result).toEqual({ outcome: 'failed', error: { code: 'export_unsupported', retryable: false } });
    expect(probe.calls).toBe(0);
  });

  it('MUST refuse identically when the request carries a concrete target path', async () => {
    const probe = installStorageProbe();
    const provider = createDevToolsBrowserSettingsProvider();

    const result = await provider.invoke('export', { path: 'db/main.sqlite' });

    expect(result).toEqual({ outcome: 'failed', error: { code: 'export_unsupported', retryable: false } });
    expect(probe.calls).toBe(0);
  });

  it('MUST answer provider_unsupported for an undeclared settings operation', async () => {
    const provider = createDevToolsBrowserSettingsProvider();
    expect(await provider.invoke('clear', {})).toEqual({
      outcome: 'failed',
      error: { code: 'provider_unsupported', retryable: false }
    });
  });
});
