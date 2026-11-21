/// <reference lib="webworker" />

import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import { serveInterruptedRestore } from '@aiao/rxdb-adapter-sqlite-core/testing';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { RxDBAdapterSqlite } from '../../RxDBAdapterSqlite.js';
import { sqliteWasmOpfsBackupHarness } from './sqlite-wasm-opfs-backup-harness.js';

// 恢复执行者已经是专用 Worker，直接持有 OPFS 连接；强杀不依赖嵌套 Worker 的打包。
serveInterruptedRestore({
  ...sqliteWasmOpfsBackupHarness,
  createAdapter: (rxdb, kind) =>
    kind === 'persistent' ?
      (new RxDBAdapterSqlite(rxdb, {
        vfs: 'opfs',
        wasmUrl: sqliteWasmUrl,
        batchTimeout: 1
      }) as unknown as RxDBAdapterSqliteBase)
    : sqliteWasmOpfsBackupHarness.createAdapter(rxdb, kind)
});
