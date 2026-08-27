import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { createRestHandlers, RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { checkOPFSAvailable } from '@aiao/utils';
import { recordChangeFeedNotification, recordChangeFeedUnavailable } from './change-feed-diagnostics';
import {
  CHANGE_FEED_PATH,
  CLIENT_ID_HEADER,
  DEMO_TOKEN,
  ID_CHUNK_SIZE,
  PAGE_SIZE,
  resolveApiBaseUrl,
  resolveChangeFeedEnabled,
  resolveDiagnosticsEnabled
} from './demo-config';
import { recordEtagDiagnostic } from './etag-diagnostics';
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
 * 库级 `sync` 写成 `SyncType.None`——真正的 QueryCache 策略挂在 `Recipe` 类上
 * （理由见 `recipe.ts`）。`SyncType.None` + 两端都配，是让系统实体留在本地
 * （`selectPrimaryAdapterKind`：只要配了 local 就选 local）的同时，把 `http` 这个名字
 * 交给核心。
 *
 * 两个适配器名**都必须**在这里出现，哪怕实体上已经写过一遍：`Repository` 构造
 * QueryCache 主仓储时读的是 `rxdb.localAdapter$` / `rxdb.remoteAdapter$`，而这两条流
 * 只由库级 `sync` 喂（`RxDB.init()`），实体级的 `remote.adapter` 核心并不看。
 * 漏掉 `remote` 时 `remoteAdapter$` 被 `filter(Boolean)` 吞掉，`combineLatest` 永不发射。
 * 这条静默悬挂已由 US-021 修成配置期 fail-fast：现在漏配会在 `RxDB.init()` 抛
 * `missingQueryCacheAdapter` 元数据违规，而不是让页面停在「加载中…」。
 *
 * `handlers` 用 `createRestHandlers()`，并**显式**给了 `version` 与 `isTableExisted`：
 * 这两个操作默认**不产出** handler（`rest.ts` 说得很直白：给它们猜一个默认端点等于
 * 替接入方发明一个不存在的 URL）。而 AC#8 的「后端版本」这一栏正是 `version()` 的返回值，
 * 不配就只能拿到一个 unsupported 异常。
 */
export default (): RxDB => {
  if (rxdb) return rxdb;

  const baseUrl = resolveApiBaseUrl(location.search);
  const diagnostics = resolveDiagnosticsEnabled(location.search);
  const changeFeedInitiallyOn = resolveChangeFeedEnabled(location.search);

  rxdb = new RxDB({
    dbName: DB_NAME,
    entities: [Recipe],
    sync: {
      type: SyncType.None,
      local: { adapter: 'wa-sqlite' },
      remote: { adapter: 'http' }
    }
  });

  rxdb
    .adapter('http', db => {
      // 类型标注不能省。下面的 `auth` 闭包读了 `adapter` 自己，构成一条
      // 「初始化器引用自身」的环，TS 推不出类型就退化成 `any`——在 strict 下
      // 直接是 TS7022 / TS7023 两条错。写死类型即斩断这条环。
      const adapter: RxDBAdapterHttp = new RxDBAdapterHttp(db, {
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
        // 只在 `?diagnostics=1` 下装：适配器**默认**对「读不到 ETag」保持沉默，
        // 而 e2e 里有一条用例守着那个默认。开关让两种行为在同一个构建产物上都能演示。
        onEtagUnreadable: diagnostics ? recordEtagDiagnostic : undefined,
        // 通道**无条件配上**，开关交给运行时（下面那个 stopChangeFeed 与面板上的
        // checkbox）。配置项在这里缺席的话，「开关」就只能靠重建适配器实现，
        // 也就是 location.reload()——那不是开关，那是刷新。
        changeFeed: {
          url: CHANGE_FEED_PATH,
          onNotification: recordChangeFeedNotification,
          onUnavailable: recordChangeFeedUnavailable
        },
        // 固定假 token。后端只校验它存在，没有任何真实身份认证——
        // 这是本 demo 明确划在范围外的一件事。
        //
        // 通道开着时额外带上本机 `clientId`：后端把它回显进通知，本页收到自己的
        // 回声就直接丢掉（D6）。**只在开关打开时带**——多一个自定义头会多一次预检，
        // 而 AC#21 要求关掉开关时网线上的行为逐字照旧。
        //
        // 读的是 `adapter.changeFeedEnabled` 这个**现值**而不是构造期的初始值：
        // 开关能在运行时翻，快照下来的话，页内关掉通道之后这个头还会一直发下去。
        auth: () => ({
          authorization: `Bearer ${DEMO_TOKEN}`,
          ...clientIdHeader(adapter.changeFeedEnabled, db)
        })
      });

      // 关在 `connect()` 之前：晚一步的话，「关着」这一支也会先开出一条 SSE
      // 再关掉，白白多一次连接与一轮 D7 全量失效。
      if (!changeFeedInitiallyOn) {
        adapter.stopChangeFeed();
      }
      return adapter;
    })
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

  connectDevTools(rxdb);

  return rxdb;
};

/**
 * 写入请求上的发起方标记。
 *
 * @param enabled - 变更通知开关的**现值**，每次请求现读
 * @param instance - 本 demo 的实例
 * @returns 开关关着、或 `clientId` 尚未生成时是**空对象**——不发这个头
 *
 * @remarks
 * `context.clientId` 由 `RxDB.init()` 生成。auth hook 每次请求都会被调用，
 * 正常时序下早已就绪；这里不为「万一没有」编一个假值，缺了就不带这个头——
 * 后端读不到它只会广播一条不含 `clientId` 的通知，本页顶多多查一次，不会出错。
 */
const clientIdHeader = (enabled: boolean, instance: RxDB): Record<string, string> => {
  const clientId = instance.context.clientId;
  return enabled && typeof clientId === 'string' ? { [CLIENT_ID_HEADER]: clientId } : {};
};

/**
 * 把实例挂到 RxDB DevTools 连接器上，供 Chrome 扩展检查。
 *
 * @param instance - 本模块刚组装好的实例
 *
 * @remarks
 * 参数而不是读模块级的 `rxdb`：那个变量是 `RxDB | undefined`，收窄到了 `then` 回调里就失效了。
 *
 * **动态 `import()` 不是「按需加载」**——连接器每次都装。它换的是初始 chunk 的体积：
 * `project.json` 的 production budget 卡在 initial 2mb，而 e2e 跑的正是那个构建产物，
 * 把整套 v2 线协议静态拉进首屏等于让一个调试设施去消耗验收预算。
 * 晚到不影响可用性：扩展的面板连上后由 background 发 `PING`，连接器收到会重发握手，
 * 在那之前页面侧的事件进缓冲区。
 *
 * **不挂 `?devtools=1` 这类开关**，与隔壁的 `?diagnostics=1` 是两种情况：那个开关保的是
 * 「没配回调时适配器保持沉默」这一条**默认行为**本身要能演示（见 `demo-config.ts`），
 * 而连接器在场不改变适配器、网线与 console 的任何一件事——它只订阅事件。
 * 给它加开关，唯一能新增的现象是「忘了带参数，所以扩展里什么都没有」。
 *
 * 时序上早于 `RxDB.init()`：库是在 `app.config.ts` 的 `connect()` 里才初始化的。
 * 连接器的 `init` 只读 `config.entities` 与装饰器元数据、并挂事件监听，都不要求库已就绪；
 * 真正要读 `entityManager` 的命令得等面板接上，那已经在首屏之后很久。
 */
const connectDevTools = (instance: RxDB): void => {
  void import('@aiao/rxdb-devtools').then(({ getDevToolsConnector }) => {
    getDevToolsConnector().init(instance, getEntityMetadata);
  });
};
