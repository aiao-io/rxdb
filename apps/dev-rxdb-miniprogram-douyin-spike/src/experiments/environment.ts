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
  /** 全局能力的 `typeof`；`freeGlobals` 由页面传入（`tt` 等可能是自由变量而不在 globalThis 上）。 */
  readonly globals: Readonly<Record<string, string>>;
  /** 原生 `TextDecoder` 对各编码标签的支持；sqlite-core 在模块顶层用到 `latin1`。 */
  readonly textDecoderLabels: Readonly<Record<string, Probe<string>>>;
  readonly sourcesBeforePrepare: MiniProgramRuntimeSources;
}

const GLOBAL_NAMES = [
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
  const Decoder: unknown = globalThis.TextDecoder;
  if (typeof Decoder !== 'function') throw new Error('原生 TextDecoder 不存在');
  return new globalThis.TextDecoder(label).encoding;
}

/** 采集环境快照。 */
export async function collectEnvironment(
  tt: DouyinApi,
  freeGlobals: Readonly<Record<string, string>>
): Promise<EnvironmentReport> {
  const systemInfo = await probe(() => readSystemInfo(tt));
  const rawVersion = systemInfo.ok ? systemInfo.value['SDKVersion'] : undefined;
  const sdkVersion = typeof rawVersion === 'string' ? rawVersion : undefined;
  const globals: Record<string, string> = { ...freeGlobals };
  for (const name of GLOBAL_NAMES) globals[name] = typeof Reflect.get(globalThis, name);
  globals['crypto.getRandomValues'] = typeof globalThis.crypto?.getRandomValues;
  const textDecoderLabels: Record<string, Probe<string>> = {};
  for (const label of TEXT_DECODER_LABELS) textDecoderLabels[label] = await probe(() => decoderEncoding(label));
  return {
    systemInfo,
    sdkVersion,
    gates: { randomValues: gate(sdkVersion, SDK_GATES.randomValues), wasm: gate(sdkVersion, SDK_GATES.wasm) },
    globals,
    textDecoderLabels,
    sourcesBeforePrepare: getMiniProgramRuntimeSources()
  };
}
