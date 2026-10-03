/**
 * @fileoverview 不经包装层，直接调支付宝原始同步 FS，原样记录返回值形态。
 *
 * 包装层的写法（只用「base64 串 + `'base64'`」写、失败对象变抛错）全靠 v2 探针的实测；
 * 这里每次运行都重新核对一遍，平台哪天改了行为，报告里能直接看出来。
 */
import type { AlipayApi, AlipayRawFileSystem } from '../alipay-api.js';
import { probe, type Probe } from '../probe.js';

/** 文档与常见同步 FS 里可能出现的方法，逐个记 `typeof`。 */
export const RAW_FS_METHODS = [
  'accessSync',
  'mkdirSync',
  'readFileSync',
  'writeFileSync',
  'appendFileSync',
  'unlinkSync',
  'renameSync',
  'statSync',
  'readdirSync',
  'rmdirSync',
  'truncateSync',
  'openSync',
  'writeSync',
  'readSync',
  'closeSync'
] as const;

/** 写入样本：覆盖 0x00 与高位字节；base64 期望值手算。 */
const SAMPLE_BYTES = [0, 1, 2, 250, 251, 252, 253, 254, 255];
const SAMPLE_BASE64 = 'AAEC+vv8/f7/';

/** 原始写入的四种传参。 */
export type RawWriteMode = 'arrayBuffer' | 'arrayBufferBinary' | 'base64String' | 'typedArray';

/** 一种传参的写入、落盘大小与读回。 */
export interface RawWriteModeReport {
  readonly write: Probe<unknown>;
  readonly stat: Probe<unknown>;
  /** `readFileSync(path, 'base64')` 的原始返回。 */
  readonly readBase64: Probe<unknown>;
  /** 读回的 base64 与样本一致。 */
  readonly bytesMatch: boolean;
}

/** 原始 FS 实验的结果。 */
export interface RawFsReport {
  readonly directory: string;
  readonly methods: Readonly<Record<string, string>>;
  readonly readMissing: Probe<unknown>;
  readonly writeModes: Readonly<Record<RawWriteMode, RawWriteModeReport>>;
  readonly readdir: Probe<unknown>;
  /** 目标已存在时 `renameSync` 的行为：覆盖还是报错。 */
  readonly renameToExisting: {
    /** 先写源（`AQ==`）与目标（`Ag==`）两个文件，两次写入的原始返回。 */
    readonly setup: Probe<unknown>;
    readonly rename: Probe<unknown>;
    /** 覆盖时读回 `AQ==`，拒绝时保持 `Ag==`。 */
    readonly targetBase64: Probe<unknown>;
  };
}

const MAX_SHAPE_DEPTH = 3;
const MAX_SHAPE_ITEMS = 20;

/** 把原始返回值转成可 JSON 序列化的形状：二进制只记标签与长度，函数只记占位。 */
export function rawShape(value: unknown, depth = 0): unknown {
  if (value === undefined) return '<undefined>';
  if (typeof value === 'function') return '<function>';
  if (typeof value === 'bigint' || typeof value === 'symbol') return String(value);
  if (typeof value !== 'object' || value === null) return value;
  const tag = Object.prototype.toString.call(value);
  // 别的 realm 的二进制 instanceof 恒为假，只能看内部标签
  if (tag === '[object ArrayBuffer]' || ArrayBuffer.isView(value)) {
    return { tag, byteLength: Reflect.get(value, 'byteLength') as unknown };
  }
  if (depth >= MAX_SHAPE_DEPTH) return tag;
  if (Array.isArray(value)) return value.slice(0, MAX_SHAPE_ITEMS).map(item => rawShape(item, depth + 1));
  const shape: Record<string, unknown> = {};
  for (const key of Object.keys(value)) shape[key] = rawShape(Reflect.get(value, key), depth + 1);
  return shape;
}

function raw(task: () => unknown): Promise<Probe<unknown>> {
  return probe(() => rawShape(task()));
}

function readBase64Matches(result: Probe<unknown>): boolean {
  return (
    result.ok &&
    typeof result.value === 'object' &&
    result.value !== null &&
    Reflect.get(result.value, 'data') === SAMPLE_BASE64
  );
}

function sampleBuffer(): ArrayBuffer {
  return Uint8Array.from(SAMPLE_BYTES).buffer;
}

function writeArgs(
  mode: RawWriteMode,
  my: Pick<AlipayApi, 'arrayBufferToBase64'>
): [string | ArrayBuffer | Uint8Array, string?] {
  const args: Record<RawWriteMode, [string | ArrayBuffer | Uint8Array, string?]> = {
    arrayBuffer: [sampleBuffer()],
    arrayBufferBinary: [sampleBuffer(), 'binary'],
    base64String: [my.arrayBufferToBase64(sampleBuffer()), 'base64'],
    typedArray: [Uint8Array.from(SAMPLE_BYTES)]
  };
  return args[mode];
}

async function probeWriteMode(
  fs: AlipayRawFileSystem,
  my: Pick<AlipayApi, 'arrayBufferToBase64'>,
  path: string,
  mode: RawWriteMode
): Promise<RawWriteModeReport> {
  const write = await raw(() => fs.writeFileSync(path, ...writeArgs(mode, my)));
  const stat = await raw(() => fs.statSync(path));
  const readBase64 = await raw(() => fs.readFileSync(path, 'base64'));
  return { write, stat, readBase64, bytesMatch: readBase64Matches(readBase64) };
}

/** 在 `directory`（调用方已建好的空目录）里逐条调原始 FS。 */
export async function runRawFsExperiment(
  fs: AlipayRawFileSystem,
  my: Pick<AlipayApi, 'arrayBufferToBase64'>,
  directory: string
): Promise<RawFsReport> {
  const methods: Record<string, string> = {};
  for (const name of RAW_FS_METHODS) methods[name] = typeof Reflect.get(fs, name);
  const readMissing = await raw(() => fs.readFileSync(`${directory}/missing.bin`));
  const writeModes = {} as Record<RawWriteMode, RawWriteModeReport>;
  for (const mode of ['arrayBuffer', 'arrayBufferBinary', 'base64String', 'typedArray'] as const) {
    writeModes[mode] = await probeWriteMode(fs, my, `${directory}/${mode}.bin`, mode);
  }
  const readdir = await raw(() => fs.readdirSync(directory));
  const source = `${directory}/rename-a.bin`;
  const target = `${directory}/rename-b.bin`;
  const setup = await raw(() => [
    fs.writeFileSync(source, 'AQ==', 'base64'),
    fs.writeFileSync(target, 'Ag==', 'base64')
  ]);
  const rename = await raw(() => fs.renameSync(source, target));
  const targetBase64 = await raw(() => fs.readFileSync(target, 'base64'));
  return { directory, methods, readMissing, writeModes, readdir, renameToExisting: { setup, rename, targetBase64 } };
}
