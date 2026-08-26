import { RxDB, SyncType } from '@aiao/rxdb';
import { createRestHandlers, RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { checkOPFSAvailable } from '@aiao/utils';
import { DEMO_TOKEN, ID_CHUNK_SIZE, PAGE_SIZE, resolveApiBaseUrl } from './demo-config';
import { Recipe } from './recipe';
import { buildWaSqliteOptions, isSharedWorkerSupported } from './wa-sqlite-options';

/** 本地行缓存的库名。 */
const DB_NAME = 'rxdb-http-demo';

let rxdb: RxDB | undefined;

/**
 * 组装 demo 的 RxDB 实例。
 *
 * @returns 单例；重复调用返回同一个
 *
 * @remarks
 * 库级 `sync` 写成 `SyncType.None` + 只有 local——真正的 QueryCache 策略挂在
 * `Recipe` 类上（理由见 `recipe.ts`）。库级只需要声明「本地落在 wa-sqlite」，
 * 让系统实体有个能建表的去处。
 *
 * `handlers` 用 `createRestHandlers()`，并**显式**给了 `version` 与 `isTableExisted`：
 * 这两个操作默认**不产出** handler（`rest.ts` 说得很直白：给它们猜一个默认端点等于
 * 替接入方发明一个不存在的 URL）。而 AC#8 的「后端版本」这一栏正是 `version()` 的返回值，
 * 不配就只能拿到一个 unsupported 异常。
 */
export default (): RxDB => {
  if (rxdb) return rxdb;

  const baseUrl = resolveApiBaseUrl(location.search);

  rxdb = new RxDB({
    dbName: DB_NAME,
    entities: [Recipe],
    sync: {
      type: SyncType.None,
      local: { adapter: 'wa-sqlite' }
    }
  });

  rxdb
    .adapter(
      'http',
      db =>
        new RxDBAdapterHttp(db, {
          baseUrl,
          handlers: createRestHandlers({
            resources: { Recipe: 'recipes' },
            templates: {
              version: { path: 'meta/version' },
              // 探测走 `POST :entity/metadata`（`limit: 1`）而不是默认的 `HEAD :entity`：
              // 参考后端没实现 HEAD，会回 405，而 405 既不是 2xx 也不是 404，
              // 正好落进「抛错」那一支，把一次能答上来的探测变成故障。
              isTableExisted: { method: 'POST', path: ':entity/metadata' }
            }
          }),
          // 这两个数不是调参偏好：默认值（1000 / 100）会让 250 行的种子一次拉完、
          // 首屏 50 行一块装下，翻页与分块两条代码路径一行都不执行。见 demo-config.ts。
          pageSize: PAGE_SIZE,
          idChunkSize: ID_CHUNK_SIZE,
          conditionalRequests: true,
          // 固定假 token。后端只校验它存在，没有任何真实身份认证——
          // 这是本 demo 明确划在范围外的一件事。
          auth: () => ({ authorization: `Bearer ${DEMO_TOKEN}` })
        })
    )
    .adapter('wa-sqlite', async db => {
      const options = buildWaSqliteOptions(
        { opfs: await checkOPFSAvailable(), sharedWorker: isSharedWorkerSupported() },
        {
          createWorker: () =>
            new Worker(new URL('./wa-sqlite.worker', import.meta.url), {
              type: 'module',
              name: `rxdb-wa-sqlite-worker-${DB_NAME}`
            }),
          createSharedWorker: () =>
            new SharedWorker(new URL('./wa-sqlite-shared.worker', import.meta.url), {
              type: 'module',
              name: `rxdb-wa-sqlite-shared-worker-${DB_NAME}`
            })
        }
      );
      return new RxDBAdapterWaSqlite(db, options);
    });

  return rxdb;
};
