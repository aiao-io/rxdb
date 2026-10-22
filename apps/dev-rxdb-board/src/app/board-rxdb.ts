import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel, nextRestoreDbName } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { firstValueFrom } from 'rxjs';

/**
 * 看板实例工厂与恢复编排（US-537 宿主半边）。
 *
 * 首轮支持组合：sqlite-wasm 主线程 `vfs: 'idb'`；归档只恢复到同 adapter、
 * 未连接的新库名，恢复完成后整页重载、读回成功才把新库写成活动位置。
 */

/** 演示数据的初始库名（新建空看板与装载演示数据共用命名空间，取下一个空位）。 */
export const BOARD_DB_PREFIX = 'rxdb-board';
/** 本次恢复目标：启动清理只处理这一份存储。 */
export const RESTORE_TARGET_KEY = 'rxdb-board-restore-target';

/** 恢复、启动读回与残留清理共用跨页面互斥锁。 */
export const withBoardRestoreLock = <T>(operation: () => Promise<T>, wait = true): Promise<T> =>
  navigator.locks.request('rxdb-board:restore', { ifAvailable: !wait }, lock => {
    if (lock === null) throw new Error('另一页面正在准备或恢复看板，请稍后重试');
    return operation();
  });

export const createBoardRxdb = (dbName: string): RxDB => {
  const db = new RxDB({
    dbName,
    entities: [Board, Column, Task, BoardLabel, TaskLabel],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  // 搜索插件自阶段 A 起安装并维护索引（schema 一次到位）
  db.use(rxDBPluginHistory);
  db.use(rxDBPluginSearch);
  db.adapter(
    'sqlite-wasm',
    () => new RxDBAdapterSqlite(db, { vfs: 'idb', wasmUrl: `${document.baseURI}sqlite-wasm/wa-sqlite-async.wasm` })
  );
  return db;
};

/** 连接（幂等）。 */
export const connectBoardRxdb = async (db: RxDB): Promise<void> => {
  await db.connect('sqlite-wasm');
};

/** 装载演示数据：只装进新库（US-537 演示数据只进新库，避免固定 ID 撞主键）。 */
export const seedBoardDemo = async (db: RxDB): Promise<void> => {
  const boardRepo = db.entityManager.getRepository(Board);
  const boards = await firstValueFrom(boardRepo.count({ where: { combinator: 'and', rules: [] } }));
  if (boards > 0) throw new Error('演示数据只能装进新库');
  await seedReleaseBoardDataset(db);
};

/** 在未连接的实例上把归档恢复到新库名（US-217：必须在 rxdb.connect() 之前调用）。 */
export const restoreBoardArchive = async (db: RxDB, file: File): Promise<void> => {
  const adapter = await db.getAdapter('sqlite-wasm');
  await adapter.restore(file.stream());
};

/** 清理有记录且实际存在的未完成恢复。 */
export const cleanupBoardRestoreTarget = async (dbName: string): Promise<void> => {
  if (!(await listExistingDbNames()).includes(dbName)) return;
  const db = createBoardRxdb(dbName);
  const adapter = await db.getAdapter('sqlite-wasm');
  await adapter.cleanupIncompleteRestore();
};

/** 读回前验证目标存储存在，避免连接时把丢失的恢复库初始化成空库。 */
export const assertBoardRestoreTargetExists = async (dbName: string): Promise<void> => {
  if (!(await listExistingDbNames()).includes(dbName)) throw new Error('恢复目标存储已不存在');
};

/** 现有 IndexedDB 库名（sqlite-wasm idb vfs 以库名落盘），供新库名避让。 */
const listExistingDbNames = async (): Promise<string[]> => {
  return (await indexedDB.databases())
    .map(info => info.name ?? '')
    .filter(name => name !== '')
    .map(name => name.split('@')[0]);
};

/**
 * 生成不与活动位置冲突、也不与现存 IndexedDB 库冲突的新库名。
 *
 * 只避开活动名会回绕：`restore-0` → 重置建 `restore-1` → 再重置回算 `restore-0`
 * 撞上已存在的用户旧库，种子装载报「演示数据只能装进新库」永久失败。
 */
export const nextBoardDbName = async (activeDbName: string | null): Promise<string> =>
  nextRestoreDbName(activeDbName, await listExistingDbNames());
