/**
 * @fileoverview 插件安装期校验与原子性
 *
 * 适配器仓储轴漏注册、实体配置依赖不闭合都在 install 期、任何 DDL 之前两后端同一时点拒绝；
 * 合法的部分配置照常连接读写；全部 DDL 单事务下发，任一失败整体回滚；
 * 库里已装定义与本次 DDL 一致时重连不执行任何 DDL，不一致（升级、缺失、漂移）时全量重装。
 */

import {
  getEntityMetadata,
  RxDB,
  SyncType,
  type EntityType,
  type TransactionExecutor,
  type TransactionFun
} from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { describe, expect, it } from 'vitest';
import { buildPgBomTriggerDdl, buildSqliteBomTriggerDdl } from '../backend/bom-trigger-ddl.js';
import {
  BOM_ENTITIES,
  BomAttrDef,
  BomHistoryBatch,
  BomItem,
  BomItemRevision,
  BomLine,
  BomLineDesignator
} from '../entities.js';
import { installedBomDdl, rxDBPluginBom } from '../plugin.js';
import { buildReachInstallDdl } from '../reach/install.js';
import { BomBackendCapabilityError, BomError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const settle = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => null,
    (error: unknown) => error
  );

/** 装了插件、但适配器 options 没有注册 BomRepository 的连接。 */
const connectWithoutAdapterRepositories = async (backend: BomTestBackend): Promise<unknown> => {
  const rxdb = new RxDB({
    dbName: `bi-${crypto.randomUUID().slice(0, 8)}`,
    entities: [...BOM_ENTITIES],
    sync: { local: { adapter: backend }, type: SyncType.None }
  });
  rxdb.use(rxDBPluginBom);
  rxdb.adapter(backend, db =>
    backend === 'wa-sqlite' ?
      new RxDBAdapterWaSqlite(db, {
        vfs: 'MemoryAsyncVFS',
        async: true,
        worker: false,
        wasmPath: asyncWasmPath,
        batchTimeout: 1
      })
    : new RxDBAdapterPGlite(db, { store: 'memory' })
  );
  try {
    return await settle(rxdb.connect(backend));
  } finally {
    await rxdb.disconnectAll();
  }
};

/** 连接失败后读回失败的那一刻（适配器未断开）库里实际存在的触发器名。 */
const existingTriggers = async (adapter: BomTestAdapter, names: readonly string[]): Promise<string[]> => {
  const list = names.map(name => `'${name}'`).join(', ');
  const result = await adapter.bootstrapTransaction(
    executor =>
      executor.query(
        adapter.name === 'pglite' ?
          `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (${list})`
        : `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN (${list})`
      ),
    false
  );
  return result.rows.map(row => String(row[0]));
};

