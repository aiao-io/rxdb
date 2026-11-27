import { Entity, EntityBase, getEntityMetadata, PropertyType } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { EncryptedSuiteOptions, EncryptedTestAdapter } from './types.js';

const SIGNED_64_MIN = -(1n << 63n);
const SIGNED_64_MAX = (1n << 63n) - 1n;
const DEFAULT_PASSPHRASE = 'test-passphrase-2026-encrypted-bigint-binary';

@Entity({
  name: 'EncryptedBigIntBinaryRecord',
  tableName: 'encrypted_bigint_binary_record',
  namespace: 'encrypted-bigint-binary',
  log: false,
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'minimum', type: PropertyType.bigint, encrypted: true },
    { name: 'maximum', type: PropertyType.bigint, encrypted: true },
    { name: 'payload', type: PropertyType.binary, encrypted: true }
  ]
})
class EncryptedBigIntBinaryRecord extends EntityBase<bigint> {
  declare id: bigint;
  minimum!: bigint;
  maximum!: bigint;
  payload!: Uint8Array;
}

@Entity({
  name: 'EncryptedBigIntBinaryHistoryRecord',
  tableName: 'encrypted_bigint_binary_history_record',
  namespace: 'encrypted-bigint-binary-history',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'counter', type: PropertyType.bigint, encrypted: true },
    { name: 'payload', type: PropertyType.binary, encrypted: true }
  ]
})
class EncryptedBigIntBinaryHistoryRecord extends EntityBase<bigint> {
  declare id: bigint;
  counter!: bigint;
  payload!: Uint8Array;
}

const readHistoryRecord = (id: bigint): Promise<EncryptedBigIntBinaryHistoryRecord> =>
  firstValueFrom(EncryptedBigIntBinaryHistoryRecord.get(id));

async function readEnvelope(
  adapter: EncryptedTestAdapter,
  tableName: string,
  column: string,
  id: bigint
): Promise<string> {
  const result = await adapter.query(`SELECT ${column} FROM ${tableName} WHERE id = ?`, [id]);
  const rows = result.results[0]?.rows ?? [];
  if (rows.length !== 1) throw new Error(`expected one row for id=${id}, got ${rows.length}`);
  const value = rows[0][0];
  if (typeof value !== 'string') throw new Error(`expected envelope string, got ${typeof value}`);
  return value;
}

