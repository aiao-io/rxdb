/**
 * US-217 阶段 B：客户端缺少恢复需要的方法时，恢复在读归档之前就以 `unsupported_combination` 拒绝。
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { SqliteBackupStorageKind } from '../../testing.js';
import { memdbBackupHarness, memdbHarnessWithout, type MemdbRestoreCapability } from './memdb-harness.js';
import {
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  PLAIN_ENTITIES,
  restoreInto,
  seedNotes,
  uniqueDbName,
  type BackupRxDB
} from './sqlite-backup-fixture.js';

const CAPABILITIES: readonly MemdbRestoreCapability[] = ['setChangeEventsMuted', 'describeBlankDatabase'];
const KINDS: readonly SqliteBackupStorageKind[] = ['memory', 'persistent'];

describe('memdb restore client capabilities', () => {
  const opened: BackupRxDB[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map(db => db.close()));
  });

  const archive = async (): Promise<Uint8Array> => {
    const source = createBackupRxDB(memdbBackupHarness, uniqueDbName('capability-src'), PLAIN_ENTITIES, 'memory');
    opened.push(source);
    const adapter = await source.connect();
    await seedNotes(source.entities);
    const out = collectingSink();
    await adapter.backup(out.sink);
    return out.bytes();
  };

  for (const missing of CAPABILITIES) {
    for (const kind of KINDS) {
      it(`refuses a ${kind} target whose client has no ${missing}`, async () => {
        const bytes = await archive();
        const harness = memdbHarnessWithout(missing);
        const target = createBackupRxDB(harness, uniqueDbName('capability-dst'), PLAIN_ENTITIES, kind);
        opened.push(target);
        const { stream, probe } = chunkedSource(bytes);
        await expect(restoreInto(target, stream)).rejects.toMatchObject({
          code: 'unsupported_combination',
          details: { field: `client.${missing}` }
        });
        expect(probe.pulledBytes).toBe(0);
      });
    }
  }
});
