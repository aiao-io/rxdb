import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readProbeBaseUrl, reportSelfCheck } from './selfcheck-reporter';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

/** 一个「看起来像 Tauri 窗口」的运行时对象，与 `isTauriRuntime` 的判据一致。 */
const tauriRuntime = { __TAURI_INTERNALS__: {} };

describe('reportSelfCheck', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  /**
   * 命令名与参数形状是跨语言契约：Rust 侧命令名由函数名 `rxdb_selfcheck_report` 决定，
   * 参数名由它的形参名 `outcome` 决定。任何一处漂了都只会表现为「上报了但没人收到」。
   */
  it('把结论原样交给 Rust 侧的命令', async () => {
    await reportSelfCheck({ status: 'ok', launchCount: 2 }, tauriRuntime);
    expect(invokeMock).toHaveBeenCalledWith('rxdb_selfcheck_report', {
      outcome: { status: 'ok', launchCount: 2 }
    });
  });

  /**
   * 浏览器预览（`nx serve`）里 `invoke` 会去读 `window.__TAURI_INTERNALS__.invoke`，
   * 那是一次 TypeError。而这条调用挂在 app initializer 的链上 —— 抛出去就是白屏（TAURI-01）。
   */
  it('非 Tauri 运行时下什么都不做', async () => {
    await expect(reportSelfCheck({ status: 'ok', launchCount: 1 }, {})).resolves.toBeUndefined();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  /** 上报失败也不能向上抛：Rust 侧的看门狗会兜住这种情况，而白屏没人兜。 */
  it('命令失败时不向上抛', async () => {
    invokeMock.mockRejectedValue(new Error('command not found'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(reportSelfCheck({ status: 'failed', message: 'boom' }, tauriRuntime)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('readProbeBaseUrl', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  /** 命令名同样是跨语言契约，由 Rust 侧函数名 `rxdb_selfcheck_probe_base_url` 决定。 */
  it('把 Rust 侧给的地址原样交出来', async () => {
    invokeMock.mockResolvedValue('http://127.0.0.1:54321');
    await expect(readProbeBaseUrl(tauriRuntime)).resolves.toBe('http://127.0.0.1:54321');
    expect(invokeMock).toHaveBeenCalledWith('rxdb_selfcheck_probe_base_url');
  });

  /** 非自检模式（以及自检模式但没设那个环境变量）下 Rust 侧给的就是 `None`。 */
  it('Rust 侧说没有时就是没有', async () => {
    invokeMock.mockResolvedValue(null);
    await expect(readProbeBaseUrl(tauriRuntime)).resolves.toBeNull();
  });

  it('非 Tauri 运行时下不去问，直接说没有', async () => {
    await expect(readProbeBaseUrl({})).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  // 与 `reportSelfCheck` 相反，这里**必须**抛：吞掉的话报告里只剩一个 `webview: null`，
  // 而那与「本来就没开探针」长得一模一样，e2e 侧拿不到任何可查的线索。
  it('命令失败时向上抛，而不是伪装成「没开探针」', async () => {
    invokeMock.mockRejectedValue(new Error('command not found'));
    await expect(readProbeBaseUrl(tauriRuntime)).rejects.toThrow(/command not found/);
  });
});
