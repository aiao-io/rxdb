/**
 * @fileoverview 测试用库：被录应用库与录制库都起在 PGlite memory 上。
 *
 * @remarks
 * 录制库工厂与 demo 的形状一致（收实体、返回未连接的 `RxDB`），插件自己负责 `connect()`；
 * 这样 node 测试走的就是插件真实的懒建库路径，而不是一个替身。
 */

import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';

let counter = 0;
const uniqueName = (prefix: string): string => `${prefix}-${Date.now()}-${++counter}`;

/** 起在 PGlite 上、尚未连接的库；`dataDir` 缺省时是 memory 库。 */
export const createPgliteDb = (dbName: string, entities: readonly EntityType[], dataDir?: string): RxDB => {
  const db = new RxDB({
    dbName,
    context: { userId: 'replay-test' },
    entities: [...entities],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  db.adapter(
    'pglite',
    async rxdb => new RxDBAdapterPGlite(rxdb, dataDir === undefined ? { store: 'memory' } : { dataDir })
  );
  return db;
};

/** 录制库工厂：每次调用造一个独立的 memory 库，记下造过的库供断言与清理。 */
export const createRecordingDbFactory = () => {
  const created: RxDB[] = [];
  const factory = (entities: readonly EntityType[]): RxDB => {
    const db = createPgliteDb(uniqueName('replay-rec'), entities);
    created.push(db);
    return db;
  };
  return { factory, created };
};

/**
 * 落盘的录制库工厂：每次调用都打开 `dataDir` 下的同一份数据。
 *
 * @remarks
 * 模拟「刷新」：上一个纪元释放时销毁了它的库实例，但数据还在，下一个纪元的工厂再打开同一个目录。
 * 只有续录用例需要它——memory 库随实例销毁而消失，接不上上一页的会话。
 */
export const createPersistentRecordingDbFactory = (dataDir: string) => {
  const created: RxDB[] = [];
  const factory = (entities: readonly EntityType[]): RxDB => {
    const db = createPgliteDb(uniqueName('replay-rec'), entities, dataDir);
    created.push(db);
    return db;
  };
  return { factory, created };
};

/** 被录应用库（不带实体；插件只与它的连接纪元对齐）。 */
export const createAppDb = (dbName: string = uniqueName('replay-app')): RxDB => createPgliteDb(dbName, []);
