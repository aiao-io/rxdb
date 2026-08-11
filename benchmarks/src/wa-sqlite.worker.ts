/**
 * SQLite Web Worker
 *
 * 在单独的 Worker 线程中运行 SQLite 客户端，避免阻塞主线程的 UI
 */
import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { expose } from 'comlink';

// 创建并暴露 SQLite 客户端实例，供主线程以 comlink 方式调用
const client = new WaSqliteClient();
expose(client);
