/// <reference lib="webworker" />

/**
 * 共用连接用例的真实 SharedWorker 夹具：一个 SharedWorker 暴露一个 `WaSqliteClient`，每个连上来的端口都拿到它。
 *
 * @remarks
 * 形状与 `apps/dev-rxdb-*` 里的 `wa-sqlite-shared.worker.ts` 逐字一致：多个标签页（这里是同一个页面里的多个
 * `SharedWorker` 对象）连的是同一个客户端、同一条 SQLite 连接。不要为了好测在这里加重置钩子。
 */

import { expose } from 'comlink';
import { WaSqliteClient } from '../SqliteClient.js';

declare let self: SharedWorkerGlobalScope;

const client = new WaSqliteClient();

self.onconnect = (event: MessageEvent) => {
  expose(client, event.ports[0]);
};
