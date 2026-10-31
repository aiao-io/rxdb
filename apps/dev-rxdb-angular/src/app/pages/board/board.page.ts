import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel, type BoardShellOptions } from '@aiao/rxdb-plugin-board';
import { BoardShellComponent } from '@aiao/rxdb-plugin-board-angular';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { APP_BASE_HREF } from '@angular/common';
import { Component, inject } from '@angular/core';

import { getSqliteWasmUrl } from '../../rxdb/demo-rxdb-config';

/**
 * 看板页（US-539 宿主半边）：`<board-shell>` 负责启动选择、备份恢复与跨页恢复门禁（US-537）。
 * 每个看板库是独立 RxDB 实例——sqlite-wasm 主线程 `vfs: 'idb'`、库名由外壳分配、看板实体在 `board` 命名空间，
 * 启动选择前不连接，不复用宿主的 `provideRxDB`。宿主的 OPFS 专用 Worker / IDB SharedWorker 主实例与看板不相交
 * （备份返回 `unsupported_combination`，US-537 首轮支持组合是主线程 idb）。
 */
@Component({
  standalone: true,
  imports: [BoardShellComponent],
  template: `<board-shell [options]="options" />`
})
export default class BoardPage {
  private readonly baseHref = inject(APP_BASE_HREF);

  protected readonly options: BoardShellOptions = {
    createRxdb: dbName => {
      const db = new RxDB({
        dbName,
        entities: [Board, Column, Task, BoardLabel, TaskLabel],
        sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
      });
      // 搜索插件自阶段 A 起安装并维护索引（schema 一次到位，US-538）
      db.use(rxDBPluginHistory);
      db.use(rxDBPluginSearch);
      db.adapter(
        'sqlite-wasm',
        () => new RxDBAdapterSqlite(db, { vfs: 'idb', wasmUrl: getSqliteWasmUrl(this.baseHref, 'idb') })
      );
      return db;
    },
    adapterName: 'sqlite-wasm',
    seed: seedReleaseBoardDataset
  };
}
