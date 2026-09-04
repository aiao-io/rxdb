/**
 * @fileoverview 把本次启动的自检结论报给 Rust 侧（US-210 AC#9）。
 *
 * @module services/selfcheck-reporter
 */

import { invoke } from '@tauri-apps/api/core';
import type { DevToolsProbeResult } from '../devtools-probe';
import type { StorageProbeResult } from '../storage-probe';
import type { WebviewProbeResult } from '../webview-probe';
import { isTauriRuntime } from './tauri-environment';

/**
 * 自检结论的三个取值。
 *
 * @remarks
 * 与 `src-tauri/src/selfcheck.rs` 的 `SelfCheckStatus` 逐字对应，那边有一条单测把这三个
 * 字面量钉死。漂了的表现是「上报了但 Rust 侧反序列化失败」→ 没有报告 → 只能等看门狗超时，
 * 编译器在这条缝上帮不上任何忙。
 */
export type SelfCheckStatus = 'ok' | 'failed' | 'timedOut';

/** 上报给 Rust 侧的结论。 */
export interface SelfCheckOutcome {
  /** 结论本身。 */
  readonly status: SelfCheckStatus;
  /** 本次读回的累计启动次数；只有 `ok` 时有值。 */
  readonly launchCount?: number;
  /** 失败原因；只有失败方向有值。 */
  readonly message?: string;
  /**
   * 文件存储探针的结果；只有 `ok` 时有值（US-505 AC#1 / AC#3）。
   *
   * @remarks
   * 三个字段名与 `selfcheck.rs` 的 `StorageProbe`（serde `rename_all = "camelCase"`）
   * 逐字对应，那边有一条单测把它们钉死。
   */
  readonly storage?: StorageProbeResult;
  /**
   * webview 能力探针的结果（US-505 AC#6）；只有 `ok` 时有值。
   *
   * @remarks
   * 允许 `null` 而不是「没跑就不带这个字段」：没设 {@link readProbeBaseUrl} 那个环境变量时
   * 探针本来就不该跑，而 `null` 把「跑了但没结果」这种不可能的中间态直接消掉了 ——
   * Rust 侧 `Option<WebviewProbe>` 收 `null` 与收缺字段是同一个 `None`。
   */
  readonly webview?: WebviewProbeResult | null;
  /**
   * DevTools 双 WebView 握手探针的结果（US-905 阶段 1 AC#2）；只有 `ok` 时有值。
   *
   * @remarks
   * 允许 `null` 的理由同 {@link SelfCheckOutcome.webview}：没开这条探针时它本来就不该跑。
   */
  readonly devtools?: DevToolsProbeResult | null;
}

/** Rust 侧命令名，由 `#[tauri::command] rxdb_selfcheck_report` 的函数名决定。 */
const SELFCHECK_COMMAND = 'rxdb_selfcheck_report';

/** Rust 侧命令名，由 `#[tauri::command] rxdb_selfcheck_probe_base_url` 的函数名决定。 */
const PROBE_BASE_URL_COMMAND = 'rxdb_selfcheck_probe_base_url';

/** Rust 侧命令名，由 `#[tauri::command] rxdb_selfcheck_devtools_probe` 的函数名决定。 */
const DEVTOOLS_PROBE_COMMAND = 'rxdb_selfcheck_devtools_probe';

/**
 * 上报自检结论。**永不 reject。**
 *
 * @param outcome - 本次启动的结论
 * @param runtime - 运行时对象，实际调用传 `globalThis`；参数化是为了让两条分支都能被测到
 *
 * @remarks
 * 非 Tauri 运行时直接返回：`invoke` 会去读 `window.__TAURI_INTERNALS__.invoke`，在浏览器
 * 预览（`nx serve`）里那是一次 `TypeError`。这是**运行时能力**判定，不是「是不是自检模式」
 * 的判定 —— 后者的真相源在 Rust 侧（没设环境变量就查不到观察者），renderer 无条件上报即可。
 * 让 renderer 也去判断一次自检模式的话，判断依据只能是另一份从 Rust 传过来的状态，
 * 于是凭空多出第二个真相源。
 *
 * 失败只写 console：这条调用挂在 app initializer 的链上，而那条链一旦 reject，Angular 会
 * 中止 bootstrap（TAURI-01）。上报失败时 Rust 侧的看门狗仍会给出一份写着 `timedOut` 的报告。
 */
export const reportSelfCheck = async (outcome: SelfCheckOutcome, runtime: unknown): Promise<void> => {
  if (!isTauriRuntime(runtime)) return;
  try {
    await invoke(SELFCHECK_COMMAND, { outcome });
  } catch (error) {
    console.error('self-check report failed', error);
  }
};

/**
 * 问 Rust 侧要 webview 探针的服务根地址。
 *
 * @param runtime - 运行时对象，实际调用传 `globalThis`
 * @returns 根地址；非自检模式、或自检模式下没设那个环境变量时是 `null`
 * @throws 命令调用失败时抛出
 *
 * @remarks
 * 与 {@link reportSelfCheck} 不同，这里**不吞异常**。两者的处境是反的：上报是整条启动链的
 * 最后一步，它失败了 Rust 侧还有看门狗兜住；而这一步失败会让 webview 探针整个不跑，
 * 报告里只剩一个 `webview: null` —— 那与「本来就没开探针」长得一模一样。抛出去由
 * `startLocalDatabase` 落成 `status: 'failed'` + 原因，才看得见是这一步坏了。
 *
 * 非 Tauri 运行时返回 `null` 不是兜底：浏览器预览里根本没有 Rust 侧可问，
 * 「没有探针地址」就是那个环境的事实。
 */
export const readProbeBaseUrl = async (runtime: unknown): Promise<string | null> => {
  if (!isTauriRuntime(runtime)) return null;
  return await invoke<string | null>(PROBE_BASE_URL_COMMAND);
};

/**
 * 问 Rust 侧「这次要不要跑 DevTools 握手探针」（US-905 阶段 1 AC#2）。
 *
 * @param runtime - 运行时对象，实际调用传 `globalThis`
 * @returns 要跑就是 `true`；非自检模式、没设那个环境变量、或不在 Tauri 运行时都是 `false`
 * @throws 命令调用失败时抛出
 *
 * @remarks
 * 与 {@link readProbeBaseUrl} 同一形态与同一取舍：不吞异常。这一步失败会让探针整个不跑，
 * 报告里只剩一个 `devtools: null` —— 那与「本来就没开探针」长得一模一样。
 *
 * 非 Tauri 运行时返回 `false` 不是兜底：浏览器预览里既没有 Rust 侧可问，也没有调试窗口。
 */
export const readDevToolsProbeEnabled = async (runtime: unknown): Promise<boolean> => {
  if (!isTauriRuntime(runtime)) return false;
  return await invoke<boolean>(DEVTOOLS_PROBE_COMMAND);
};
