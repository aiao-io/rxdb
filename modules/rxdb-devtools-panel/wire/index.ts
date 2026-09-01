/**
 * @fileoverview 扩展 v1 wire 的唯一事实源：面板、background service worker、content script 共用。
 *
 * @remarks
 * 这是一个**不含任何 `@angular/*` 依赖**的次入口，理由是硬的：background 是 MV3 service
 * worker，content script 跑在页面上下文，它们都要 import 这份信封与校验；若从主入口
 * `@modules/rxdb-devtools-panel` 拿，整个 Angular 运行时会被拖进 service worker bundle。
 *
 * 落在 library 而不是留在 `apps/rxdb-devtools-extension/src/shared/` 的理由同样是硬的：
 * US-904 阶段 C 要求 library **不得依赖 `apps/`**（方向只能是 app → library），而面板组件与状态
 * 服务必须认识 {@link DevToolsMessage}。留在 app 侧就只剩「复制一份到 library」这一条路，
 * 复制必然漂移。
 *
 * @module @modules/rxdb-devtools-panel/wire
 */

export {
  isRelayFrameTowards,
  isRelayHandshake,
  relayDirectionOf,
  type DevToolsRelayDirection,
  type DevToolsRelayFrame
} from './relay';
export {
  RXDB_DEVTOOLS_MESSAGE,
  isDevToolsMessage,
  type DevToolsMessage,
  type ExtensionMessageType,
  type ExtensionOnlyMessageType,
  type InitMessage,
  type InspectedWindowScriptResultPayload
} from './types';
export { base64ToBytes, bytesToBase64 } from './utils/base64';
export { configureLogger, logger } from './utils/logger';
export { normalizePath } from './utils/path';