export function runBigIntBinaryEncryptedSuite(options: EncryptedSuiteOptions): void {
  const { factory } = options;
  const passphrase = options.passphrase ?? DEFAULT_PASSPHRASE;
  const meta = getEntityMetadata(EncryptedBigIntBinaryRecord);
  const tableName =
    options.resolveTableName?.({ namespace: meta.namespace, tableName: meta.tableName }) ??
    `"${meta.namespace}$${meta.tableName}"`;
  void getEntityMetadata(EncryptedBigIntBinaryHistoryRecord);

  describe.sequential(`Encrypted bigint/binary [${factory.name}]`, () => {
    describe.sequential('CRUD codec', () => {
      let adapter: EncryptedTestAdapter;

      beforeAll(async () => {
        adapter = await factory.createAdapter({ entities: [EncryptedBigIntBinaryRecord] });
        await adapter.encryption.unlock({ passphrase });
      });

      afterAll(async () => {
        if (adapter) await adapter.rxdb.disconnectAll();
      });

      it('round-trips signed 64-bit boundaries and copies the current binary view', async () => {
        const source = new Uint8Array([9, 0, 0xff, 8]);
        const view = source.subarray(1, 3);
        const record = new EncryptedBigIntBinaryRecord();
        record.id = SIGNED_64_MAX;
        record.minimum = SIGNED_64_MIN;
        record.maximum = SIGNED_64_MAX;
        record.payload = view;
        await record.save();

        const restored = await firstValueFrom(EncryptedBigIntBinaryRecord.get(SIGNED_64_MAX));
        expect(restored.id).toBe(SIGNED_64_MAX);
        expect(restored.minimum).toBe(SIGNED_64_MIN);
        expect(restored.maximum).toBe(SIGNED_64_MAX);
        expect(typeof restored.minimum).toBe('bigint');
        expect(restored.payload).toBeInstanceOf(Uint8Array);
        expect(restored.payload).toEqual(new Uint8Array([0, 0xff]));

        const envelopeBeforeMutation = await readEnvelope(adapter, tableName, 'payload', record.id);
        source.fill(7);
        const envelopeAfterMutation = await readEnvelope(adapter, tableName, 'payload', record.id);
        expect(envelopeAfterMutation).toBe(envelopeBeforeMutation);

        record.payload[0] = 7;
        await record.save();
        expect(await readEnvelope(adapter, tableName, 'payload', record.id)).toBe(envelopeBeforeMutation);

        record.payload = new Uint8Array([7, 0xff]);
        await record.save();
        expect(await readEnvelope(adapter, tableName, 'payload', record.id)).not.toBe(envelopeBeforeMutation);
        const reassigned = await firstValueFrom(EncryptedBigIntBinaryRecord.get(record.id));
        expect(reassigned.payload).toEqual(new Uint8Array([7, 0xff]));
      });

      it('round-trips bulk inserts with bigint primary keys bound into AAD', async () => {
        const records = [11n, 12n].map(id => {
          const record = new EncryptedBigIntBinaryRecord();
          record.id = id;
          record.minimum = SIGNED_64_MIN + id;
          record.maximum = SIGNED_64_MAX - id;
          record.payload = new Uint8Array([Number(id)]);
          return record;
        });

        await adapter.rxdb.entityManager.saveMany(records);

        for (const record of records) {
          const restored = await firstValueFrom(EncryptedBigIntBinaryRecord.get(record.id));
          expect(restored.id).toBe(record.id);
          expect(restored.minimum).toBe(record.minimum);
          expect(restored.maximum).toBe(record.maximum);
          expect(restored.payload).toEqual(record.payload);
        }
      });

      it.each([
        ['below minimum', 1n, SIGNED_64_MIN - 1n],
        ['above maximum', 2n, SIGNED_64_MAX + 1n],
        ['number instead of bigint', 3n, 1]
      ] as const)('rejects encrypted bigint %s before persistence', async (_, id, value) => {
        const record = new EncryptedBigIntBinaryRecord();
        record.id = id;
        record.minimum = value as bigint;
        record.maximum = 0n;
        record.payload = new Uint8Array();

        await expect(record.save()).rejects.toBeInstanceOf(TypeError);
      });
    });

    describe.sequential('history codec', () => {
      let adapter: EncryptedTestAdapter;

      beforeAll(async () => {
        adapter = await factory.createAdapter({
          entities: [EncryptedBigIntBinaryHistoryRecord]
        });
        await adapter.encryption.unlock({ passphrase });
        await firstValueFrom(adapter.rxdb.versionManager.history(EncryptedBigIntBinaryHistoryRecord).undoHistories$);
      });

      afterAll(async () => {
        if (adapter) await adapter.rxdb.disconnectAll();
      });

      it('restores bigint and binary runtime types through undo and redo', async () => {
        const record = new EncryptedBigIntBinaryHistoryRecord();
        record.id = 42n;
        record.counter = SIGNED_64_MIN;
        const initialPayload = new Uint8Array([0, 0xff]);
        record.payload = initialPayload;
        await record.save();
        initialPayload.fill(9);

        record.counter = SIGNED_64_MAX;
        const nextPayload = new Uint8Array([3, 4]);
        record.payload = nextPayload;
        await record.save();
        const beforeUndo = record.updatedAt.getTime();
        nextPayload.fill(8);

        const history = adapter.rxdb.versionManager.history(EncryptedBigIntBinaryHistoryRecord);
        await history.undo();
        const undone = await readHistoryRecord(record.id);
        expect(undone.counter).toBe(SIGNED_64_MIN);
        expect(undone.payload).toEqual(new Uint8Array([0, 0xff]));
        expect(undone.payload).toBeInstanceOf(Uint8Array);
        expect(undone.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUndo);

        await history.redo();
        const redone = await readHistoryRecord(record.id);
        expect(redone.counter).toBe(SIGNED_64_MAX);
        expect(redone.payload).toEqual(new Uint8Array([3, 4]));
        expect(redone.payload).toBeInstanceOf(Uint8Array);
        expect(redone.updatedAt.getTime()).toBeGreaterThanOrEqual(undone.updatedAt.getTime());
      });

      it('ignores in-place binary mutation until a new view is assigned', async () => {
        const record = new EncryptedBigIntBinaryHistoryRecord();
        record.id = 43n;
        record.counter = 1n;
        record.payload = new Uint8Array([5, 6]);
        await record.save();

        record.payload[0] = 7;
        await record.save();
        adapter.rxdb.entityManager.cleanAllCache();
        adapter.cleanAllCache?.();
        const unchanged = await readHistoryRecord(record.id);
        expect(unchanged.payload).toEqual(new Uint8Array([5, 6]));

        unchanged.payload = new Uint8Array([7, 6]);
        await unchanged.save();
        const history = adapter.rxdb.versionManager.history(EncryptedBigIntBinaryHistoryRecord);
        await history.undo();
        adapter.rxdb.entityManager.cleanAllCache();
        adapter.cleanAllCache?.();
        const undone = await readHistoryRecord(record.id);
        expect(undone.payload).toEqual(new Uint8Array([5, 6]));
      });
    });

    describe.sequential('branch codec', () => {
      let adapter: EncryptedTestAdapter;

      beforeAll(async () => {
        adapter = await factory.createAdapter({
          entities: [EncryptedBigIntBinaryHistoryRecord]
        });
        await adapter.encryption.unlock({ passphrase });
      });

      afterAll(async () => {
        if (adapter) await adapter.rxdb.disconnectAll();
      });

      it('preserves encrypted types across branch switches and merge', async () => {
        const original = new EncryptedBigIntBinaryHistoryRecord();
        original.id = 84n;
        original.counter = SIGNED_64_MAX;
        original.payload = new Uint8Array([3, 4]);
        await original.save();

        const branchId = `encrypted-types-${factory.name}`;
        await adapter.rxdb.versionManager.createBranch(branchId);
        await adapter.rxdb.versionManager.switchBranch(branchId);

        const record = await readHistoryRecord(original.id);
        record.counter = 7n;
        record.payload = new Uint8Array([7, 8]);
        await record.save();

        await adapter.rxdb.versionManager.switchBranch('main');
        const main = await readHistoryRecord(record.id);
        expect(main.counter).toBe(SIGNED_64_MAX);
        expect(main.payload).toEqual(new Uint8Array([3, 4]));

        const result = await adapter.rxdb.versionManager.mergeBranch(branchId);
        expect(result.merged).toBe(1);
        adapter.rxdb.entityManager.cleanAllCache();
        adapter.cleanAllCache?.();
        const merged = await readHistoryRecord(record.id);
        expect(merged.id).toBe(84n);
        expect(typeof merged.id).toBe('bigint');
        expect(merged.counter).toBe(7n);
        expect(typeof merged.counter).toBe('bigint');
        expect(merged.payload).toEqual(new Uint8Array([7, 8]));
        expect(merged.payload).toBeInstanceOf(Uint8Array);
      });
    });
  });
}
