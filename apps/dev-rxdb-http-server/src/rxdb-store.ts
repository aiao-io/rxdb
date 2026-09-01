/**
 * 后端 RxDB 装配：pglite 文件落盘 + ServerRecipe 单实体。
 *
 * @remarks
 * 阶段 B 在 A2 的基础上把 `store: 'memory'` 换成 pglite 的 Node `dataDir`（B3）：
 * 数据落在 PostgreSQL 格式的文件目录里，进程重启后仍在。`reset` 的「删库重建」
 * 也从「删 node:sqlite 文件」变为「销毁 RxDB 实例 → 删 `dataDir` → 重建 → 经引擎写种子」。
 *
 * `multiInstance: false` 显式关掉跨 tab 协调（RxDBTabsGateway 依赖 BroadcastChannel / Web Locks，
 * Node 后端没有这些 Web API，与微信小程序逻辑层是同一情形）。
 * `SyncType.None + local: pglite`：后端是全租户共享的权威库，不触发任何远端路径。
 */

import type { Repository, RuleGroup } from '@aiao/rxdb';
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { ServerRecipe } from '@modules/recipes-domain';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { firstValueFrom } from 'rxjs';

import type { RecipeRow } from './seed.ts';

/** 后端 RxDB 食谱存储。 */
export interface RxdbRecipeStore {
  /** ServerRecipe 的仓储，七个协议端点都从它读写。 */
  readonly repo: Repository<typeof ServerRecipe>;
  /** RxDB 实例（取 entityManager / 挂事件监听用）。 */
  readonly rxdb: RxDB;
  /** 释放 pglite 句柄。关服 / reset 前必须调用。 */
  destroy(): Promise<void>;
}

const SERVER_DB_NAME = 'rxdb-http-demo-server';

/** 无过滤的空 where（引擎的 `find` 要求 `where` 非空）。 */
const EMPTY_WHERE: RuleGroup<ServerRecipe> = { combinator: 'and', rules: [] };

/**
 * 建后端 RxDB（pglite `dataDir` 文件落盘）+ 连接，Recipe 表由 `connect()` 的建表链路建成。
 *
 * @param dataDir - pglite 的数据目录（Node 下为普通文件系统路径，走 NodeFS）。
 */
export const createRxdbRecipeStore = async (dataDir: string): Promise<RxdbRecipeStore> => {
  // pglite 的 NodeFS 用非递归 `mkdirSync` 建 dataDir，父目录必须已存在。
  mkdirSync(dirname(dataDir), { recursive: true });
  const rxdb = new RxDB({
    dbName: SERVER_DB_NAME,
    // D9：后端实例是全租户共享，`context` 填服务器身份（不是任何用户），引擎拿它盖审计字段。
    context: { userId: 'server' },
    entities: [ServerRecipe],
    multiInstance: false,
    sync: { type: SyncType.None, local: { adapter: 'pglite' } }
  });
  rxdb.adapter('pglite', async db => new RxDBAdapterPGlite(db, { dataDir }));
  await rxdb.connect('pglite');
  return {
    repo: rxdb.entityManager.getRepository(ServerRecipe),
    rxdb,
    destroy: () => rxdb.disconnectAll()
  };
};

/**
 * 删掉 pglite 数据目录本身。
 *
 * @remarks
 * 与 node:sqlite 时代的 `deleteDatabaseFile` 同义，是 `reset`「删库重建」里的「删」。
 * 调用方必须先 `destroy()` 关掉连接、释放文件句柄，否则删目录会与还开着的文件打架。
 */
export const deleteRxdbDataDir = (dataDir: string): void => {
  rmSync(dataDir, { recursive: true, force: true });
};

/** 库当前是否为空（用于 `serve` 的「空库自动补种子」）。 */
export const isEmptyRxdbStore = async (store: RxdbRecipeStore): Promise<boolean> => {
  const rows = await firstValueFrom(store.repo.find({ where: EMPTY_WHERE, limit: 1 }));
  return rows.length === 0;
};

/**
 * 经引擎写种子。
 *
 * @remarks
 * 行内容与 `seed.ts` 的确定性种子逐字节相同（id / createdAt / updatedAt 都由固定基准派生）；
 * `instantiate` 显式传入 `createdAt` / `updatedAt`，让种子行落在过去（2025-01-xx），
 * 新建行（`updatedAt` = 服务端当前时刻）才能严格大于水位线、排在末页。
 *
 * 250 行的 INSERT 经引擎的批处理 + 变更管道的 NOTIFY 聚合后只派发**一条** Recipe 实体事件
 * （不是逐行 250 条），因此种子只触发一次广播，满足 D7 的「不逐行广播」。
 */
export const seedRxdbStore = async (store: RxdbRecipeStore, rows: readonly RecipeRow[]): Promise<number> => {
  const entities = rows.map(row =>
    store.rxdb.entityManager.instantiate(ServerRecipe, {
      id: row.id,
      title: row.title,
      status: row.status,
      price: row.price,
      tag: row.tag,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    })
  );
  await store.rxdb.entityManager.saveMany(entities);
  return entities.length;
};

/** 清空全部 Recipe 行，返回删除条数（已空则 0）。 */
export const clearRxdbStore = async (store: RxdbRecipeStore): Promise<number> => {
  const all = await firstValueFrom(store.repo.findAll({ where: EMPTY_WHERE }));
  if (all.length > 0) await store.rxdb.entityManager.removeMany(all);
  return all.length;
};
