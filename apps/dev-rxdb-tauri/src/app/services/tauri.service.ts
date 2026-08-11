import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { AppVersions, parseAppVersions, parsePlatform, parseRuntimeHealth, RuntimeHealth } from './tauri-contracts';
import { isTauriRuntime } from './tauri-environment';

export type { AppVersions, RuntimeHealth };

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/**
 * Rust 后端的 IPC 门面。
 *
 * @remarks
 * 三个方法各自对应 `src-tauri/src/lib.rs` 里的一条 `#[tauri::command]`。
 * 返回值一律过 `tauri-contracts` 的解析器 —— `invoke()` 的泛型只是断言，
 * 不校验任何东西，两端契约漂移在这里才能被抓住（TAURI-02）。
 */
@Injectable({
  providedIn: 'root'
})
export class TauriService {
  private _isTauri?: boolean;

  /** 当前是否运行在 Tauri 窗口里；探测结果缓存，浏览器预览下为 `false`。 */
  get isTauri(): boolean {
    if (this._isTauri === undefined) {
      this._isTauri = this.detectTauriEnvironment();
    }
    return this._isTauri;
  }

  /**
   * 取宿主平台标识。
   *
   * @returns Tauri 下为 Rust 的 `std::env::consts::OS`；浏览器预览下为 `'browser'`
   */
  async getPlatform(): Promise<string> {
    if (!this.isTauri) return 'browser';
    return parsePlatform(await invoke('get_platform'));
  }

  /**
   * 取 Tauri 运行时版本。
   *
   * @returns Rust 上报的版本信息
   * @throws 不在 Tauri 环境、或返回值不符合契约时抛出
   *
   * @remarks
   * 浏览器预览下**直接拒绝**，而不是返回一个空对象。空对象会让调用方以为
   * 「查到了，只是没有版本号」—— 这正是 TAURI-02 里那两个永远为空的字段的由来。
   */
  async getVersions(): Promise<AppVersions> {
    if (!this.isTauri) return Promise.reject(new Error('Tauri API not available'));
    return parseAppVersions(await invoke('get_versions'));
  }

  /**
   * 查询 Rust 后端自报的运行状态。
   *
   * @returns 后端状态；`status !== 'ready'` 需由调用方当作异常处理
   * @throws 不在 Tauri 环境、或返回值不符合契约时抛出
   */
  async checkRuntime(): Promise<RuntimeHealth> {
    if (!this.isTauri) return Promise.reject(new Error('Tauri API not available'));
    return parseRuntimeHealth(await invoke('check_runtime'));
  }

  private detectTauriEnvironment(): boolean {
    return typeof window !== 'undefined' && isTauriRuntime(window);
  }
}
