import { InjectionToken, type Signal } from '@angular/core';

/**
 * 面板对被检查页的访问授权状态。
 *
 * @remarks
 * 这是**跨宿主**的状态集合，不是 Chrome `optional_host_permissions` 的镜像：
 * Electron / Tauri 里被检查页天然可访问，adapter 直接常量 `'granted'`；
 * 页面属于宿主自身（`chrome://`、`devtools://`、`about:`）时是 `'unsupported'`。
 */
export type DevToolsHostAccessState = 'checking' | 'required' | 'requesting' | 'granted' | 'unsupported';

/**
 * 面板对被检查页的**宿主级**能力：授权、重载、注入求值。
 *
 * @remarks
 * 与 {@link DevToolsTransport} 分开是因为两者的失效方式不同 —— 控制信道断了会自动重连，
 * 宿主授权被拒则必须由用户点一次按钮。合并成一个 token 会让 `connection-guard` 无法
 * 区分「还没连上」和「没有权限」这两种需要不同 UI 的状态。
 */
export interface DevToolsHostAccess {
  /** 当前授权状态；`connection-guard` 据此在「请求授权 / 加载中 / 不支持 / 内容」间选分支。 */
  readonly state: Signal<DevToolsHostAccessState>;

  /** 最近一次授权失败的文案；无失败时为 `null`。 */
  readonly error: Signal<string | null>;

  /**
   * 请求访问当前被检查页。
   *
   * @returns 是否已获授权
   */
  requestAccess(): Promise<boolean>;

  /** 重载被检查页（清理数据后由面板发起，此时结果已在手，无竞态）。 */
  reloadInspectedPage(): void;

  /**
   * 在被检查页启动一段脚本并等待匹配 `requestId` 的异步结果。
   *
   * @param code - 由 `serializeFunctionWithResult` 生成的自回传表达式
   * @param requestId - 与 `code` 内嵌的同一个 id，用于配对结果消息
   * @throws 页面拒绝启动、脚本执行失败或等待超时时抛出错误
   */
  evaluate<T>(code: string, requestId: string): Promise<T>;
}

/** {@link DevToolsHostAccess} 的注入令牌。 */
export const DEVTOOLS_HOST_ACCESS = new InjectionToken<DevToolsHostAccess>('DEVTOOLS_HOST_ACCESS');
