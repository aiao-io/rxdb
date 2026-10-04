/**
 * @fileoverview 页面与 Worker 之间的消息协议。
 *
 * 支付宝逻辑层没有随机源，Worker 里却有 `crypto.getRandomValues` 与 `MYWebAssembly`（v2 探针两端实测），
 * 实验经 Worker 取随机数、探 `MYWebAssembly`。Worker 侧的处理逻辑放在这里，入口 `worker.ts` 只负责接线，
 * Node 测试替身直接调同一个 {@link handleWorkerMessage}。消息全是普通对象：真机跨线程传的是结构化副本。
 */
import type { AlipayWorker, AlipayWorkerWasmApi } from './alipay-api.js';
import { describeError, type DescribedError } from './describe-error.js';
import { probe, withTimeout, type Probe, type Skipped } from './probe.js';

/** 页面发给 Worker 的请求。 */
export type WorkerRequest =
  | { readonly type: 'probe'; readonly id: number; readonly wasmPath: string }
  | { readonly type: 'random'; readonly id: number; readonly length: number };

/** Worker 的回复；请求本身不合法时 `id` 为 -1。 */
export type WorkerResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly error: DescribedError };

/** Worker 里实验用到的全局。 */
export interface WorkerEnvironment {
  /** 入口用字面量 `typeof` 采到的自由变量类型。 */
  readonly freeGlobals: Readonly<Record<string, string>>;
  readonly MYWebAssembly?: AlipayWorkerWasmApi;
  readonly crypto?: { getRandomValues(array: Uint8Array<ArrayBuffer>): unknown };
}

/** `probe` 请求的结果。 */
export interface WorkerProbeResult {
  readonly freeGlobals: Readonly<Record<string, string>>;
  /** `MYWebAssembly.instantiate(path)` 后调 `add(2, 3)`；`shape` 记 `instantiate` 返回的是实例还是 `{ instance }`。 */
  readonly MYWebAssembly:
    Probe<{ readonly path: string; readonly shape: string; readonly addResult: unknown }> | Skipped;
  readonly cryptoGetRandomValues: Probe<{ readonly length: number; readonly sample: readonly number[] }> | Skipped;
}

/** `getRandomValues` 单次最多填 65536 字节（Web Crypto 规范上限）。 */
const RANDOM_CHUNK_BYTES = 65536;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseRequest(message: unknown): WorkerRequest | undefined {
  if (!isRecord(message) || !isNonNegativeInteger(message['id'])) return undefined;
  const { type, id, wasmPath, length } = message;
  if (type === 'probe' && typeof wasmPath === 'string') return { type, id, wasmPath };
  if (type === 'random' && isNonNegativeInteger(length)) return { type, id, length };
  return undefined;
}

/** `instantiate` 可能返回实例本身，也可能返回 `{ instance, module }`。 */
function exportsOf(result: unknown): { shape: string; exports: unknown } {
  if (isRecord(result) && isRecord(result['instance']))
    return { shape: '{ instance }', exports: result['instance']['exports'] };
  return { shape: 'instance', exports: isRecord(result) ? result['exports'] : undefined };
}

async function probeWorkerWasm(env: WorkerEnvironment, path: string): Promise<WorkerProbeResult['MYWebAssembly']> {
  const wasm = env.MYWebAssembly;
  if (!wasm) return { skipped: 'Worker 里没有 MYWebAssembly' };
  return probe(async () => {
    const { shape, exports } = exportsOf(await wasm.instantiate(path, {}));
    const add: unknown = isRecord(exports) ? exports['add'] : undefined;
    if (typeof add !== 'function') throw new Error(`实例没有导出 add 函数：${typeof add}`);
    return { path, shape, addResult: add(2, 3) as unknown };
  });
}

function fillRandom(env: WorkerEnvironment, length: number): Uint8Array {
  const crypto = env.crypto;
  if (!crypto) throw new Error('Worker 里没有 crypto.getRandomValues');
  const bytes = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += RANDOM_CHUNK_BYTES) {
    crypto.getRandomValues(bytes.subarray(offset, offset + RANDOM_CHUNK_BYTES));
  }
  return bytes;
}

