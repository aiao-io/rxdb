import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { WorkbenchProject } from '../workbench/rxdb-catalog.js';

const ADAPTER_NAME = 'sqlite-wasm' as const;

let rxdb: RxDB | undefined;

function sqliteWasmOptions(): SqliteOptions {
  return {
    vfs: 'opfs',
    wasmUrl: new URL('sqlite-wasm/wa-sqlite.wasm', document.baseURI).href,
    worker: true,
    workerInstance: new Worker(new URL('./sqlite-wasm.worker', import.meta.url), {
      type: 'module',
      name: 'aiao-vscode-sqlite-worker'
    })
  };
}

/** 应用数据库：只保存项目目录元数据，源码与 Git 历史留在工作台独占的 OPFS 仓库里。 */
export function setupRxDB(): RxDB {
  if (rxdb) return rxdb;
  if (!isPlatformBrowser(inject(PLATFORM_ID))) throw new Error('RxDB setup requires a browser platform');
  rxdb = new RxDB({
    dbName: 'aiao-vscode',
    context: { userId: 'local' },
    entities: [WorkbenchProject],
    sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
  });
  rxdb.adapter(ADAPTER_NAME, async db => new RxDBAdapterSqlite(db, sqliteWasmOptions()));
  rxdb.init();

  if (import.meta.env.DEV) {
    // 先在同步作用域里定住实例：模块级 `rxdb` 是 `RxDB | undefined`，到了异步回调里收窄会失效。
    const instance = rxdb;
    void import('@aiao/rxdb-devtools').then(({ getDevToolsConnector }) => {
      getDevToolsConnector().init(instance, getEntityMetadata);
    });
  }

  void rxdb.connect(ADAPTER_NAME).catch(error => console.error('RxDB connect failed', error));
  return rxdb;
}
