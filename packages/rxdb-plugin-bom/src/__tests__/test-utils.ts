/**
 * @fileoverview BOM 插件测试装配：wa-sqlite 与 pglite 双后端各建一个已装插件的 RxDB。
 */

import { EntityType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { BOM_ENTITIES, BomItem } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { rxDBPluginBom } from '../plugin.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

export type BomTestBackend = 'wa-sqlite' | 'pglite';

export type BomTestAdapter = RxDBAdapterWaSqlite | RxDBAdapterPGlite;

/** 建一个已连接、已装 BOM 插件与全部 BOM 实体的数据库。 */
export const createBomTestAdapter = async (
  backend: BomTestBackend,
  entities: readonly EntityType[] = BOM_ENTITIES,
  options: { dbName?: string; persistent?: boolean } = {}
): Promise<BomTestAdapter> => {
  // 固定 dbName 用于「两个连接同一份存储」的快照一致性场景；persistent 走 IDBBatchAtomicVFS
  // （按名共享），memory 走 MemoryAsyncVFS（按实例独立）
  const dbName =
    options.dbName ??
    `bom-test-${backend}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rxdb = new RxDB({
    dbName,
    entities: [...entities],
    sync: { local: { adapter: backend }, type: SyncType.None }
  });
  rxdb.use(rxDBPluginBom);
  let adapter: BomTestAdapter;
  rxdb.adapter(backend, db => {
    if (backend === 'wa-sqlite') {
      adapter = new RxDBAdapterWaSqlite(db, {
        vfs: options.persistent ? 'IDBBatchAtomicVFS' : 'MemoryAsyncVFS',
        async: true,
        worker: false,
        wasmPath: asyncWasmPath,
        batchTimeout: 1
      });
    } else {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
    }
    return adapter;
  });
  await rxdb.connect(backend);
  return adapter!;
};

/** 断开并释放测试数据库。 */
export const disposeBomTestAdapter = async (adapter: BomTestAdapter): Promise<void> => {
  await adapter.rxdb.disconnectAll();
};

export { rxDBPluginBom };

// -----------------------------------------------------[ 数量展开 fixture ]

/** 数量展开的一张头（含头数量语义与发生项）。 */
export interface QuantityFixtureHeader {
  item: BomItem;
  defaultPhantom?: boolean;
  baseUom?: string;
  baseQty?: string;
  assemblyScrap?: string;
  assemblyScrapConvention?: 'additive' | 'yield';
  occurrences: {
    child: BomItem;
    qty?: string | null;
    qtyFormula?: string | null;
    isFixedQty?: boolean;
    uom?: string;
    componentScrap?: string;
    componentScrapConvention?: 'additive' | 'yield';
    componentScrapFixed?: string;
    uomConversion?: string | null;
    phantomOverride?: boolean | null;
    tierGroupNo?: string | null;
    lotsizeFrom?: string | null;
    lotsizeTo?: string | null;
  }[];
}

/**
 * 经 loadHistory 一次事务装载一层数量结构（全部已发布修订与头）。
 * 同一子件可出现在多条边里，修订按去重后的物料建。
 */
export const buildQuantityFixture = async (
  adapter: BomTestAdapter,
  headers: QuantityFixtureHeader[],
  options: { bomType?: 'ebom' | 'mbom' | 'sales'; orgId?: string; asOf?: string } = {}
): Promise<void> => {
  const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
  const allItems = [...new Set(headers.flatMap(header => [header.item, ...header.occurrences.map(occurrence => occurrence.child)]))];
  await loadHistory(adapter, {
    batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
    revisions: allItems.map(item => ({
      itemId: item.id,
      revisionNo: 'A',
      effectiveFrom: day(options.asOf ?? '2020-01-01'),
      defaultPhantom: headers.find(header => header.item === item)?.defaultPhantom ?? false
    })),
    headers: headers.map(header => ({
      revisionIndex: allItems.indexOf(header.item),
      bomType: options.bomType ?? 'ebom',
      orgId: options.orgId ?? 'org-x',
      baseUom: header.baseUom,
      baseQty: header.baseQty,
      assemblyScrap: header.assemblyScrap,
      assemblyScrapConvention: header.assemblyScrapConvention,
      lines: header.occurrences.map((occurrence, index) => ({
        lineNo: 10 + index,
        occurrences: [
          {
            childItemId: occurrence.child.id,
            qty: occurrence.qtyFormula ? null : occurrence.qty ?? '1',
            qtyFormula: occurrence.qtyFormula ?? null,
            formulaGrammarVersion: occurrence.qtyFormula ? '1' : null,
            isFixedQty: occurrence.isFixedQty ?? false,
            uom: occurrence.uom ?? 'pcs',
            componentScrap: occurrence.componentScrap ?? '0',
            componentScrapConvention: occurrence.componentScrapConvention ?? 'additive',
            componentScrapFixed: occurrence.componentScrapFixed ?? '0',
            uomConversion: occurrence.uomConversion ?? null,
            phantomOverride: occurrence.phantomOverride ?? null,
            tierGroupNo: occurrence.tierGroupNo ?? null,
            lotsizeFrom: occurrence.lotsizeFrom ?? null,
            lotsizeTo: occurrence.lotsizeTo ?? null,
            effectiveFrom: day(options.asOf ?? '2020-01-01')
          }
        ]
      }))
    }))
  });
};
