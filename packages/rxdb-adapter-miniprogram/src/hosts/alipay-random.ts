/**
 * @fileoverview 支付宝随机源：逻辑层经 Worker 的 `crypto.getRandomValues` 取随机数。
 *
 * 逻辑层没有任何安全随机源，Worker 里有 `crypto.getRandomValues`（US-211 支付宝探针模拟器与 iOS 实测，文档未承诺）。
 * 协议与 `src/workers/alipay-random-worker.js` 一一对应；任何失败都以 `worker-crypto-random` 缺失报错，不降级。
 */
import { errorMessage } from '../error-message.js';
import type { AlipayRandomWorker } from './alipay-api.js';
import { AlipayUndocumentedCapabilityError } from './alipay-capability.js';

/** 单个请求等 Worker 回复的上限。Worker 没接好（没声明、没跳过转译）时平台不报错，只是永远不回。 */
export const ALIPAY_RANDOM_TIMEOUT_MS = 10_000;

/** 单个请求最多取的字节数，与 Worker 脚本、Web Crypto `getRandomValues` 的上限一致。 */
const CHUNK_BYTES = 65_536;

const WIRING_HINT =
  '检查 app.json 的 workers、mini.project.json 的 transpile.script.ignore 与 my.createWorker 的 useExperimentalWorker';

interface Pending {
  readonly length: number;
  readonly resolve: (bytes: Uint8Array) => void;
  readonly reject: (error: Error) => void;
}

function fail(detail: string, cause?: unknown): AlipayUndocumentedCapabilityError {
  return new AlipayUndocumentedCapabilityError('worker-crypto-random', detail, cause);
}

function field(message: unknown, name: string): unknown {
  return typeof message === 'object' && message !== null ? Reflect.get(message, name) : undefined;
}

function isByte(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 255;
}

function toBytes(value: unknown, length: number): Uint8Array {
  if (!Array.isArray(value) || value.length !== length || !value.every(isByte)) {
    throw fail(`Worker 回复不合法：期望 ${String(length)} 个 0..255 的整数`);
  }
  return Uint8Array.from(value as number[]);
}

function describeMessage(message: unknown): string {
  return JSON.stringify(message) ?? String(message);
}

/**
 * 一个 Worker 上唯一的请求通道：请求 ID、排队与消息监听都按 Worker 共享。
 *
 * 页面重进会把同一个 Worker 交给新建的 host，旧随机池的补给可能还在途；
 * 若每个随机源各管各的 ID 与监听，回复就会错配给别的随机源。
 */
interface RandomChannel {
  readonly requestChunk: (length: number) => Promise<Uint8Array>;
}

const channels = new WeakMap<AlipayRandomWorker, RandomChannel>();

function createChannel(worker: AlipayRandomWorker): RandomChannel {
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let broken: AlipayUndocumentedCapabilityError | undefined;

  worker.onMessage(message => {
    const entry = pending.get(field(message, 'id') as number);
    if (entry === undefined) {
      broken = fail(`Worker 回了对不上号的消息：${describeMessage(message)}`);
      for (const other of pending.values()) other.reject(broken);
      return;
    }
    if (field(message, 'ok') !== true) {
      entry.reject(fail(`Worker 回复失败：${String(field(message, 'error'))}`, message));
      return;
    }
    try {
      entry.resolve(toBytes(field(message, 'value'), entry.length));
    } catch (error) {
      entry.reject(error as Error);
    }
  });

  const postChunk = (length: number): Promise<Uint8Array> => {
    if (broken !== undefined) return Promise.reject(broken);
    const id = nextId++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const response = new Promise<Uint8Array>((resolve, reject) => {
      pending.set(id, { length, resolve, reject });
      timer = setTimeout(() => {
        reject(fail(`Worker ${String(ALIPAY_RANDOM_TIMEOUT_MS)} ms 内没有回复：${WIRING_HINT}`));
      }, ALIPAY_RANDOM_TIMEOUT_MS);
      try {
        worker.postMessage({ type: 'random', id, length });
      } catch (error) {
        reject(fail(`postMessage 失败：${errorMessage(error)}`, error));
      }
    });
    return response.finally(() => {
      clearTimeout(timer);
      pending.delete(id);
    });
  };

  return {
    requestChunk: length => {
      const response = queue.then(() => postChunk(length));
      queue = response.catch(() => undefined);
      return response;
    }
  };
}

function channelOf(worker: AlipayRandomWorker): RandomChannel {
  const existing = channels.get(worker);
  if (existing !== undefined) return existing;
  const created = createChannel(worker);
  channels.set(worker, created);
  return created;
}

/**
 * 经 Worker 取随机数的 `requestRandomValues`。
 *
 * 同一个 Worker 只挂一次消息监听，经它建出的所有随机源共用请求 ID 与队列；请求按 64 KiB 分块，
 * 所有块（含并发调用、其他随机源的）排成一队依次发出，上一块回复后才发下一块，拼成恰好 `length` 字节的新缓冲区。
 * Worker 本来就串行处理，排队不增加总耗时，却让每块的超时只算自己的往返：iOS 真机 1 MiB 要 7.6 秒（v6 实测），
 * 并发发出时后面的块会白白耗掉超时。对不上号的回复说明协议已乱，该 Worker 上在途、排队与之后的请求一律失败。
 *
 * @param worker - `my.createWorker` 返回的、跑着包内 `alipay-random-worker.js` 的 Worker
 */
export function createAlipayRandomSource(worker: AlipayRandomWorker): (length: number) => Promise<Uint8Array> {
  const { requestChunk } = channelOf(worker);
  return async length => {
    if (!Number.isInteger(length) || length < 0) throw new RangeError(`随机数长度必须是非负整数：${String(length)}`);
    const offsets: number[] = [];
    for (let offset = 0; offset < length; offset += CHUNK_BYTES) offsets.push(offset);
    const chunks = await Promise.all(offsets.map(offset => requestChunk(Math.min(CHUNK_BYTES, length - offset))));
    const bytes = new Uint8Array(length);
    chunks.forEach((chunk, index) => bytes.set(chunk, offsets[index]));
    return bytes;
  };
}
