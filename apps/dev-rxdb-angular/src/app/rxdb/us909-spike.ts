// US-909 阶段 B spike：临时文件，spike 结束即删。
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import { cloneEntityClasses } from '@aiao/rxdb/testing';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { ENTITIES } from '@aiao/rxdb-test/entities';
import { ENTITIES as shop_entities } from '@aiao/rxdb-test/shop';
import { withSqliteWasmRepository, GRAPH_REPOSITORY_NAME } from './sqlite-wasm-repositories';
import { SqliteGraphRepository } from '@aiao/rxdb-plugin-graph/sqlite';

type Probe = { dataVersion: unknown; schemaVersion: unknown; schemaSql: string; rows: Record<string, number> };

const rowsOf = (result: unknown): unknown[][] =>
  ((result as { results: { rows?: unknown[][] }[] }).results[0]?.rows ?? []) as unknown[][];

async function probe(adapter: RxDBAdapterSqliteBase): Promise<Probe> {
  const q = async (sql: string) => rowsOf(await adapter.internalQuery(sql));
  const tables = (await q("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")).map(r => String(r[0]));
  const rows: Record<string, number> = {};
  for (const t of tables) rows[t] = Number((await q(`SELECT count(*) FROM "${t}"`))[0]?.[0]);
  return {
    dataVersion: (await q('PRAGMA data_version'))[0]?.[0],
    schemaVersion: (await q('PRAGMA schema_version'))[0]?.[0],
    schemaSql: (await q('SELECT group_concat(sql, char(10)) FROM sqlite_schema'))[0]?.[0] as string,
    rows
  };
}

function createSecondary(dbName: string, baseHref: string): RxDB {
  const db = new RxDB({
    dbName,
    multiInstance: false,
    context: { userId: 'userId' },
    entities: cloneEntityClasses([...ENTITIES, ...shop_entities, EncryptedUser]),
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  db.use(rxDBPluginGraph)
    .use(rxDBPluginHistory)
    .use(rxDBPluginStorage)
    .use(rxDBPluginTree)
    .use(rxDBPluginWorkspace)
    .use(rxDBPluginWorkingTree)
    .adapter(
      'sqlite-wasm',
      async d =>
        new RxDBAdapterSqlite(
          d,
          withSqliteWasmRepository(
            { vfs: 'idb', wasmUrl: `${baseHref}sqlite-wasm/wa-sqlite-async.wasm` },
            GRAPH_REPOSITORY_NAME,
            SqliteGraphRepository
          )
        )
    );
  db.use(rxDBPluginSearch, { debounce: 300, pageSize: 20, snippetLength: 64 });
  db.init();
  return db;
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export function installUs909Spike(primary: RxDB, rawDbName: string, baseHref: string): void {
  const primaryAdapter = async () => (await primary.getAdapter('sqlite-wasm')) as unknown as RxDBAdapterSqliteBase;
  const api = {
    probePrimary: async () => probe(await primaryAdapter()),
    async backup(writesDuring = 0) {
      const t0 = performance.now();
      const pBefore = await probe(await primaryAdapter());
      const secondary = createSecondary(rawDbName, baseHref);
      const adapter = (await secondary.getAdapter('sqlite-wasm')) as unknown as RxDBAdapterSqliteBase;
      const chunks: Uint8Array[] = [];
      const sink = new WritableStream<Uint8Array>({ write: c => void chunks.push(c.slice()) });
      try {
        await secondary.connect('sqlite-wasm');
        const tConnected = performance.now();
        const pAfterConnect = await probe(await primaryAdapter());
        const secondaryProbe = await probe(adapter);
        const writes: Promise<unknown>[] = [];
        for (let i = 0; i < writesDuring; i++) {
          writes.push(primaryAdapter().then(a => a.internalQuery('SELECT 1')));
        }
        const result = await adapter.backup(sink);
        const pAfterBackup = await probe(await primaryAdapter());
        await Promise.all(writes);
        let status: unknown;
        try {
          status = await secondary.workingTree.status();
        } catch (e) {
          status = `status error: ${String(e)}`;
        }
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          out.set(c, off);
          off += c.byteLength;
        }
        return {
          ok: true,
          connectMs: tConnected - t0,
          totalMs: performance.now() - t0,
          bytes: total,
          base64: toBase64(out),
          manifest: result.manifest,
          entries: result.entries,
          status,
          secondaryRows: secondaryProbe.rows,
          versions: [pBefore, pAfterConnect, pAfterBackup].map(p => [p.schemaVersion, p.dataVersion]),
          schemaSame: pBefore.schemaSql === pAfterBackup.schemaSql
        };
      } catch (e) {
        const err = e as { code?: string; message?: string; name?: string };
        return { ok: false, error: `${err.name}:${err.code ?? ''}:${err.message}` };
      } finally {
        await secondary.destroy();
      }
    },
    async restore(base64: string, dbName: string) {
      const target = createSecondary(dbName, baseHref);
      try {
        const adapter = (await target.getAdapter('sqlite-wasm')) as unknown as RxDBAdapterSqliteBase;
        const result = await adapter.restore(new Blob([fromBase64(base64)]).stream());
        return { ok: true, entries: result.entries, bytes: result.bytes };
      } catch (e) {
        const err = e as { code?: string; message?: string; name?: string };
        return { ok: false, error: `${err.name}:${err.code ?? ''}:${err.message}` };
      } finally {
        await target.destroy();
      }
    },
    async status() {
      return primary.workingTree.status();
    }
  };
  (window as unknown as { __us909Spike: typeof api }).__us909Spike = api;
}
