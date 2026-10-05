export {
  MINI_PROGRAM_PLATFORM_IDS,
  MiniProgramUnknownPlatformError,
  MiniProgramUnsupportedPlatformError,
  assertMiniProgramPlatformId,
  createWechatMiniProgramHost,
  isMiniProgramPlatformId
} from './host.js';
export type {
  AlipayRandomWorker,
  AlipayStandardWasmApi,
  MiniProgramAlipayApi,
  MiniProgramAlipayRawFileSystem
} from './hosts/alipay-api.js';
export {
  ALIPAY_UNDOCUMENTED_CAPABILITIES,
  AlipayUndocumentedCapabilityError,
  type AlipayUndocumentedCapability
} from './hosts/alipay-capability.js';
export { ALIPAY_WASM_TEXT_COPY_SUFFIX, createAlipayWasmRuntime } from './hosts/alipay-wasm.js';
export { createAlipayMiniProgramHost, type AlipayMiniProgramHostOptions } from './hosts/alipay.js';
export { createDouyinMiniProgramHost, type DouyinMiniProgramHostOptions } from './hosts/douyin.js';
export type {
  MiniProgramDouyinApi,
  MiniProgramFileLayout,
  MiniProgramFileSystemManager,
  MiniProgramHost,
  MiniProgramHostCapabilityNames,
  MiniProgramPlatformId,
  MiniProgramRandomValuesOptions,
  MiniProgramRandomValuesResult,
  MiniProgramRuntimeGlobal,
  MiniProgramWechatApi
} from './mini-program.interface.js';
export { resolveMiniProgramRuntimeGlobal } from './runtime-global.js';
export {
  DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE,
  MAX_MINI_PROGRAM_RANDOM_POOL_SIZE,
  fillMiniProgramRandomValues,
  getMiniProgramRuntimeSources,
  installMiniProgramRuntimePolyfills,
  prepareMiniProgramHostRuntime,
  prepareMiniProgramRuntime
} from './runtime-polyfills.js';
export type {
  MiniProgramRuntimeSource,
  MiniProgramRuntimeSources,
  PrepareMiniProgramRuntimeOptions
} from './runtime-polyfills.js';
