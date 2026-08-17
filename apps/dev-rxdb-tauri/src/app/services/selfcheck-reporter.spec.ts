import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportSelfCheck } from './selfcheck-reporter';

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
