/// <reference lib="webworker" />

/**
 * US-217 AC#11 的恢复 Worker：在 OPFS 上恢复（客户端跑在它自己起的嵌套 Worker 里），
 * 走到主线程指定的位置后停住等 terminate；嵌套 Worker 随它一起被终止。
 */
import { serveInterruptedRestore } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { sqliteOfficialBackupHarness } from './sqlite-official-backup-harness.js';

serveInterruptedRestore(sqliteOfficialBackupHarness);
