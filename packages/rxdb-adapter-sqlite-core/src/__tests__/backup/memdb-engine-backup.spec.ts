/**
 * US-217 阶段 B：引擎在每条新连接上自动建表（sqliteai 的内置扩展就是这样）时，恢复把「恰好等于新建空库」的
 * 目标当作空的，并用归档里的那份整体取代引擎自建的表；写过用户数据的目标仍然拒绝。
 */
import { backupFailureSuite } from '../shared-backup-failure.suite.js';
import { backupRoundtripSuite } from '../shared-backup-roundtrip.suite.js';
import { memdbEngineBackupHarness } from './memdb-harness.js';

backupRoundtripSuite(memdbEngineBackupHarness);
backupFailureSuite(memdbEngineBackupHarness);
