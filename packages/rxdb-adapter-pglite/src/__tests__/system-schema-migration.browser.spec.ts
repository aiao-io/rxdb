import {
  RXDB_CHANGE_CODEC_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RXDB_WRITER_PROTOCOL_VERSION,
  RxDBChange,
  RxDBMigration,
  type RxDB
} from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

interface WriterResponse {
  type: 'ready' | 'written' | 'fenced' | 'closed' | 'error';
  message?: string;
}

const isWriterResponse = (value: unknown): value is WriterResponse => {
  if (typeof value !== 'object' || value === null) return false;
  const type = Reflect.get(value, 'type');
  return type === 'ready' || type === 'written' || type === 'fenced' || type === 'closed' || type === 'error';
};

const createRxdb = (databaseId: string): RxDB =>
  ({
    config: { dbName: databaseId, entities: [RxDBChange, RxDBMigration] },
    context: {},
    connect: async () => undefined,
    dispatchEvent: () => undefined,
    schemaManager: { getEntityMetadata: () => undefined, getEntityTypeByTableName: () => undefined },
    versionManager: { getCurrentBranch: async () => ({ id: 'main' }) }
  }) as unknown as RxDB;

const waitForResponse = (worker: Worker, expectedType: WriterResponse['type']): Promise<WriterResponse> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for PGlite writer ${expectedType}.`));
    }, 30_000);
    const cleanup = (): void => {
      clearTimeout(timeout);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (!isWriterResponse(event.data)) return;
      if (event.data.type === 'error') {
        cleanup();
        reject(new Error(event.data.message));
        return;
      }
      if (event.data.type !== expectedType) return;
      cleanup();
      resolve(event.data);
    };
    const onError = (event: ErrorEvent): void => {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
  });

const initializeWriter = async (databaseId: string, dataDir: string): Promise<Worker> => {
  const worker = new Worker(new URL('./pglite-migration-writer.worker.ts', import.meta.url), {
    type: 'module',
    name: `${databaseId}-writer`
  });
  const ready = waitForResponse(worker, 'ready');
  worker.postMessage({ type: 'initialize', databaseId, dataDir });
  await ready;
  return worker;
};

const closeWriter = async (worker: Worker): Promise<void> => {
  const closed = waitForResponse(worker, 'closed');
  worker.postMessage({ type: 'close' });
  await closed;
};

const installLegacySchema = async (adapter: RxDBAdapterPGlite, databaseId: string): Promise<void> => {
  const statements = [
    'CREATE SCHEMA IF NOT EXISTS "rxdb"',
    `CREATE TABLE "rxdb"."rxdb_migration" (
      "id" serial PRIMARY KEY,
      "name" varchar NOT NULL,
      "executedAt" timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE "rxdb"."rxdb_change" (
      "id" serial PRIMARY KEY,
      "entityId" uuid NOT NULL
    )`,
    `CREATE TABLE "rxdb"."rxdb_upgrade_guard" (
      "databaseId" text PRIMARY KEY,
      "epoch" integer NOT NULL,
      "state" text NOT NULL,
      "ownerId" text,
      "ownerExpiresAt" timestamptz,
      "minProtocol" integer NOT NULL
    )`,
    `CREATE TABLE "rxdb"."rxdb_writer_lease" (
      "databaseId" text NOT NULL,
      "writerId" text NOT NULL,
      "protocolVersion" integer NOT NULL,
      "epoch" integer NOT NULL,
      "lastSeenAt" timestamptz NOT NULL,
      "expiresAt" timestamptz NOT NULL,
      PRIMARY KEY ("databaseId", "writerId")
    )`
  ];
  for (const statement of statements) await adapter.internalQuery(statement);
  await adapter.internalQuery(
    `INSERT INTO "rxdb"."rxdb_upgrade_guard"
     ("databaseId", "epoch", "state", "ownerId", "ownerExpiresAt", "minProtocol")
     VALUES ($1::text, 1, 'open', NULL, NULL, $2::integer)`,
    [databaseId, RXDB_WRITER_PROTOCOL_VERSION]
  );
};

const adapters = new Set<RxDBAdapterPGlite>();
const workers = new Set<Worker>();
const opfsDirectories = new Set<string>();

const removeOpfsDirectory = async (root: FileSystemDirectoryHandle, directory: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      await root.removeEntry(directory, { recursive: true });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return;
      if (!(error instanceof DOMException) || error.name !== 'NoModificationAllowedError' || Date.now() >= deadline) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
};

afterEach(async () => {
  const activeWorkers = Array.from(workers);
  workers.clear();
  for (const worker of activeWorkers) worker.terminate();
  const activeAdapters = Array.from(adapters);
  adapters.clear();
  await Promise.all(activeAdapters.map(adapter => adapter.disconnect()));
  const root = await navigator.storage.getDirectory();
  const directories = Array.from(opfsDirectories);
  opfsDirectories.clear();
  for (const directory of directories) await removeOpfsDirectory(root, directory);
});

describe('PGlite Worker migration fencing', () => {
  it('drains a crashed Worker and fences a stale Worker after migration', async () => {
    const databaseId = `pglite-worker-migration-${crypto.randomUUID()}`;
    const dataDir = `opfs-ahp://${databaseId}`;
    opfsDirectories.add(databaseId);
    const adapter = new RxDBAdapterPGlite(createRxdb(databaseId), { dataDir });
    adapters.add(adapter);
    await adapter.connect();
    await installLegacySchema(adapter, databaseId);

    const crashedWriter = await initializeWriter(databaseId, dataDir);
    const staleWriter = await initializeWriter(databaseId, dataDir);
    workers.add(crashedWriter);
    workers.add(staleWriter);
    const leases = await adapter.internalQuery<{ writerId: string }>(
      `SELECT "writerId" FROM "rxdb"."rxdb_writer_lease" WHERE "databaseId" = $1::text`,
      [databaseId]
    );
    expect(leases.rows).toHaveLength(2);

    await expect(adapter.migrateSystemSchema()).rejects.toThrow(/active writer lease/i);

    crashedWriter.terminate();
    workers.delete(crashedWriter);
    await adapter.internalQuery(
      `UPDATE "rxdb"."rxdb_writer_lease"
       SET "expiresAt" = clock_timestamp() + interval '1 second'
       WHERE "databaseId" = $1::text`,
      [databaseId]
    );
    await new Promise(resolve => setTimeout(resolve, 1200));

    await expect(adapter.migrateSystemSchema()).resolves.toBeUndefined();
    const guard = await adapter.internalQuery<{ epoch: number; state: string; ownerId: string | null }>(
      `SELECT "epoch", "state", "ownerId"
       FROM "rxdb"."rxdb_upgrade_guard" WHERE "databaseId" = $1::text`,
      [databaseId]
    );
    expect(guard.rows).toEqual([{ epoch: 2, state: 'open', ownerId: null }]);
    const watermarks = await adapter.internalQuery<{ name: string }>(
      `SELECT "name" FROM "rxdb"."rxdb_migration" ORDER BY "name"`
    );
    expect(watermarks.rows.map(row => row.name).sort()).toEqual(
      [RXDB_CHANGE_CODEC_WATERMARK, RXDB_SYSTEM_SCHEMA_WATERMARK].sort()
    );

    const fenced = waitForResponse(staleWriter, 'fenced');
    staleWriter.postMessage({ type: 'write' });
    await expect(fenced).resolves.toEqual(
      expect.objectContaining({ type: 'fenced', message: expect.stringMatching(/fenced by epoch|requires reconnect/) })
    );
    await closeWriter(staleWriter);
    workers.delete(staleWriter);
  }, 60_000);
});
