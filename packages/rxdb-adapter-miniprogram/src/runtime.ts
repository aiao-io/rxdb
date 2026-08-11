export type {
  MiniProgramRandomValuesOptions,
  MiniProgramRandomValuesResult,
  MiniProgramWechatApi
} from './mini-program.interface.js';
export {
  MAX_MINI_PROGRAM_RANDOM_POOL_SIZE,
  fillMiniProgramRandomValues,
  getMiniProgramRuntimeSources,
  installMiniProgramRuntimePolyfills,
  prepareMiniProgramRuntime
} from './runtime-polyfills.js';
export type {
  MiniProgramRuntimeSource,
  MiniProgramRuntimeSources,
  PrepareMiniProgramRuntimeOptions
} from './runtime-polyfills.js';
