import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDevToolsBrowserSettingsProvider } from '../../browser/settings-provider.js';
import {
  createDevToolsDesktopSettingsDescriptor,
  createDevToolsDesktopSettingsProvider
} from '../../native/settings-provider.js';

/**
 * 装一个**计数**的宿主探针。
 *
 * @remarks
 * 判据是「读取次数为 0」，所以每个入口都必须可数。Electron 端多装一层 `require`：
 * 主进程手上就有 SQLite 句柄与 userData 路径，「先打开库、发现导出没实现再返回」
 * 在这一端最省事，也最容易把「零读取」偷偷变成「恰好没读」。
 */
function installHostProbe(): { calls: number } {
  const probe = { calls: 0 };
  const trap = (): never => {
    probe.calls += 1;
    throw new Error('devtools settings provider MUST NOT touch host storage');
  };
  vi.stubGlobal('navigator', { storage: { getDirectory: trap } });
  vi.stubGlobal('require', trap);
  return probe;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop settings provider — descriptor', () => {
  it('MUST declare only the export operation with transfers disabled', () => {
    // `maxTransferBytes: 0` 是「下载禁用」在协议上的形态：面板据此把按钮画成禁用态，
    // 而不是画出来再由对端拒绝。
    expect(createDevToolsDesktopSettingsDescriptor('electron')).toEqual({
      domain: 'settings',
      version: 1,
      kind: 'sqlite',
      operations: ['export'],
      runtime: 'electron',
      limits: { maxTransferBytes: 0 }
    });
  });

  it('MUST take runtime and nothing else', () => {
    // runtime 之外再收一个 ports 入参就等于握着句柄；没有句柄，也就没有「顺手读一下」的可能。
    expect(createDevToolsDesktopSettingsProvider).toHaveLength(1);
  });

  it('MUST answer the same everywhere except for the runtime it displays', async () => {
    const electron = createDevToolsDesktopSettingsProvider('electron');
    const tauri = createDevToolsDesktopSettingsProvider('tauri');

    // 两个桌面宿主读到的 settings 语义只能有一份：kind / operations / limits 逐字相同，
    // 差别只允许出现在「显示来源」这一个字段上。分叉了，面板就得按 runtime 分支处理同一个域。
    expect(tauri.descriptor).toEqual({ ...electron.descriptor, runtime: 'tauri' });
    for (const operation of ['export', 'clear', 'import']) {
      expect(await tauri.invoke(operation, {})).toEqual(await electron.invoke(operation, {}));
    }
  });
});

describe('desktop settings provider — AC#49', () => {
  it('MUST answer export_unsupported without reading SQLite, WAL or any directory', async () => {
    const probe = installHostProbe();
    const provider = createDevToolsDesktopSettingsProvider('electron');

    const result = await provider.invoke('export', { path: 'db/main.sqlite' });

    expect(result).toEqual({ outcome: 'failed', error: { code: 'export_unsupported', retryable: false } });
    expect(probe.calls).toBe(0);
  });

  it('MUST answer provider_unsupported for the undeclared clear operation', async () => {
    const probe = installHostProbe();
    const provider = createDevToolsDesktopSettingsProvider('electron');

    expect(await provider.invoke('clear', {})).toEqual({
      outcome: 'failed',
      error: { code: 'provider_unsupported', retryable: false }
    });
    expect(probe.calls).toBe(0);
  });

  it('MUST answer identically to the browser provider for every operation', async () => {
    const electron = createDevToolsDesktopSettingsProvider('electron');
    const browser = createDevToolsBrowserSettingsProvider();

    // 同一个域在两端读到不同的答案，就意味着面板得按 runtime 分支处理它——
    // 而那正是「绕过 UI 直接发命令」能钻的缝。
    for (const operation of ['export', 'clear', 'import', 'toString']) {
      expect(await electron.invoke(operation, {})).toEqual(await browser.invoke(operation, {}));
    }
  });
});
