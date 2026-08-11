/// <reference lib="webworker" />

/**
 * SWM-006 的真实 module Worker 夹具。
 *
 * 形状与 README「在 Worker 中运行」一节、以及 `apps/dev-rxdb-*` 里的
 * `sqlite-wasm.worker.ts` **逐字一致**：一个 Worker 暴露一个 `SqliteClient` 实例。
 * 这正是被测契约本身——不要为了让测试好写而在这里加工厂或重置钩子，
 * 那样测到的就不是用户实际跑的东西了。
 */

import { expose } from 'comlink';
import { SqliteClient } from '../SqliteClient.js';

expose(new SqliteClient());