/** SQL 含 marker 的语句注入失败，其余调用原样转发给真实执行器（方法绑定回真实对象，私有字段可用）。 */
const failingExecutor = (executor: TransactionExecutor, marker: string): TransactionExecutor =>
  new Proxy(executor, {
    get: (target, key) => {
      if (key === 'query')
        return (sql: string, params?: readonly unknown[]) =>
          sql.includes(marker) ? Promise.reject(new Error('注入的 DDL 失败')) : target.query(sql, params);
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

/** 某实体后端 DDL 会创建的全部触发器名。 */
const triggerNamesOf = (backend: BomTestBackend, Entity: EntityType): string[] => {
  const build = backend === 'pglite' ? buildPgBomTriggerDdl : buildSqliteBomTriggerDdl;
  return build(getEntityMetadata(Entity)).flatMap(statement =>
    [...statement.matchAll(/CREATE TRIGGER (?:IF NOT EXISTS )?"([^"]+)"/g)].map(match => match[1])
  );
};

/** 插件对全部 BOM 实体下发的完整 DDL，与安装同序（实体 DDL 在前，判环与可达维护在后）。 */
const installDdl = (backend: BomTestBackend): string[] => {
  const build = backend === 'pglite' ? buildPgBomTriggerDdl : buildSqliteBomTriggerDdl;
  return [...BOM_ENTITIES.flatMap(Entity => build(getEntityMetadata(Entity))), ...buildReachInstallDdl(backend)];
};

/** 每条语句先记下再原样转发给真实执行器。 */
const recordingExecutor = (executor: TransactionExecutor, sink: string[]): TransactionExecutor =>
  new Proxy(executor, {
    get: (target, key) => {
      if (key === 'query')
        return (sql: string, params?: readonly unknown[]) => {
          sink.push(sql);
          return target.query(sql, params);
        };
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

/** BOM 存储层 DDL（触发器、触发器函数与安装指纹），核心的建表 / 建索引不计。 */
const isBomDdl = (sql: string): boolean =>
  /^\s*(?:DROP\s+TRIGGER\b|CREATE\s+TRIGGER\b|CREATE\s+OR\s+REPLACE\s+FUNCTION\b|DO\s+\$\$|COMMENT\s+ON\b)/i.test(sql);

/** 以全部 BOM 实体连接持久库，记下这次连接经引导事务执行的 BOM DDL；连接由调用方释放。 */
const connectPersistent = async (
  backend: BomTestBackend,
  dbName: string
): Promise<{ adapter: BomTestAdapter; ddl: string[] }> => {
  const adapter = await createBomTestAdapter(backend, BOM_ENTITIES, { dbName, persistent: true, deferConnect: true });
  const statements: string[] = [];
  const original = adapter.bootstrapTransaction.bind(adapter);
  adapter.bootstrapTransaction = (<T extends TransactionFun>(fun: T, transactionLog?: boolean) =>
    original((executor => fun(recordingExecutor(executor, statements))) as T, transactionLog)) as typeof original;
  try {
    await adapter.rxdb.connect(backend);
  } catch (failure) {
    await disposeBomTestAdapter(adapter);
    throw failure;
  }
  return { adapter, ddl: statements.filter(isBomDdl) };
};

/** 直连删掉一个可达维护触发器，模拟表重建或手工 DDL 让已装对象缺失。 */
const dropReachTrigger = (adapter: BomTestAdapter): Promise<unknown> =>
  adapter.rawQuery(
    adapter.name === 'pglite' ?
      'DROP TRIGGER "bom_reach_maintain" ON "bom"."bom_line_occurrence"'
    : 'DROP TRIGGER "bom_reach_insert"'
  );

/** SQLite 里本插件触发器按创建序（rowid）排列的名字。 */
const sqliteTriggerOrder = async (adapter: BomTestAdapter): Promise<string[]> => {
  const ours = new Set(
    installDdl('wa-sqlite').flatMap(statement => /^CREATE TRIGGER "([^"]+)"/.exec(statement.trim())?.slice(1) ?? [])
  );
  const result = await adapter.transaction(
    executor => executor.query(`SELECT "name" FROM sqlite_master WHERE "type" = 'trigger' ORDER BY rowid`),
    false
  );
  return result.rows.map(row => String(row[0])).filter(name => ours.has(name));
};

for (const backend of BACKENDS) {
  describe(`插件安装期校验 [${backend}]`, () => {
    it('适配器仓储轴漏注册 BomRepository：connect 即失败并给出注册写法，不拖到首次读写', async () => {
      const failure = await connectWithoutAdapterRepositories(backend);
      expect(failure).toBeInstanceOf(BomBackendCapabilityError);
      expect(String((failure as Error).message)).toContain('BomRepository');
      expect(String((failure as Error).message)).toContain(
        backend === 'pglite' ? 'BomRepository: PGliteRepository' : 'BomRepository: SqliteRepository'
      );
    }, 60_000);

    it('触发器读取未配置实体的部分配置在 install 期点名拒绝（核心关系校验放行的反向依赖）', async () => {
      const failure = await settle(
        createBomTestAdapter(
          backend,
          BOM_ENTITIES.filter(Entity => Entity !== BomLineDesignator)
        )
      );
      expect(failure).toBeInstanceOf(BomError);
      expect(String((failure as Error).message)).toMatch(/BomLineOccurrence → [^；]*BomLineDesignator/);
    }, 60_000);

    it('仓储写入校验读取未配置实体的部分配置在 install 期点名拒绝', async () => {
      const failure = await settle(createBomTestAdapter(backend, [BomItem, BomItemRevision, BomHistoryBatch]));
      expect(failure).toBeInstanceOf(BomError);
      expect(String((failure as Error).message)).toContain('BomItem → BomAttrDef');
    }, 60_000);

    it('含发生项却缺图源实体的配置由核心关系校验在任何 DDL 之前拒绝', async () => {
      const failure = await settle(
        createBomTestAdapter(
          backend,
          BOM_ENTITIES.filter(Entity => Entity !== BomLine)
        )
      );
      expect(String(failure)).toContain('BomLine');
    }, 60_000);

    it('依赖闭合的部分配置（物料 + 扩展属性定义 + 修订 + 历史批次）照常连接、写入、发布与读取', async () => {
      const adapter = await createBomTestAdapter(backend, [BomItem, BomAttrDef, BomItemRevision, BomHistoryBatch]);
      try {
        const item = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: `partial-${backend}` });
        await item.save();
        const revision = adapter.rxdb.entityManager.instantiate(BomItemRevision, {
          itemId: item.id,
          revisionNo: 'A',
          effectiveFrom: new Date('2099-01-01T00:00:00.000Z')
        });
        await revision.save();
        revision.state = 'released';
        await revision.save();
        const stored = await adapter.transaction(
          executor =>
            executor.query(
              `SELECT "state" FROM ${executor.tableRef(BomItemRevision)} WHERE "itemId" = ${backend === 'pglite' ? '$1' : '?'}`,
              [item.id]
            ),
          false
        );
        expect(stored.rows).toEqual([['released']]);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);

    it('全部 DDL 单事务下发：末段可达维护失败时，前面实体的触发器一并回滚', async () => {
      const adapter = await createBomTestAdapter(backend, BOM_ENTITIES, { deferConnect: true });
      const marker = backend === 'pglite' ? '"bom_reach_maintain"' : '"bom_reach_insert"';
      const original = adapter.bootstrapTransaction.bind(adapter);
      adapter.bootstrapTransaction = (<T extends TransactionFun>(fun: T, transactionLog?: boolean) =>
        original((executor => fun(failingExecutor(executor, marker))) as T, transactionLog)) as typeof original;
      try {
        const failure = await settle(adapter.rxdb.connect(backend));
        expect(String((failure as Error | null)?.message)).toContain('BOM 触发器 DDL 安装失败');
        adapter.bootstrapTransaction = original;
        expect(await existingTriggers(adapter, triggerNamesOf(backend, BomItemRevision))).toEqual([]);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);
  });

  describe(`存储层 DDL 已装即跳过 [${backend}]`, () => {
    it('重连且定义未变：只读目录比对，不执行任何 DDL', async () => {
      const dbName = `bi-${crypto.randomUUID().slice(0, 8)}`;
      const first = await connectPersistent(backend, dbName);
      await disposeBomTestAdapter(first.adapter);
      expect(first.ddl.slice(0, installDdl(backend).length)).toEqual(installDdl(backend));
      const again = await connectPersistent(backend, dbName);
      try {
        expect(again.ddl).toEqual([]);
      } finally {
        await disposeBomTestAdapter(again.adapter);
      }
    }, 60_000);

    it('已装触发器缺失（表重建 / 直连删除）：重连全量重装并补回', async () => {
      const dbName = `bi-${crypto.randomUUID().slice(0, 8)}`;
      const first = await connectPersistent(backend, dbName);
      try {
        await dropReachTrigger(first.adapter);
      } finally {
        await disposeBomTestAdapter(first.adapter);
      }
      const again = await connectPersistent(backend, dbName);
      try {
        expect(again.ddl.slice(0, installDdl(backend).length)).toEqual(installDdl(backend));
        const name = backend === 'pglite' ? 'bom_reach_maintain' : 'bom_reach_insert';
        expect(await existingTriggers(again.adapter, [name])).toEqual([name]);
      } finally {
        await disposeBomTestAdapter(again.adapter);
      }
    }, 60_000);

    it('已装定义比对：任一条语句文本变化或出现认不出的语句即判为未装（升级必重装）', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const statements = installDdl(backend);
        const isCurrent = (candidate: readonly string[]): Promise<boolean> =>
          adapter.transaction(executor => installedBomDdl(backend, candidate).isCurrent(executor), false);
        const changed = statements.findLastIndex(statement => statement.includes('BEGIN'));
        expect(await isCurrent(statements)).toBe(true);
        expect(
          await isCurrent(
            statements.map((statement, index) => (index === changed ? statement.replace('BEGIN', 'BEGIN ') : statement))
          )
        ).toBe(false);
        expect(
          await isCurrent([...statements, 'CREATE INDEX IF NOT EXISTS "bom_probe" ON "bom$bom_line" ("lineNo");'])
        ).toBe(false);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);

    it.runIf(backend === 'wa-sqlite')(
      '同文本但创建序漂移：重连全量重装，恢复安装序（同表同事件触发器按逆创建序执行）',
      async () => {
        const dbName = `bi-${crypto.randomUUID().slice(0, 8)}`;
        const first = await connectPersistent(backend, dbName);
        const order = await sqliteTriggerOrder(first.adapter);
        try {
          const [oldest] = order;
          const stored = await first.adapter.transaction(
            executor => executor.query(`SELECT "sql" FROM sqlite_master WHERE "name" = ?`, [oldest]),
            false
          );
          await first.adapter.rawQuery(`DROP TRIGGER "${oldest}"`);
          await first.adapter.rawQuery(String(stored.rows[0][0]));
          expect(await sqliteTriggerOrder(first.adapter)).toEqual([...order.slice(1), oldest]);
        } finally {
          await disposeBomTestAdapter(first.adapter);
        }
        const again = await connectPersistent(backend, dbName);
        try {
          expect(again.ddl.slice(0, installDdl(backend).length)).toEqual(installDdl(backend));
          expect(await sqliteTriggerOrder(again.adapter)).toEqual(order);
        } finally {
          await disposeBomTestAdapter(again.adapter);
        }
      },
      60_000
    );
  });
}
