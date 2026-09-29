/// <reference lib="webworker" />

/**
 * US-217 AC#11 的恢复 Worker：在 IndexedDB 上恢复，走到主线程指定的位置后停住等 terminate。
 */
import { serveInterruptedRestore } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { sqliteWasmBackupHarness } from './sqlite-wasm-backup-harness.js';

serveInterruptedRestore(sqliteWasmBackupHarness);
