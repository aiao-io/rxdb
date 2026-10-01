/**
 * @fileoverview 实验 ⑤：运行环境快照。必须在 `prepareMiniProgramHostRuntime` 之前采集，
 * 否则看到的是 adapter 补丁而不是平台原生能力。
 */
import { getMiniProgramRuntimeSources, type MiniProgramRuntimeSources } from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { DouyinApi } from '../douyin-api.js';
import { probe, type Probe } from '../probe.js';

/** 文档写明的基础库门槛。 */
export const SDK_GATES = {
  /** `tt.getRandomValues` 页面标注的最低版本。 */
  randomValues: '2.87.0',
  /** WASM 体验优化页标注的最低版本。 */
  wasm: '2.34.0.0'
} as const;

/** 一道版本门槛；读不到基础库版本时 `met` 为 `null`。 */
export interface SdkGate {
  readonly required: string;
  readonly met: boolean | null;
}

/** 环境快照。 */
export interface EnvironmentReport {
  /** `tt.getSystemInfoSync()` 里的原始类型字段。 */
  readonly systemInfo: Probe<Readonly<Record<string, string | number | boolean>>>;
  readonly sdkVersion?: string;
  readonly gates: { readonly randomValues: SdkGate; readonly wasm: SdkGate };
  /**
   * 以自由变量形式读到的全局 `typeof`（由页面字面量采集），打包代码直接写 `TextDecoder` 时看到的就是它。
   * 采集发生在构建 banner 之后：`globalThis` 被垫过时这里是 `'object'`，原始形态看报告的 `globalThisShim`。
   */
  readonly freeGlobals: Readonly<Record<string, string>>;
  /** 经 `globalThis` 按名读取的 `typeof`；adapter 的引导与能力检查走这条路。`globalThis` 不是对象时失败。 */
  readonly globalObject: Probe<Readonly<Record<string, string>>>;
  /** 原生 `TextDecoder`（自由变量）对各编码标签的支持；sqlite-core 在模块顶层用到 `latin1`。 */
  readonly textDecoderLabels: Readonly<Record<string, Probe<string>>>;
  readonly sourcesBeforePrepare: Probe<MiniProgramRuntimeSources>;
  /**
   * `sourcesBeforePrepare` 里出现了 adapter 的标记（`polyfill` 或平台 id）：同一 JS 上下文里之前跑过引导，
   * 这份快照不是平台原生状态。读不到来源时为 `null`。
   */
  readonly residue: boolean | null;
  /** 直接调自由变量 `crypto.getRandomValues` 取 4096 字节，不经 `tt`；平台有原生 Web Crypto 随机源时成功。 */
  readonly nativeRandom: Probe<NativeRandomSummary>;
}

/** 原生随机源一次调用的摘要。 */
export interface NativeRandomSummary {
  readonly byteLength: number;
  readonly allZero: boolean;
  readonly distinctByteValues: number;
}

/** 经 `globalThis` 按名读取的全局；`captureFreeGlobals` 的键必须覆盖它们。 */
export const GLOBAL_NAMES = [
  'WebAssembly',
  'crypto',
  'TextEncoder',
  'TextDecoder',
  'structuredClone',
  'performance',
  'queueMicrotask',
  'BigInt',
  'Promise',
  'atob',
  'btoa'
] as const;

const TEXT_DECODER_LABELS = ['utf-8', 'utf-16le', 'latin1'] as const;

const NATIVE_RANDOM_BYTES = 4096;

/** 没被 adapter 动过的来源。 */
const UNTOUCHED_SOURCES: readonly string[] = ['native', 'missing'];

/** 按数字段比较版本号，缺的段按 0 算（`2.34.0.0` 与 `2.34.0` 相等）。 */
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

function gate(sdkVersion: string | undefined, required: string): SdkGate {
  return { required, met: sdkVersion === undefined ? null : compareVersions(sdkVersion, required) >= 0 };
}

function primitiveFields(info: object): Record<string, string | number | boolean> {
  const fields: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(info)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') fields[key] = value;
  }
  return fields;
}

function readSystemInfo(tt: DouyinApi): Record<string, string | number | boolean> {
  if (typeof tt.getSystemInfoSync !== 'function') throw new Error('tt.getSystemInfoSync 不存在');
  return primitiveFields(tt.getSystemInfoSync());
}

function decoderEncoding(label: string): string {
  // 用自由变量而不是 globalThis.TextDecoder：与 sqlite-core 模块顶层的写法一致
  if (typeof TextDecoder !== 'function') throw new Error('原生 TextDecoder 不存在');
  return new TextDecoder(label).encoding;
}

function readGlobalObject(): Record<string, string> {
  const root: unknown = globalThis;
  if (typeof root !== 'object' || root === null) {
    throw new TypeError(`globalThis 不是对象：typeof globalThis === '${typeof root}'`);
  }
  const globals: Record<string, string> = {};
  for (const name of GLOBAL_NAMES) globals[name] = typeof Reflect.get(root, name);
  const crypto: unknown = Reflect.get(root, 'crypto');
  globals['crypto.getRandomValues'] =
    typeof crypto === 'object' && crypto !== null ? typeof Reflect.get(crypto, 'getRandomValues') : 'undefined';
  return globals;
}

function readNativeRandom(): NativeRandomSummary {
  // 自由变量：与 adapter 现状无关，只问平台本身有没有 Web Crypto 随机源
  if (typeof crypto !== 'object' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('自由变量 crypto.getRandomValues 不存在');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(NATIVE_RANDOM_BYTES));
  const seen = new Set(bytes);
  return { byteLength: bytes.byteLength, allZero: seen.size === 1 && seen.has(0), distinctByteValues: seen.size };
}

function detectResidue(sources: Probe<MiniProgramRuntimeSources>): boolean | null {
  if (!sources.ok) return null;
  return Object.values(sources.value).some(source => !UNTOUCHED_SOURCES.includes(source));
}

/** 采集环境快照。 */
export async function collectEnvironment(
  tt: DouyinApi,
  freeGlobals: Readonly<Record<string, string>>
): Promise<EnvironmentReport> {
  const systemInfo = await probe(() => readSystemInfo(tt));
  const rawVersion = systemInfo.ok ? systemInfo.value['SDKVersion'] : undefined;
  const sdkVersion = typeof rawVersion === 'string' ? rawVersion : undefined;
  const globalObject = await probe(readGlobalObject);
  const textDecoderLabels: Record<string, Probe<string>> = {};
  for (const label of TEXT_DECODER_LABELS) textDecoderLabels[label] = await probe(() => decoderEncoding(label));
  const sourcesBeforePrepare = await probe(getMiniProgramRuntimeSources);
  return {
    systemInfo,
    sdkVersion,
    gates: { randomValues: gate(sdkVersion, SDK_GATES.randomValues), wasm: gate(sdkVersion, SDK_GATES.wasm) },
    freeGlobals,
    globalObject,
    textDecoderLabels,
    sourcesBeforePrepare,
    residue: detectResidue(sourcesBeforePrepare),
    nativeRandom: await probe(readNativeRandom)
  };
}
