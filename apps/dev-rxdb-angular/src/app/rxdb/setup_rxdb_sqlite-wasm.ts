import { getEntityMetadata, RxDB } from '@aiao/rxdb';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import {
  getE2eDbName,
  installSearchDemoTestApi,
  SEARCH_PARITY_ARTICLES,
  SEARCH_PARITY_COMMENTS
} from '@aiao/rxdb-test';
import { Article, Comment } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import { APP_BASE_HREF, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { demoRxDBOptions, getSqliteWasmUrl, useDemoPlugins } from './demo-rxdb-config';
import { getImportedDbName } from './imported-db';

let rxdb: RxDB | null | undefined;
const DEFAULT_DB_NAME = 'aiao';

/** e2e 需要「未启用 + 有内容」的手动启用路径时，用这个 localStorage 键跳过启动时的自动启用。 */
const WORKING_TREE_AUTO_ENABLE_SKIP_KEY = 'rxdb-e2e-skip-working-tree-auto-enable';

// Angular demo 历史上用 localStorage（跨标签页共享同一隔离名）+ e2e 端口 8200 检测，
// 这两个差异通过 options 注入，避免破坏既有 spec 期望
function getAngularDbName(): string {
  return getE2eDbName(DEFAULT_DB_NAME, {
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
    isE2e: () =>
      typeof window !== 'undefined' && (window.location.port === '8200' || Boolean(window.navigator.webdriver))
  });
}

async function seedSearchParityData(db: RxDB) {
  const articleRepo = db.entityManager.getRepository(Article);
  const commentRepo = db.entityManager.getRepository(Comment);
  for (const articleData of SEARCH_PARITY_ARTICLES) {
    await articleRepo.create(Object.assign(new Article(), articleData));
  }
  for (const commentData of SEARCH_PARITY_COMMENTS) {
    await commentRepo.create(Object.assign(new Comment(), commentData));
  }
}

export default () => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!isBrowser) throw new Error('RxDB setup requires a browser platform');
  const baseHref = inject(APP_BASE_HREF);
  if (rxdb) return rxdb;
  // 导入页恢复出来的库（US-909 阶段 B）：恢复经主线程 IDB 写入，打开它也必须走 IDB
  const importedDbName = getImportedDbName(window.localStorage);
  const dbName = importedDbName ?? getAngularDbName();
  const forceIdb = importedDbName !== null || window.location.port === '8200';
  const db = new RxDB(demoRxDBOptions(dbName));
  rxdb = db;
  useDemoPlugins(db, async () => {
    const opfsAvailable = !forceIdb && (await checkOPFSAvailable());
    if (opfsAvailable) {
      return {
        vfs: 'opfs',
        wasmUrl: getSqliteWasmUrl(baseHref, 'opfs'),
        worker: true,
        workerInstance: new Worker(new URL('./sqlite-wasm.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-sqlite-wasm-worker'
        })
      };
    }
    return {
      vfs: 'idb',
      wasmUrl: getSqliteWasmUrl(baseHref, 'idb'),
      sharedWorker: true,
      sharedWorkerInstance: new SharedWorker(new URL('./sqlite-wasm-shared.worker', import.meta.url), {
        type: 'module',
        name: 'rxdb-sqlite-wasm-shared-worker'
      })
    };
  });

  db.init();
  // 空库在应用启动时自动初始化工作树；已有内容的库保持未启用，由 /working-tree 面板显式点击。
  // `enableIfEmpty()` 自会解析 localAdapter$（连接就绪后生效），这里 fire-and-forget 即可。
  if (typeof window !== 'undefined' && window.localStorage.getItem(WORKING_TREE_AUTO_ENABLE_SKIP_KEY) === null) {
    void db.workingTree.enableIfEmpty().catch(() => undefined);
  }
  installSearchDemoTestApi(db, { Article, Comment, seedData: seedSearchParityData });
  // 失败现场归档另开主线程 IDB 连接读同一个库，只在主实例确定走 IDB 时成立；OPFS 档的库在 Worker 里，读不到。
  // 按需加载：备份读写不进初始包。fixture 归档前会等 `window.__rxdbFailureArchive` 出现
  if (forceIdb) {
    void import('./failure-archive-api').then(({ installFailureArchiveApi }) =>
      installFailureArchiveApi(db, { dbName, baseHref })
    );
  }

  const devtools = getDevToolsConnector();
  devtools.init(db, getEntityMetadata);

  return db;
};
