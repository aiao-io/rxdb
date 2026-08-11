import type { SQLiteDBCore } from '@subframe7536/sqlite-wasm';

/**
 * @subframe7536/sqlite-wasm 未直接导出底层 SQLiteAPI 类型，
 * 这里从 SQLiteDBCore 反推，供内部使用。
 */
export type SQLiteAPI = SQLiteDBCore['sqlite'];
