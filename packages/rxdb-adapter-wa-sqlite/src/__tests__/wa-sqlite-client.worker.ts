/// <reference lib="webworker" />

/**
 * US-221 的真实 module Worker 夹具：一个 Worker 暴露一个 `WaSqliteClient`。
 *
 * @remarks
 * 形状与 `apps/dev-rxdb-*` 里的 `wa-sqlite.worker.ts` 一致，`OPFSCoopSyncVFS` 只能在这样的专用 Worker 里跑。
 */

import { expose } from 'comlink';
import { WaSqliteClient } from '../SqliteClient.js';

expose(new WaSqliteClient());
