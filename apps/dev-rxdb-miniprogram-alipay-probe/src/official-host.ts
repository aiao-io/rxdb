/**
 * @fileoverview 探针用的正式支付宝 host：公开 API 走包入口，探针自查用的内部常量与工具按源码路径引用。
 *
 * 支付宝 2026-10-04 改判 supported 后 host、wasm 运行时与类型都从包入口导出；帧头、指纹、FS 失败归一这些
 * 不属于公开契约，探针要核对它们，只能按源码路径引用，不另抄一份。
 */
export {
  ALIPAY_WASM_TEXT_COPY_SUFFIX,
  createAlipayMiniProgramHost,
  createAlipayWasmRuntime,
  type AlipayRandomWorker,
  type AlipayStandardWasmApi
} from '@aiao/rxdb-adapter-miniprogram';
/* eslint-disable @nx/enforce-module-boundaries -- 帧头、指纹、FS 失败归一是 host 内部实现，不进包入口；探针要逐项核对 */
export {
  ALIPAY_FRAME_HEADER,
  createAlipayCodePackageReader,
  isAlipayFsFailure,
  unwrapAlipayFsResult
} from '../../../packages/rxdb-adapter-miniprogram/src/hosts/alipay-file-system.js';
export { ALIPAY_RANDOM_TIMEOUT_MS } from '../../../packages/rxdb-adapter-miniprogram/src/hosts/alipay-random.js';
export {
  ALIPAY_WASM_FINGERPRINT,
  fingerprintWasm,
  readAlipayCodePackageWasm
} from '../../../packages/rxdb-adapter-miniprogram/src/hosts/alipay-wasm.js';
/* eslint-enable @nx/enforce-module-boundaries */
