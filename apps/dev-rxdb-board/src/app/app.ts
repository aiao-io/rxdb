import type { BoardShellOptions } from '@aiao/rxdb-plugin-board';
import { BoardShellComponent } from '@aiao/rxdb-plugin-board-angular';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { Component } from '@angular/core';

import { connectBoardDevTools, createBoardRxdb } from './board-rxdb';

/**
 * 看板 demo 壳（US-540 / US-537）：启动选择、工具栏（重置为演示数据 / 从备份恢复）与恢复编排
 * 全部来自绑定包的 `<board-shell>`（编排在核心包 `BoardShellController`，三端宿主共用同一份）；
 * 本应用只给出 sqlite-wasm 主线程 `vfs: 'idb'` 的实例工厂、演示数据与 DevTools 连接。
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [BoardShellComponent],
  template: `<board-shell [options]="options" />`
})
export class App {
  protected readonly options: BoardShellOptions = {
    createRxdb: createBoardRxdb,
    adapterName: 'sqlite-wasm',
    seed: seedReleaseBoardDataset,
    onRxdbActivated: connectBoardDevTools
  };
}
