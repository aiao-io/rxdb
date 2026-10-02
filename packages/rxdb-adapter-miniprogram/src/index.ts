/**
 * 小程序 wa-sqlite adapter（微信与抖音，实验性）。
 *
 * 提供小程序运行 RxDB 所需的全套基础设施：WASM 加载、同步文件 VFS、
 * 运行时 polyfill（TextEncoder/TextDecoder/structuredClone/crypto）、
 * 以及同步回调加固。
 *
 * @packageDocumentation
 */
export { WaSqliteMiniProgramClient, createWaSqliteMiniProgramClient } from './create-client.js';
export {
  MINI_PROGRAM_PLATFORM_IDS,
  MiniProgramUnknownPlatformError,
  createWechatMiniProgramHost,
  isMiniProgramPlatformId,
  resolveMiniProgramHost
} from './host.js';
export { createDouyinMiniProgramHost, type DouyinMiniProgramHostOptions } from './hosts/douyin.js';
export { loadWaSqliteMiniProgramModule, type MiniProgramWasmHost } from './loader.js';
export { ADAPTER_NAME, DEFAULT_WASM_PATH } from './mini-program.interface.js';
export type {
  MiniProgramDouyinApi,
  MiniProgramFileLayout,
  MiniProgramFileSystemManager,
  MiniProgramHost,
  MiniProgramHostCapabilityNames,
  MiniProgramHostSelection,
  MiniProgramPlatformId,
  MiniProgramRuntimeGlobal,
  MiniProgramWasmInstance,
  MiniProgramWasmRuntime,
  MiniProgramWechatApi,
  ReceiveWasmInstance,
  WaSqliteEmscriptenModule,
  WaSqliteMiniProgramAdapterOptions,
  WaSqliteMiniProgramBaseOptions,
  WaSqliteMiniProgramHostOptions,
  WaSqliteMiniProgramOptions,
  WaSqliteMiniProgramRepositoryConstructor,
  WaSqliteMiniProgramOptions as WaSqliteMiniprogramOptions,
  WaSqliteModuleFactory,
  WaSqliteModuleFactoryOptions
} from './mini-program.interface.js';
export { assertMiniProgramRuntimeCapabilities, checkMiniProgramRuntimeCapabilities } from './runtime-capabilities.js';
export type { MiniProgramRuntimeCapability, MiniProgramRuntimeCapabilityOptions } from './runtime-capabilities.js';
export { resolveMiniProgramRuntimeGlobal } from './runtime-global.js';
export {
  RxDBAdapterWaSqliteMiniProgram,
  RxDBAdapterWaSqliteMiniProgram as RxDBAdapterWaSqliteMiniprogram
} from './RxDBAdapterWaSqliteMiniProgram.js';
export { SUBFRAME_WASM_SUBPATH, loadSubframeModuleFactory } from './subframe-glue.js';
export { createMiniProgramFileVFS, createWechatFileVFS } from './wechat-file-vfs.js';
export type {
  MiniProgramFileVFS,
  MiniProgramFileVFSOptions,
  WechatFileVFS,
  WechatFileVFSOptions
} from './wechat-file-vfs.js';
