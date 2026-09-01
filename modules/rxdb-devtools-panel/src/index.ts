/**
 * @fileoverview RxDB DevTools 面板 UI 的平台中立入口。
 *
 * @remarks
 * 这是一个 `private: true` 的**内部** library，不发 npm、不计入公开包统计：
 * 它的唯一消费者是各宿主的 DevTools 外壳（Chrome 扩展、Electron、Tauri）。
 * 每个宿主只需提供 {@link DEVTOOLS_TRANSPORT}、{@link DEVTOOLS_HOST_ACCESS}、
 * {@link DEVTOOLS_FILE_CHANNEL}、{@link DEVTOOLS_PANEL_VERSION} 四份 provider，
 * 面板本身对宿主一无所知。
 *
 * @module @modules/rxdb-devtools-panel
 */

export { AppComponent } from './app.component';
export { routes } from './app.routes';
export { ConnectionGuardComponent } from './components/connection-guard.component';
export { ToastService } from './components/toast.component';
export {
  INSPECTED_WINDOW_SCRIPT_RESULT,
  clearDatabase,
  createScriptRequestId,
  executeInInspectedWindow,
  serializeFunctionWithResult,
  type ClearDatabaseResult,
  type ScriptResultPayload
} from './scripts';
export { DatabaseStateService } from './services/database-state.service';
export { DevToolsEndpointService } from './services/devtools-endpoint.service';
export { DevToolsStateService } from './services/devtools-state.service';
export { OpfsService } from './services/opfs.service';
export { ThemeService } from './services/theme.service';
export {
  DEVTOOLS_FILE_CHANNEL,
  DEVTOOLS_HOST_ACCESS,
  DEVTOOLS_PANEL_VERSION,
  DEVTOOLS_TRANSPORT,
  createDevToolsV2FileChannel,
  type DevToolsFileChannel,
  type DevToolsFileEntry,
  type DevToolsFileResult,
  type DevToolsFileUploadAck,
  type DevToolsHostAccess,
  type DevToolsHostAccessState,
  type DevToolsTransport
} from './transport';
export type {
  Branch,
  DbInfo,
  EntityData,
  EntityErrorKind,
  EntityInfo,
  OPFSFile,
  OpfsErrorKind,
  SerializedEvent,
  Theme
} from './types/devtools.types';
