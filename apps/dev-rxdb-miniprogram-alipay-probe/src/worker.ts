/**
 * @fileoverview 支付宝 Worker 入口：只负责接线，处理逻辑在 `worker-protocol.ts`。
 *
 * Worker 里没有 `my`，平台注入自由变量 `worker`：`worker.onMessage` 的回调直接收到消息本身，
 * 用 `worker.postMessage` 回复（v2 探针两端实测）。全局能力一律用字面量 `typeof` 采集。
 */
import type { AlipayWorkerWasmApi } from './alipay-api.js';
import { handleWorkerMessage, type WorkerEnvironment } from './worker-protocol.js';

declare const worker: {
  onMessage(listener: (message: unknown) => void): void;
  postMessage(message: object): void;
};
declare const my: unknown;
declare const MYWebAssembly: AlipayWorkerWasmApi | undefined;

const environment: WorkerEnvironment = {
  freeGlobals: {
    my: typeof my,
    MYWebAssembly: typeof MYWebAssembly,
    WebAssembly: typeof WebAssembly,
    crypto: typeof crypto,
    BigInt: typeof BigInt,
    TextDecoder: typeof TextDecoder,
    globalThis: typeof globalThis
  },
  MYWebAssembly: typeof MYWebAssembly === 'undefined' ? undefined : MYWebAssembly,
  crypto: typeof crypto === 'undefined' ? undefined : crypto
};

worker.onMessage(message => {
  void handleWorkerMessage(message, environment).then(response => worker.postMessage(response));
});
