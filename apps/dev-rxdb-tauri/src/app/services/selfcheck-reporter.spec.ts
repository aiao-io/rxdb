import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendBackupArchiveChunk,
  readBackupArchiveChunk,
  readBackupProbeMode,
  readProbeBaseUrl,
  reportSelfCheck
} from './selfcheck-reporter';

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

describe('备份探针的三个命令（US-217 AC#18）', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  /** 命令名由 Rust 侧函数名 `rxdb_selfcheck_backup_probe` 决定；模式字面量由 `BackupProbeMode` 的 serde 名决定。 */
  it('读模式：把 Rust 侧给的模式原样交出来', async () => {
    invokeMock.mockResolvedValue('restore');
    await expect(readBackupProbeMode(tauriRuntime)).resolves.toBe('restore');
    expect(invokeMock).toHaveBeenCalledWith('rxdb_selfcheck_backup_probe');
  });

  it('读模式：非 Tauri 运行时下不去问，直接说没有', async () => {
    await expect(readBackupProbeMode({})).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('读模式：命令失败时向上抛，而不是伪装成「没开探针」', async () => {
    invokeMock.mockRejectedValue(new Error('command not found'));
    await expect(readBackupProbeMode(tauriRuntime)).rejects.toThrow(/command not found/);
  });

  /** 参数名 `offset` / `length` 由 Rust 侧形参名决定；响应是原始字节（`tauri::ipc::Response`）。 */
  it('读块：按偏移与长度要一块，把 ArrayBuffer 交成 Uint8Array', async () => {
    invokeMock.mockResolvedValue(Uint8Array.of(1, 2, 3).buffer);
    await expect(readBackupArchiveChunk(65_536, 4096)).resolves.toEqual(Uint8Array.of(1, 2, 3));
    expect(invokeMock).toHaveBeenCalledWith('rxdb_selfcheck_backup_archive_read', { offset: 65_536, length: 4096 });
  });

  /** 请求体是原始字节：Rust 侧只收 `InvokeBody::Raw`，经 JSON 的数字数组会被拒。 */
  it('追加：把块作为原始请求体交出去', async () => {
    invokeMock.mockResolvedValue(undefined);
    const chunk = Uint8Array.of(9, 8, 7);
    await appendBackupArchiveChunk(chunk);
    expect(invokeMock).toHaveBeenCalledWith('rxdb_selfcheck_backup_archive_append', chunk);
  });
});
