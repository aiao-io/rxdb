/**
 * 微信小程序 wa-sqlite adapter。
 *
 * 提供小程序运行 RxDB 所需的全套基础设施：WASM 加载、同步文件 VFS、
 * 运行时 polyfill（TextEncoder/TextDecoder/structuredClone/crypto）、
 * 以及同步回调加固。
 *
 * @packageDocumentation
 */
export { WaSqliteMiniProgramClient, createWaSqliteMiniProgramClient } from './create-client.js';
export { loadWaSqliteMiniProgramModule } from './loader.js';
export { ADAPTER_NAME, DEFAULT_WASM_PATH } from './mini-program.interface.js';
export type {
  MiniProgramFileSystemManager,
  MiniProgramWasmInstance,
  MiniProgramWasmRuntime,
  MiniProgramWechatApi,
  ReceiveWasmInstance,
  WaSqliteEmscriptenModule,
  WaSqliteMiniProgramOptions,
  WaSqliteMiniProgramRepositoryConstructor,
  WaSqliteMiniProgramOptions as WaSqliteMiniprogramOptions,
  WaSqliteModuleFactory,
  WaSqliteModuleFactoryOptions
} from './mini-program.interface.js';
export { assertMiniProgramRuntimeCapabilities, checkMiniProgramRuntimeCapabilities } from './runtime-capabilities.js';
export type { MiniProgramRuntimeCapability } from './runtime-capabilities.js';
export {
  RxDBAdapterWaSqliteMiniProgram,
  RxDBAdapterWaSqliteMiniProgram as RxDBAdapterWaSqliteMiniprogram
} from './RxDBAdapterWaSqliteMiniProgram.js';
export { createWechatFileVFS } from './wechat-file-vfs.js';
export type { WechatFileVFS, WechatFileVFSOptions } from './wechat-file-vfs.js';
