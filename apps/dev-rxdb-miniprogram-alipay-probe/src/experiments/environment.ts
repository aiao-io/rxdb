/**
 * @fileoverview 运行环境快照。必须在 `prepareMiniProgramHostRuntime` 之前采集，
 * 否则看到的是 adapter 补丁而不是平台原生能力。
 */
import { getMiniProgramRuntimeSources, type MiniProgramRuntimeSources } from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { AlipayApi } from '../alipay-api.js';
import { probe, type Probe } from '../probe.js';
import { readProbedRuntimeGlobal } from '../realm-probe.js';

/** 环境快照。 */
export interface EnvironmentReport {
  /** `my.getSystemInfoSync()` 里的原始类型字段。 */
  readonly systemInfo: Probe<Readonly<Record<string, string | number | boolean>>>;
  /** `my.SDKVersion`。 */
  readonly sdkVersion?: string;
  /** `my.env.USER_DATA_PATH` 原值。 */
  readonly userDataPath?: string;
  /** `my.canIUse` 对几项关键 API 的回答；`my.canIUse` 不存在时每项都失败。 */
  readonly canIUse: Readonly<Record<string, Probe<boolean>>>;
  /** 以自由变量形式读到的全局 `typeof`（由页面字面量采集）；构建 banner 只探测、不改全局，这里就是平台原生形态。 */
  readonly freeGlobals: Readonly<Record<string, string>>;
  /** 经 `globalThis` 按名读取的 `typeof`；`globalThis` 不是对象时失败，adapter 此时只能靠 `host.runtimeGlobal`。 */
  readonly globalObject: Probe<Readonly<Record<string, string>>>;
  readonly sourcesBeforePrepare: Probe<MiniProgramRuntimeSources>;
  /**
   * `sourcesBeforePrepare` 里出现了 adapter 的标记（`polyfill` 或平台 id）：同一 JS 上下文里之前跑过引导，
   * 这份快照不是平台原生状态。读不到来源时为 `null`。
   */
  readonly residue: boolean | null;
  /** 直接调自由变量 `crypto.getRandomValues` 取 4096 字节；平台逻辑层有原生 Web Crypto 随机源时成功。 */
  readonly nativeRandom: Probe<RandomSummary>;
}

/** 一次随机源调用的摘要。 */
export interface RandomSummary {
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

/** 问 `my.canIUse` 的 API 名。 */
export const CAN_I_USE_NAMES = ['getRandomValues', 'createWorker', 'getFileSystemManager'] as const;

const NATIVE_RANDOM_BYTES = 4096;

/** 没被 adapter 动过的来源。 */
const UNTOUCHED_SOURCES: readonly string[] = ['native', 'missing'];

function primitiveFields(info: object): Record<string, string | number | boolean> {
  const fields: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(info)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') fields[key] = value;
  }
  return fields;
}

function readSystemInfo(my: AlipayApi): Record<string, string | number | boolean> {
  if (typeof my.getSystemInfoSync !== 'function') throw new Error('my.getSystemInfoSync 不存在');
  return primitiveFields(my.getSystemInfoSync());
}

function askCanIUse(my: AlipayApi, name: string): boolean {
  if (typeof my.canIUse !== 'function') throw new Error('my.canIUse 不存在');
  return my.canIUse(name);
}

function readGlobalObject(): Record<string, string> {
  const root: unknown = typeof globalThis === 'undefined' ? undefined : globalThis;
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

/** 汇总一段随机字节。 */
export function summarizeRandom(bytes: Uint8Array): RandomSummary {
  const seen = new Set(bytes);
  return { byteLength: bytes.byteLength, allZero: seen.size === 1 && seen.has(0), distinctByteValues: seen.size };
}

function readNativeRandom(): RandomSummary {
  // 自由变量：与 adapter 现状无关，只问平台本身有没有 Web Crypto 随机源
  if (typeof crypto !== 'object' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('自由变量 crypto.getRandomValues 不存在');
  }
  return summarizeRandom(crypto.getRandomValues(new Uint8Array(NATIVE_RANDOM_BYTES)));
}

function detectResidue(sources: Probe<MiniProgramRuntimeSources>): boolean | null {
  if (!sources.ok) return null;
  return Object.values(sources.value).some(source => !UNTOUCHED_SOURCES.includes(source));
}

/** 采集环境快照。 */
export async function collectEnvironment(
  my: AlipayApi,
  freeGlobals: Readonly<Record<string, string>>
): Promise<EnvironmentReport> {
  const canIUse: Record<string, Probe<boolean>> = {};
  for (const name of CAN_I_USE_NAMES) canIUse[name] = await probe(() => askCanIUse(my, name));
  // 与 host 同一个真实全局对象：globalThis 不是对象时也能看出同一上下文里之前是否引导过
  const sourcesBeforePrepare = await probe(() => getMiniProgramRuntimeSources(readProbedRuntimeGlobal()));
  return {
    systemInfo: await probe(() => readSystemInfo(my)),
    sdkVersion: my.SDKVersion,
    userDataPath: my.env?.USER_DATA_PATH,
    canIUse,
    freeGlobals,
    globalObject: await probe(readGlobalObject),
    sourcesBeforePrepare,
    residue: detectResidue(sourcesBeforePrepare),
    nativeRandom: await probe(readNativeRandom)
  };
}