async function runRequest(request: WorkerRequest, env: WorkerEnvironment): Promise<unknown> {
  if (request.type === 'random') return Array.from(fillRandom(env, request.length));
  const sample =
    env.crypto ?
      await probe(() => {
        const bytes = fillRandom(env, 16);
        return { length: bytes.length, sample: Array.from(bytes.subarray(0, 4)) };
      })
    : { skipped: 'Worker 里没有 crypto' };
  const result: WorkerProbeResult = {
    freeGlobals: env.freeGlobals,
    MYWebAssembly: await probeWorkerWasm(env, request.wasmPath),
    cryptoGetRandomValues: sample
  };
  return result;
}

/** Worker 侧处理一条消息；永不 reject，任何失败都变成 `ok: false` 的回复。 */
export async function handleWorkerMessage(message: unknown, env: WorkerEnvironment): Promise<WorkerResponse> {
  const request = parseRequest(message);
  if (!request) {
    const error = new Error(`不合法的 Worker 请求：${JSON.stringify(message) ?? String(message)}`);
    return { id: -1, ok: false, error: describeError(error) };
  }
  try {
    return { id: request.id, ok: true, value: await runRequest(request, env) };
  } catch (error) {
    return { id: request.id, ok: false, error: describeError(error) };
  }
}

/** 页面侧对 Worker 的封装。 */
export interface WorkerBridge {
  probe(wasmPath: string): Promise<WorkerProbeResult>;
  /** 经 Worker 的 `crypto.getRandomValues` 取 `length` 字节，返回新分配的数组。 */
  randomValues(length: number): Promise<Uint8Array>;
  /** 结束 Worker；待决请求全部失败。 */
  terminate(): void;
}

interface Pending {
  readonly type: WorkerRequest['type'];
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

function isResponse(message: unknown): message is WorkerResponse {
  return isRecord(message) && typeof message['id'] === 'number' && typeof message['ok'] === 'boolean';
}

function remoteError(type: string, error: DescribedError): Error {
  const wrapped = new Error(`Worker ${type} 失败：${error.message ?? error.text}`);
  wrapped.cause = error;
  return wrapped;
}

function toRandomBytes(value: unknown, length: number): Uint8Array {
  const valid =
    Array.isArray(value) &&
    value.length === length &&
    value.every(byte => Number.isInteger(byte) && (byte as number) >= 0 && (byte as number) <= 255);
  if (!valid) throw new Error(`Worker random 返回值不合法：期望 ${length} 个 0..255 的整数`);
  return Uint8Array.from(value as number[]);
}

/** 包装 Worker：按 id 对号入座，每个请求单独超时。 */
export function createWorkerBridge(worker: AlipayWorker, timeoutMs: number): WorkerBridge {
  const pending = new Map<number, Pending>();
  let nextId = 0;
  const rejectAll = (error: Error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  worker.onMessage(message => {
    const entry = isResponse(message) ? pending.get(message.id) : undefined;
    if (!entry || !isResponse(message)) {
      rejectAll(new Error(`Worker 回了无法对应的消息：${JSON.stringify(message) ?? String(message)}`));
      return;
    }
    if (message.ok) entry.resolve(message.value);
    else entry.reject(remoteError(entry.type, message.error));
  });
  const request = (body: { type: 'probe'; wasmPath: string } | { type: 'random'; length: number }) => {
    const id = nextId++;
    const response = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { type: body.type, resolve, reject });
      worker.postMessage({ ...body, id });
    });
    return withTimeout(response, timeoutMs, `Worker ${body.type}`).finally(() => pending.delete(id));
  };
  return {
    probe: async wasmPath => (await request({ type: 'probe', wasmPath })) as WorkerProbeResult,
    randomValues: async length => toRandomBytes(await request({ type: 'random', length }), length),
    terminate: () => {
      worker.terminate();
      rejectAll(new Error('Worker 已 terminate'));
    }
  };
}
