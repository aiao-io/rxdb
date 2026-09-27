/**
 * US-217 阶段 B：SQLite 允许、但逻辑转储容易踩空的边角——备份要么原样带回，要么在备份侧就拒绝，
 * 不能产出一份恢复不了或恢复出来走样的归档；恢复在目标打不开、结束时断开失败等路径上也要给出稳定的错误码。
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { afterEach, describe, expect, it } from 'vitest';
import { readSqliteBackupSchema } from '../../backup/sqlite-backup-schema.js';
import { executeOo1Helper } from '../../execute_oo1_helper.js';
import { assertOo1Static } from '../../oo1-types.js';
import type { RxDBAdapterSqliteBase } from '../../RxDBAdapterSqliteBase.js';
import type { SqliteClientLike } from '../../sqlite-core.types.js';
import { memdbBackupHarness, memdbEngineBackupHarness } from './memdb-harness.js';
import {
  backupErrorCode,
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  interceptSql,
  PLAIN_ENTITIES,
  readNotes,
  restoreInto,
  rowsOf,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  withRawClient,
  type BackupRxDB
} from './sqlite-backup-fixture.js';

describe('memdb backup edge cases', () => {
  const opened: BackupRxDB[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map(db => db.close()));
  });

  const open = (
    prefix: string,
    kind: 'memory' | 'persistent' = 'memory',
    dbName = uniqueDbName(prefix)
  ): BackupRxDB => {
    const db = createBackupRxDB(memdbBackupHarness, dbName, PLAIN_ENTITIES, kind);
    opened.push(db);
    return db;
  };

  const seededArchive = async (): Promise<Uint8Array> => {
    const source = open('seeded-src');
    await source.connect();
    await seedNotes(source.entities);
    const out = collectingSink();
    await (await source.adapter()).backup(out.sink);
    return out.bytes();
  };

  /** 让 adapter 之后新开的连接经过 `patch` 改造。 */
  const patchClients = (
    adapter: RxDBAdapterSqliteBase,
    patch: (client: SqliteClientLike) => SqliteClientLike
  ): void => {
    const createClient = adapter['createClient'].bind(adapter);
    adapter['createClient'] = async () => patch(await createClient());
  };

  const failingOpen = (adapter: RxDBAdapterSqliteBase, cause: Error): void => {
    adapter['createClient'] = () => Promise.reject(cause);
  };

  describe('TEXT values that are not valid UTF-8', () => {
    it('refuses the backup instead of archiving text that would come back altered', async () => {
      const source = open('utf8-src');
      const adapter = await source.connect();
      await adapter.rawQuery('CREATE TABLE raw_text (id INTEGER PRIMARY KEY, body TEXT)');
      await adapter.rawQuery("INSERT INTO raw_text (id, body) VALUES (1, 'fine'), (2, CAST(X'61FF62' AS TEXT))");
      const error: unknown = await adapter.backup(collectingSink().sink).then(
        () => undefined,
        (failure: unknown) => failure
      );
      expect(error).toMatchObject({
        code: 'unsupported_combination',
        details: { field: 'rowText', actual: 'raw_text' }
      });
      // 源库不受影响，删掉那一行就能备份
      await adapter.rawQuery('DELETE FROM raw_text WHERE id = 2');
      const out = collectingSink();
      await adapter.backup(out.sink);
      const target = open('utf8-dst');
      await restoreInto(target, chunkedSource(out.bytes()).stream);
      const restored = await target.connect();
      expect(rowsOf(await restored.query('SELECT id, body FROM raw_text ORDER BY id'))).toEqual([[1, 'fine']]);
    });

    it('keeps valid multi-byte text and NUL-bearing text byte for byte', async () => {
      const source = open('utf8-ok-src');
      const adapter = await source.connect();
      await adapter.rawQuery('CREATE TABLE raw_text (id INTEGER PRIMARY KEY, body TEXT)');
      await adapter.rawQuery(
        "INSERT INTO raw_text (id, body) VALUES (1, '中文 ✓ 😀'), (2, CAST(X'610062E4B8AD' AS TEXT)), (3, '')"
      );
      const out = collectingSink();
      await adapter.backup(out.sink);
      const target = open('utf8-ok-dst');
      await restoreInto(target, chunkedSource(out.bytes()).stream);
      const restored = await target.connect();
      const hex = 'SELECT id, hex(body), typeof(body) FROM raw_text ORDER BY id';
      expect(rowsOf(await restored.query(hex))).toEqual(rowsOf(await adapter.query(hex)));
    });
  });

  describe('schema statements SQLite accepts', () => {
    it('round-trips triggers on a table named begin and trigger bodies that start with WITH / VALUES', async () => {
      const source = open('trigger-src');
      const adapter = await source.connect();
      await adapter.rawQuery('CREATE TABLE begin (id INTEGER PRIMARY KEY, n INTEGER)');
      await adapter.rawQuery('CREATE TABLE audit (msg TEXT)');
      await adapter.rawQuery(
        "CREATE TRIGGER begin AFTER INSERT ON begin WHEN new.n > 0 BEGIN INSERT INTO audit VALUES ('begin ' || new.n); END"
      );
      await adapter.rawQuery(
        'CREATE TRIGGER cte AFTER UPDATE ON begin BEGIN INSERT INTO audit SELECT new.n; WITH x(v) AS (SELECT new.n) SELECT v FROM x; VALUES (1); END'
      );
      await adapter.rawQuery('CREATE VIRTUAL TABLE quoted_fts USING "fts5"(body)');
      await adapter.rawQuery("INSERT INTO begin (id, n) VALUES (1, 5); INSERT INTO quoted_fts (body) VALUES ('hello')");
      const out = collectingSink();
      await adapter.backup(out.sink);
      const target = open('trigger-dst');
      await restoreInto(target, chunkedSource(out.bytes()).stream);
      const restored = await target.connect();
      await restored.rawQuery('UPDATE begin SET n = 7 WHERE id = 1');
      await restored.rawQuery('INSERT INTO begin (id, n) VALUES (2, 3)');
      expect(rowsOf(await restored.query('SELECT msg FROM audit ORDER BY rowid'))).toEqual([
        ['begin 5'],
        ['7'],
        ['begin 3']
      ]);
      expect(rowsOf(await restored.query("SELECT body FROM quoted_fts WHERE quoted_fts MATCH 'hello'"))).toEqual([
        ['hello']
      ]);
    });
  });

  describe('schema statements the restore side would refuse', () => {
    it('refuses the backup when a schema statement is not a single CREATE statement', async () => {
      const source = open('schema-guard-src');
      interceptSql(await source.adapter(), sql =>
        sql.startsWith('SELECT type, name, tbl_name, sql FROM sqlite_schema') ?
          `SELECT * FROM (${sql.replace(' ORDER BY rowid', '')}) UNION ALL ` +
          "SELECT 'view', 'bad_view', 'bad_view', 'CREATE VIEW bad_view AS SELECT 1; DROP TABLE t'"
        : undefined
      );
      const adapter = await source.connect();
      await expect(adapter.backup(collectingSink().sink)).rejects.toMatchObject({
        code: 'unsupported_combination',
        details: { field: 'sql', actual: 'bad_view' }
      });
    });

    // 浏览器里的 SQLite 构建都带 SQLITE_OMIT_UTF16，建不出 UTF-16 库；这里把探测里的原生编码字节换成
    // UTF-16le 的样子，走真实 SQL 的判定分支
    it('refuses a database whose text encoding is not UTF-8', async () => {
      const initFn = sqlite3InitModule as (options: Record<string, unknown>) => Promise<unknown>;
      const module = await initFn({ print: () => undefined, printErr: () => undefined });
      assertOo1Static(module);
      const db = new module.oo1.DB(':memory:');
      try {
        db.exec({ sql: 'CREATE TABLE raw_text (body TEXT)' });
        const executor = {
          execute: async (sql: string) => executeOo1Helper('probe', db, sql.replace("hex(CAST('a' AS BLOB))", "'6100'"))
        };
        await expect(readSqliteBackupSchema(executor)).rejects.toMatchObject({
          code: 'unsupported_combination',
          details: { field: 'encoding', actual: 'UTF-16le' }
        });
      } finally {
        db.close();
      }
    });
  });

  describe('restore target that cannot be opened', () => {
    for (const kind of ['memory', 'persistent'] as const) {
      it(`reports storage_full for a ${kind} target when opening it runs out of quota`, async () => {
        const archive = await seededArchive();
        const target = open('open-fail-dst', kind);
        failingOpen(await target.adapter(), new DOMException('quota', 'QuotaExceededError'));
        expect(await backupErrorCode(restoreInto(target, chunkedSource(archive).stream))).toBe('storage_full');
      });

      it(`reports io_error for a ${kind} target that fails to open`, async () => {
        const archive = await seededArchive();
        const target = open('open-fail-dst', kind);
        const cause = new Error('open failed');
        failingOpen(await target.adapter(), cause);
        const error: unknown = await restoreInto(target, chunkedSource(archive).stream).then(
          () => undefined,
          (failure: unknown) => failure
        );
        expect(error).toMatchObject({ code: 'io_error', cause });
      });
    }

    it('reports cleanup_pending when the cleanup cannot open the target', async () => {
      const target = open('cleanup-open-fail', 'persistent');
      const cause = new Error('open failed');
      const adapter = await target.adapter();
      failingOpen(adapter, cause);
      await expect(adapter.cleanupIncompleteRestore()).rejects.toMatchObject({ code: 'cleanup_pending', cause });
    });
  });

  describe('closing the restored target', () => {
    it('says the database is complete when only closing the connection fails', async () => {
      const archive = await seededArchive();
      const dbName = uniqueDbName('close-fail-dst');
      const target = open('close-fail-dst', 'persistent', dbName);
      patchClients(await target.adapter(), client => {
        const disconnect = client.disconnect.bind(client);
        client.disconnect = async () => {
          await disconnect();
          throw new Error('close failed');
        };
        return client;
      });
      const error: unknown = await restoreInto(target, chunkedSource(archive).stream).then(
        () => undefined,
        (failure: unknown) => failure
      );
      expect(error).toMatchObject({ code: 'io_error', details: { field: 'disconnect' } });
      expect((error as Error).message).toMatch(/fully restored/);
      const reopened = open('close-fail-dst', 'persistent', dbName);
      expect(await readNotes(await reopened.connect(), reopened.entities)).toEqual(SEEDED_NOTES);
    });
  });

  describe('deciding whether an engine-initialised target is blank', () => {
    it('refuses a target whose engine tables gained rows without reading those rows', async () => {
      const archive = await seededArchive();
      const dbName = uniqueDbName('engine-rows-dst');
      await withRawClient(memdbEngineBackupHarness, dbName, async client => {
        await client.execute(
          'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 500) ' +
            "INSERT INTO engine_settings (key, value) SELECT 'k' || i, 'v' FROM n"
        );
      });
      const target = createBackupRxDB(memdbEngineBackupHarness, dbName, PLAIN_ENTITIES, 'persistent');
      opened.push(target);
      const seen: string[] = [];
      interceptSql(await target.adapter(), sql => {
        seen.push(sql);
        return undefined;
      });
      expect(await backupErrorCode(restoreInto(target, chunkedSource(archive).stream))).toBe('target_not_empty');
      expect(seen.filter(sql => sql.includes('"engine_settings"') && sql.includes('LIMIT ?'))).toEqual([]);
    });
  });
});
