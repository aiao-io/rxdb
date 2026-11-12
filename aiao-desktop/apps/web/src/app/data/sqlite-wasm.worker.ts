import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

/** OPFS 上的 SQLite 只能在专用 Worker 里打开（OPFSCoopSyncVFS），主线程经 Comlink 调它。 */
expose(new SqliteClient());
