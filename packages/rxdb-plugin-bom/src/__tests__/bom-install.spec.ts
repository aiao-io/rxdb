/**
 * @fileoverview 插件安装期校验与原子性
 *
 * 适配器仓储轴漏注册、实体配置依赖不闭合都在 install 期、任何 DDL 之前两后端同一时点拒绝；
 * 合法的部分配置照常连接读写；全部 DDL 单事务下发，任一失败整体回滚。
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
import { rxDBPluginBom } from '../plugin.js';
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
}
