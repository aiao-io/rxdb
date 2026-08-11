import { Injectable } from '@angular/core';

// ELEC-05：契约的唯一事实源在 `src-electron/ipc-contract.ts`。
// 这里用 **type-only** 导入：类型在编译期被完全擦除，renderer 包体与运行时都不受影响，
// 但三处副本（main / preload / renderer）从此由编译器约束一致。
import type { DemoRequest, DemoResult, ElectronAPI } from '../../../src-electron/ipc-contract';

export type { DemoRequest, DemoResult, ElectronAPI };

/**
 * 渲染进程访问 preload 暴露的 `window.electron` 的入口。
 *
 * 同一份渲染进程代码既跑在 Electron 里、也跑在 `nx serve` 的浏览器里，
 * 因此每个成员都要能在「没有 Electron」时给出可用的降级值：
 * getter 返回 `undefined`，`runDemo()` 返回 rejected Promise。
 */
@Injectable({ providedIn: 'root' })
export class ElectronService {
  private readonly api = typeof window !== 'undefined' ? window.electron : undefined;

  /** 当前是否运行在 Electron 渲染进程中（即 preload 已注入 `window.electron`）。 */
  get isElectron(): boolean {
    return this.api !== undefined;
  }

  /** 宿主平台标识；非 Electron 环境下为 `undefined`。 */
  get platform(): NodeJS.Platform | undefined {
    return this.api?.platform;
  }

  /** Node / Chrome / Electron 版本号；非 Electron 环境下为 `undefined`。 */
  get versions(): ElectronAPI['versions'] | undefined {
    return this.api?.versions;
  }

  /**
   * 通过 IPC 调用主进程的 demo 处理器。
   *
   * @param request demo 入参
   * @returns 主进程返回的结果
   * @throws 当不在 Electron 环境（`window.electron` 缺失）时 reject
   */
  runDemo(request: DemoRequest): Promise<DemoResult> {
    if (!this.api) return Promise.reject(new Error('Electron API not available'));
    return this.api.runDemo(request);
  }
}
