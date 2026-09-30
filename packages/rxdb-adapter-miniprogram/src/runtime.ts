export {
  MINI_PROGRAM_PLATFORM_IDS,
  MiniProgramUnknownPlatformError,
  createWechatMiniProgramHost,
  isMiniProgramPlatformId
} from './host.js';
export type {
  MiniProgramFileSystemManager,
  MiniProgramHost,
  MiniProgramHostCapabilityNames,
  MiniProgramPlatformId,
  MiniProgramRandomValuesOptions,
  MiniProgramRandomValuesResult,
  MiniProgramWechatApi
} from './mini-program.interface.js';
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
