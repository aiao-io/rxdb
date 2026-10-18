import { getEntityMetadata, RxDB, SyncType, type AdapterRepositoryConstructor } from '@aiao/rxdb';
import { PGliteRepository, RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { RxDBAdapterWaSqlite, SqliteRepository, type WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { type BomTestAdapter, type BomTestBackend } from '../src/__tests__/test-utils.js';
import { asyncWasmPath } from '../src/__tests__/wa-sqlite-wasm.js';
import { buildPgBomTriggerDdl, buildSqliteBomTriggerDdl } from '../src/backend/bom-trigger-ddl.js';
import { BOM_ENTITIES, BomHeader, BomItem, BomLine, BomLineOccurrence } from '../src/entities.js';
import { rxDBPluginBom } from '../src/plugin.js';
import { BomRepository } from '../src/repository.js';
import { bomSqlDialectFor } from '../src/resolve/bom-sql.js';
import { loadHistory } from '../src/resolve/history-loader.js';
import { deterministicId } from '../src/testing/scooter-dataset.js';

/** 在同一持久库上分别装配升级前实体/触发器和当前插件，不伪造派生数据。 */
export const connectReachUpgradeDatabase = async (
  backend: BomTestBackend,
  dbName: string,
  legacy: boolean
): Promise<BomTestAdapter> => {
  const db = new RxDB({
    dbName,
    entities: [...BOM_ENTITIES],
    sync: { local: { adapter: backend }, type: SyncType.None }
  });
  if (legacy) db.repository('BomRepository', { class: BomRepository });
  else db.use(rxDBPluginBom);
  let local: BomTestAdapter | undefined;
  db.adapter(backend, owner => {
    const instance =
      backend === 'pglite' ?
        new RxDBAdapterPGlite(owner, {
          store: 'idb',
          repositories: {
            BomRepository: PGliteRepository as unknown as AdapterRepositoryConstructor<RxDBAdapterPGlite>
          }
        })
      : new RxDBAdapterWaSqlite(owner, {
          vfs: 'IDBBatchAtomicVFS',
          async: true,
          worker: false,
          wasmPath: asyncWasmPath,
          batchTimeout: 1,
          repositories: { BomRepository: SqliteRepository } as unknown as WaSqliteOptions['repositories']
        });
    local = instance;
    return instance;
  });
  await db.connect(backend).catch(async cause => {
    await db.destroy();
    throw cause;
  });
  if (local === undefined) throw new Error('升级测试适配器未建立');
  if (legacy) {
    const ddl = backend === 'pglite' ? buildPgBomTriggerDdl : buildSqliteBomTriggerDdl;
    await local.bootstrapTransaction(async executor => {
      for (const Entity of BOM_ENTITIES) {
        for (const statement of ddl(getEntityMetadata(Entity))) await executor.query(statement);
      }
    }, false);
  }
  return local;
};

/** 经历史写入通道建立真实旧主数据，闭包表此时尚未存在。 */
export const seedReachUpgradeDatabase = async (adapter: BomTestAdapter): Promise<void> => {
  const keys = ['UPGRADE-A', 'UPGRADE-B', 'UPGRADE-C'];
  for (const key of keys) {
    await adapter.rxdb.entityManager
      .instantiate(BomItem, { id: deterministicId(`reach-upgrade:${key}`), itemNo: key })
      .save();
  }
  await loadHistory(adapter, {
    batchNo: 'reach-upgrade-master',
    revisions: keys.map(key => ({
      itemId: deterministicId(`reach-upgrade:${key}`),
      revisionNo: 'A',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
    })),
    headers: [0, 1].map(index => ({
      revisionIndex: index,
      bomType: 'ebom',
      orgId: 'reach-upgrade-org',
      lines: [
        {
          lineNo: 10,
          occurrences: [
            {
              childItemId: deterministicId(`reach-upgrade:${keys[index + 1]}`),
              qty: '1',
              effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
            }
          ]
        }
      ]
    }))
  });
};

/** 模拟约束缺失的旧库坏图，验证升级失败会回滚水位与回填。 */
export const corruptReachUpgradeGraph = async (adapter: BomTestAdapter): Promise<void> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const revision = await adapter.transaction(
    executor =>
      executor.query(`SELECT "id" FROM ${dialect.table('item_revision')} WHERE "itemId" = ${dialect.placeholder(0)}`, [
        deterministicId('reach-upgrade:UPGRADE-C')
      ]),
    false
  );
  const header = adapter.rxdb.entityManager.instantiate(BomHeader, {
    parentRevisionId: String(revision.rows[0][0]),
    bomType: 'ebom',
    orgId: 'reach-upgrade-org'
  });
  await header.save();
  const line = adapter.rxdb.entityManager.instantiate(BomLine, { headerId: header.id, lineNo: 10 });
  await line.save();
  await adapter.transaction(async executor => {
    if (adapter.name === 'pglite') {
      await executor.query(
        `DROP TRIGGER IF EXISTS "bom_line_occurrence__cycle_trg" ON ${dialect.table('bom_line_occurrence')}`
      );
    } else {
      await executor.query('DROP TRIGGER IF EXISTS "bom_line_occurrence_cycle_i"');
      await executor.query('DROP TRIGGER IF EXISTS "bom_line_occurrence_cycle_u"');
    }
  }, false);
  await adapter.rxdb.entityManager
    .instantiate(BomLineOccurrence, {
      lineId: line.id,
      childItemId: deterministicId('reach-upgrade:UPGRADE-A'),
      qty: '1',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
    })
    .save();
};
