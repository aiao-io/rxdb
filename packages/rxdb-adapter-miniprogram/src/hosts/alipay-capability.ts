/**
 * @fileoverview 支付宝宿主依赖的无文档能力，与它们缺失时的报错。
 *
 * 可行性文档的维护规则：正式 host 依赖的未文档化行为逐项列进矩阵 YAML 的 `undocumented`，host 在连接时检测，
 * 缺了就失败，报错指向矩阵。不许降级成别的实现。
 */
import { PLATFORM_FEASIBILITY_PATH } from '../host.js';

/**
 * 支付宝宿主依赖的无文档能力，与矩阵 YAML 里 alipay 的 `undocumented` 逐项一致（单测核对）。
 *
 * - `logic-layer-webassembly`：逻辑层的标准 `WebAssembly`（文档只写了 Worker 里的 `MYWebAssembly`）；
 * - `logic-layer-bigint`：逻辑层的原生 `BigInt`，模拟器的全局上没有，经 wasm i64 返回值的构造器取回；
 * - `worker-crypto-random`：Worker 里的 `crypto.getRandomValues`，逻辑层没有任何安全随机源；
 * - `object-prototype-global`：经 `Object.prototype` 上的 getter 取到真实全局对象（逻辑层没有 `globalThis`）。
 */
export const ALIPAY_UNDOCUMENTED_CAPABILITIES = Object.freeze([
  'logic-layer-webassembly',
  'logic-layer-bigint',
  'worker-crypto-random',
  'object-prototype-global'
] as const);

/** 支付宝宿主依赖的一项无文档能力。 */
export type AlipayUndocumentedCapability = (typeof ALIPAY_UNDOCUMENTED_CAPABILITIES)[number];

/** 矩阵里支付宝章节的标题原文。 */
const ALIPAY_FEASIBILITY_SECTION = '支付宝 `my` — supported（阶段 C 交付，依赖未文档化能力，Android 未验证）';

/** 连接时发现支付宝宿主依赖的某项无文档能力不可用。 */
export class AlipayUndocumentedCapabilityError extends Error {
  override readonly name = 'AlipayUndocumentedCapabilityError';

  /**
   * @param capability - 缺失的能力，即矩阵 YAML `undocumented` 里的 id
   * @param detail - 实际观察到的情况
   * @param cause - 底层异常
   */
  constructor(
    readonly capability: AlipayUndocumentedCapability,
    detail: string,
    cause?: unknown
  ) {
    super(
      `支付宝小程序缺少无文档能力 ${capability}：${detail}。` +
        `判定依据见 ${PLATFORM_FEASIBILITY_PATH} 的「${ALIPAY_FEASIBILITY_SECTION}」一节`
    );
    // 不走 Error 构造器的 cause 选项：没核实过支付宝两端的引擎都支持
    if (cause !== undefined) this.cause = cause;
  }
}
