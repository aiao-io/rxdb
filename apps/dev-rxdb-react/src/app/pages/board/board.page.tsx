import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel, type BoardShellOptions } from '@aiao/rxdb-plugin-board';
import { BoardShell } from '@aiao/rxdb-plugin-board-react';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

/** 看板实例工厂：sqlite-wasm 主线程 `vfs: 'idb'`（US-537 首轮支持组合），库名由外壳分配。 */
const createBoardRxdb = (dbName: string): RxDB => {
  const db = new RxDB({
    dbName,
    entities: [Board, Column, Task, BoardLabel, TaskLabel],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  // 搜索插件自阶段 A 起安装并维护索引（schema 一次到位，US-538）
  db.use(rxDBPluginHistory);
  db.use(rxDBPluginSearch);
  db.adapter('sqlite-wasm', () => new RxDBAdapterSqlite(db, { vfs: 'idb' }));
  return db;
};

/** 外壳配置取模块级常量：引用变化会让外壳重建并断开当前看板。 */
const shellOptions: BoardShellOptions = {
  createRxdb: createBoardRxdb,
  adapterName: 'sqlite-wasm',
  seed: seedReleaseBoardDataset
};

/**
 * 看板页（US-539 宿主半边）：`BoardShell` 负责启动选择、备份恢复与跨页恢复门禁（US-537）。
 * 每个看板库是独立 RxDB 实例，启动选择前不连接，不复用宿主的 RxDB 上下文。
 */
export default function BoardPage() {
  return <BoardShell options={shellOptions} />;
}
