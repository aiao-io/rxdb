/**
 * @fileoverview 探针用的正式支付宝 host：直接引用 adapter 源码里的 `hosts/alipay*`。
 *
 * 可行性矩阵转 `supported` 之前，这些模块不从包入口导出（见 `hosts/alipay.ts`），探针只能按源码路径引用；
 * 探针验的就是将来要导出的这份实现，不另抄一份。
 */
/* eslint-disable @nx/enforce-module-boundaries -- 支付宝 host 转 supported 之前不从包入口导出，只能按源码路径引用 */
export type {
  AlipayRandomWorker,
  AlipayStandardWasmApi
} from '../../../packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.js';
export {
  ALIPAY_FRAME_HEADER,
  createAlipayCodePackageReader,
  isAlipayFsFailure,
  unwrapAlipayFsResult
} from '../../../packages/rxdb-adapter-miniprogram/src/hosts/alipay-file-system.js';
export { ALIPAY_RANDOM_TIMEOUT_MS } from '../../../packages/rxdb-adapter-miniprogram/src/hosts/alipay-random.js';
export {
  ALIPAY_WASM_FINGERPRINT,
  ALIPAY_WASM_TEXT_COPY_SUFFIX,
  createAlipayWasmRuntime,
  fingerprintWasm,
  readAlipayCodePackageWasm
} from '../../../packages/rxdb-adapter-miniprogram/src/hosts/alipay-wasm.js';
export {
  createAlipayMiniProgramHost,
  type AlipayMiniProgramHost
} from '../../../packages/rxdb-adapter-miniprogram/src/hosts/alipay.js';
/* eslint-enable @nx/enforce-module-boundaries */
