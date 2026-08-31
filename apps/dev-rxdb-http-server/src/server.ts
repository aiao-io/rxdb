/**
 * 参考后端的路由层。
 *
 * @remarks
 * 七个协议端点 + 一组 `__control` 开关，全部跑在 `node:http` 上。
 *
 * 阶段 B：协议端点（读+写）全部走 RxDB 的 `Repository` / `EntityManager`（pglite 文件落盘），
 * 替代 `db.ts` 的 `node:sqlite` 直接路径；`node:sqlite` 文件与「双库桥」整体退役。
 * SSE 变更通知由 `rxdb.addEventListener(ENTITY_LOCAL_*)` 驱动（见 `change-broadcaster.ts`）。
 *
 * 中间件的**顺序**是有讲究的，每一条都对应故事里的一条验收：
 *
 * 1. `__control` 最先——离线开关一旦生效就掐断一切协议请求，关开关的那条请求
 *    必须走在闸门前面，否则开关打开后就再也关不掉了。
 * 2. 离线闸门用 `socket.destroy()`，不是回 5xx：协议的错误语义表里写得很清楚，
 *    非 2xx 客户端**不降级**，只有传输失败才抛 `NetworkOfflineError`。回 503 的话
 *    AC#13 的 `offlineFallback` 永远不会被触发。
 * 3. 预检 `OPTIONS` 在鉴权之前——预检请求本来就不带 `Authorization`。
 * 4. 跨源头加在**每一个**响应上，包括错误响应，理由见 `cors.ts`。
 */

import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer as createHttpServer } from 'node:http';

import { createChangeBroadcaster } from './change-broadcaster.ts';
import type { ChangeBroadcaster } from './change-broadcaster.ts';
import { openChangeFeed, readClientId } from './change-feed.ts';
import type { ChangeSubscribers } from './change-subscribers.ts';
import { createChangeSubscribers } from './change-subscribers.ts';
import {
  BACKEND_VERSION,
  BASE_PATH,
  CHANGES_RESOURCE,
  RECIPES_RESOURCE,
  SEED_ROW_COUNT
} from './config.ts';
import type { ControlActions, DemoState } from './control.ts';
import { createDemoState, handleControlRequest, recordRequest } from './control.ts';
import { applyCorsHeaders, handlePreflight } from './cors.ts';
import { computeEtag, HttpError, matchesIfNoneMatch, readJsonBody, sendEmpty, sendJson } from './http-utils.ts';
import {
  createRecipe,
  deleteRecipes,
  findByIds,
  listMetadataByOffset,
  listMetadataByToken,
  updateRecipe
} from './recipes-repository.ts';
import {
  clearRxdbStore,
  createRxdbRecipeStore,
  deleteRxdbDataDir,
  isEmptyRxdbStore,
  seedRxdbStore
} from './rxdb-store.ts';
import type { RxdbRecipeStore } from './rxdb-store.ts';
import { seedRows } from './seed.ts';

/** 建服务器需要的一切。全部显式传入——没有隐式读 `process.env` 的角落，e2e 才好摆布。 */
export interface DemoServerOptions {
  dataDir: string;
  exposeEtag: boolean;
  controlEnabled: boolean;
}

/** 已建好但尚未 `listen` 的服务器及其可变状态。 */
export interface DemoServer {
  server: Server;
  state: DemoState;
  /** 关连接 + 关库。测试里必须调用，否则 pglite 句柄会拖住进程。 */
  close: () => Promise<void>;
}

const JSON_ERROR = (status: number, message: string): Record<string, unknown> => ({
  error: status === 404 ? 'not_found' : 'bad_request',
  message
});

/** 从异常里取状态码。三个自定义错误类都带 `status`，其余一律 500。 */
const statusOf = (error: unknown): number => {
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : 500;
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : 'Internal error');

/**
 * 鉴权。
 *
 * @remarks
 * **缺 `Authorization` 是允许的**，带了则必须是 `Bearer <非空>`。
 *
 * 这一条看似松，但它是 AC#2 与故事 Out of Scope 那句「后端只校验它存在」冲突时的
 * 唯一出路：文档「端到端示例」的五条 curl 里只有第一条带 `Authorization`（而且值是
 * 字面量 `Bearer <token>`），另外四条一个 header 都没有。强制要求存在，AC#2 当场失败。
 * 于是判定改成「带了就得像样」——前端 auth hook 注入的固定假 token 照样每次都过，
 * 而复制文档命令的人不会被挡在门外。真实后端请把这里换成真的校验。
 */
const assertAuthorized = (request: IncomingMessage): void => {
  const header = request.headers.authorization;
  if (header === undefined) return;
  if (typeof header !== 'string' || !/^Bearer .+/.test(header)) {
    throw new HttpError(401, `Authorization header must look like 'Bearer <token>'`);
  }
};

const readPositiveInt = (value: unknown, field: string, fallback: number): number => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `Field '${field}' must be a non-negative integer`);
  }
  return value;
};

/**
 * 读端点的响应：带 `ETag`，认得出 `If-None-Match` 就回 `304`。
 *
 * @remarks
 * `ETag` 取响应体本身的哈希（见 `http-utils.ts`）。内容变了哈希必变，因此
 * 协议里那条「内容一旦变化就不得再回 304」由构造保证，而不是靠小心翼翼地维护版本号。
 */
const sendConditional = (request: IncomingMessage, response: ServerResponse, payload: unknown): void => {
  const etag = computeEtag(JSON.stringify(payload));
  if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
    sendEmpty(response, 304, etag);
    return;
  }
  sendJson(response, 200, payload, etag);
};

/** `fetchMetadata`：按形态 A / 形态 B 分流。首页形状决定客户端锁定哪种模式。 */
const handleMetadata = async (
  request: IncomingMessage,
  response: ServerResponse,
  getStore: () => RxdbRecipeStore,
  state: DemoState,
  pageModeParam: string | null
): Promise<void> => {
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const limit = readPositiveInt(body['limit'], 'limit', 1000);
  // 请求体里带了 pageToken 就必然是形态 B——客户端已经锁定了模式，这里没有选择权。
  const tokenMode = body['pageToken'] !== undefined || pageModeParam === 'token' || state.pageMode === 'token';
  // 取句柄必须在 await 之后：读 body 让出的这段时间里，`__control/reset` 可能已经
  // 把 store 整个换掉，await 之前取到的那个句柄指向的实例已经不在了
  const store = getStore();

  if (!tokenMode) {
    const offset = readPositiveInt(body['offset'], 'offset', 0);
    sendConditional(request, response, await listMetadataByOffset(store, body['where'], limit, offset));
    return;
  }
  sendConditional(request, response, await listMetadataByToken(store, body['where'], limit, body['pageToken']));
};

/**
 * 一次写入**成功后**登记发起方 clientId，供事件桥回显。
 *
 * @remarks
 * 广播本身由 `rxdb.addEventListener` 在事务提交后驱动（`change-broadcaster.ts`）；
 * 这里只把「这次写是哪个 client 发的」记进事件桥的 FIFO，失败路径不会走到这里，
 * 因此不会泄漏 clientId 给下一条写。
 */
const recordWrite = (request: IncomingMessage, broadcaster: ChangeBroadcaster): void => {
  broadcaster.recordWrite(readClientId(request));
};

/**
 * 协议端点的分发（七个数据端点 + 可选的变更通知）。命中不了就是 404。
 *
 * @remarks
 * 拿到的是 `getStore` 闭包而不是句柄本身，且**每个分支各自在 await 之后现取**：
 * `f(getStore(), await readBody())` 是假的现取 —— 实参从左到右求值，`getStore()` 仍然跑在
 * await 之前。所以读 body 的那几支都先 `const body = await …` 再取句柄。
 */
const routeProtocol = async (
  request: IncomingMessage,
  response: ServerResponse,
  getStore: () => RxdbRecipeStore,
  state: DemoState,
  segments: string[],
  pageModeParam: string | null,
  subscribers: ChangeSubscribers,
  broadcaster: ChangeBroadcaster
): Promise<void> => {
  const method = request.method ?? 'GET';
  const route = `${method} ${segments.join('/')}`;

  if (route === `GET ${CHANGES_RESOURCE}`) {
    openChangeFeed(request, response, subscribers);
    return;
  }
  if (route === `GET meta/version`) {
    sendJson(response, 200, { version: BACKEND_VERSION });
    return;
  }
  if (route === `HEAD ${RECIPES_RESOURCE}`) {
    // pglite 在 `connect()` 的建表链路里建成 Recipe 表，恒存在——HEAD 恒 200
    // （与现行 node:sqlite「openDatabase 即建表」同一语义）。
    sendEmpty(response, 200);
    return;
  }
  if (route === `POST ${RECIPES_RESOURCE}/metadata`) {
    await handleMetadata(request, response, getStore, state, pageModeParam);
    return;
  }
  if (route === `POST ${RECIPES_RESOURCE}/by-ids`) {
    const body = await readJsonBody(request);
    sendConditional(request, response, await findByIds(getStore(), body));
    return;
  }
  if (route === `POST ${RECIPES_RESOURCE}/delete`) {
    const body = await readJsonBody(request);
    const deleted = await deleteRecipes(getStore(), body);
    recordWrite(request, broadcaster);
    sendJson(response, 200, { deleted });
    return;
  }
  if (route === `POST ${RECIPES_RESOURCE}`) {
    const body = await readJsonBody(request);
    const created = await createRecipe(getStore(), body);
    recordWrite(request, broadcaster);
    sendJson(response, 201, created);
    return;
  }
  if (method === 'PATCH' && segments.length === 2 && segments[0] === RECIPES_RESOURCE) {
    // segments 进 dispatch 时已经解过一次码，这里直接用。再解一次就不是「按标准解码」而是
    // 解两次：客户端编一次的 `%` 会先还原成 `%`、再被当成残缺转义序列抛 URIError。
    const body = await readJsonBody(request);
    const updated = await updateRecipe(getStore(), segments[1], body);
    recordWrite(request, broadcaster);
    sendJson(response, 200, updated);
    return;
  }

  throw new HttpError(404, `No route for ${method} ${BASE_PATH}/${segments.join('/')}`);
};

/**
 * 建服务器。
 *
 * @remarks
 * 阶段 B 起是**单库**：只有一份 RxDB pglite 数据目录，既是七个协议端点的数据面，
 * 也是 `__control/reset` / `clear` 操作的对象。`reset` 从「删 node:sqlite 文件重建」
 * 变为「销毁 RxDB 实例 → 删 `dataDir` → 重建 → 经引擎写种子」，事件桥在换实例后重新挂。
 *
 * store 句柄放在闭包的 `let`：`reseed` 会把它整个换掉，之后拿到的得是换过之后的那个。
 */
export const createDemoServer = async (options: DemoServerOptions): Promise<DemoServer> => {
  const subscribers = createChangeSubscribers();
  const broadcaster = createChangeBroadcaster(subscribers);

  let store = await createRxdbRecipeStore(options.dataDir);
  broadcaster.attach(store.rxdb);
  // 空库自动补一次种子：重启进程后 dataDir 仍在、数据不空，就不会重写。
  if (await isEmptyRxdbStore(store)) await seedRxdbStore(store, seedRows(SEED_ROW_COUNT));
  const state = createDemoState(options.exposeEtag);

  const actions: ControlActions = {
    reseed: async (): Promise<number> => {
      await store.destroy();
      deleteRxdbDataDir(options.dataDir);
      store = await createRxdbRecipeStore(options.dataDir);
      broadcaster.attach(store.rxdb);
      return seedRxdbStore(store, seedRows(SEED_ROW_COUNT));
    },
    clear: async (): Promise<number> => clearRxdbStore(store)
  };

  const server = createHttpServer((request, response) => {
    void dispatch(request, response, () => store, state, options.controlEnabled, actions, subscribers, broadcaster);
  });

  const close = async (): Promise<void> => {
    // 必须先掐订阅者：`server.close()` 等的是「所有连接都结束」，而 SSE 连接
    // 按定义永远不会自己结束，漏了这一行 close() 就是永久挂起。
    subscribers.closeAll();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await store.destroy();
  };

  return { server, state, close };
};

/** 一次请求的完整生命周期：记日志 → 控制端点 → 离线闸门 → 预检 → 故障注入 → 鉴权 → 路由。 */
const dispatch = async (
  request: IncomingMessage,
  response: ServerResponse,
  getStore: () => RxdbRecipeStore,
  state: DemoState,
  controlEnabled: boolean,
  actions: ControlActions,
  subscribers: ChangeSubscribers,
  broadcaster: ChangeBroadcaster
): Promise<void> => {
  const started = Date.now();
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const path = url.pathname;
  const method = request.method ?? 'GET';

  response.on('finish', () => {
    recordRequest(state, {
      method,
      path,
      status: response.statusCode,
      durationMs: Date.now() - started,
      notModified: response.statusCode === 304
    });
  });

  if (!path.startsWith(`${BASE_PATH}/`)) {
    applyCorsHeaders(request, response, state.exposeEtag);
    sendJson(response, 404, JSON_ERROR(404, `Unknown path '${path}'. Every endpoint lives under '${BASE_PATH}'.`));
    return;
  }

  applyCorsHeaders(request, response, state.exposeEtag);

  // 路径段在这里解一次码，之后全程按已解码处理——「解几次」必须在路由的入口一次说清，
  // 分散到各个分支里各解各的，就会出现同一个 id 在不同端点上指向不同的行。
  const segments = decodeSegments(path.slice(BASE_PATH.length + 1));
  if (segments === undefined) {
    // 畸形转义序列（`%zz`、末尾孤零零一个 `%`）会让 decodeURIComponent 抛 URIError。
    // 它在 runProtocol 的 try 之外，漏出去就是一条既没响应也没关闭的请求——挂死比 500 更难查。
    sendJson(response, 400, JSON_ERROR(400, `Path '${path}' contains a malformed percent-escape sequence`));
    return;
  }

  if (segments[0] === '__control') {
    await runControl(request, response, segments, state, controlEnabled, actions, broadcaster);
    return;
  }
  if (state.offline) {
    // 掐断 socket 而不是回 5xx：只有传输失败才会让客户端抛 NetworkOfflineError 并降级。
    recordRequest(state, { method, path, status: 0, durationMs: Date.now() - started, notModified: false });
    request.socket.destroy();
    return;
  }
  if (handlePreflight(request, response, state.exposeEtag)) return;

  await runProtocol(request, response, getStore, state, segments, url.searchParams.get('pageMode'), subscribers, broadcaster);
};

/**
 * 把 `BASE_PATH` 之后的路径拆成已解码的段。
 *
 * @param rest - 去掉 `BASE_PATH/` 前缀后的路径
 * @returns 已解码的非空段；任一段的转义序列畸形时为 `undefined`
 */
const decodeSegments = (rest: string): string[] | undefined => {
  try {
    return rest
      .split('/')
      .filter(Boolean)
      .map(segment => decodeURIComponent(segment));
  } catch {
    return undefined;
  }
};

const runControl = async (
  request: IncomingMessage,
  response: ServerResponse,
  segments: string[],
  state: DemoState,
  controlEnabled: boolean,
  actions: ControlActions,
  broadcaster: ChangeBroadcaster
): Promise<void> => {
  if (!controlEnabled) {
    sendJson(response, 404, JSON_ERROR(404, `Control endpoints are disabled when NODE_ENV=production`));
    return;
  }
  if (handlePreflight(request, response, state.exposeEtag)) return;

  try {
    const handled = await handleControlRequest(request, response, segments.slice(1), state, actions, () =>
      recordWrite(request, broadcaster)
    );
    if (!handled)
      sendJson(response, 404, JSON_ERROR(404, `No control route for ${request.method} ${segments.join('/')}`));
  } catch (error) {
    sendJson(response, statusOf(error), JSON_ERROR(statusOf(error), messageOf(error)));
  }
};

const runProtocol = async (
  request: IncomingMessage,
  response: ServerResponse,
  getStore: () => RxdbRecipeStore,
  state: DemoState,
  segments: string[],
  pageModeParam: string | null,
  subscribers: ChangeSubscribers,
  broadcaster: ChangeBroadcaster
): Promise<void> => {
  try {
    assertAuthorized(request);
    if (state.forcedStatus !== null) {
      // 注入的错误响应同样带着跨源头（上面已经加过）——否则浏览器把它变成 network error，
      // 客户端就会降级到本地缓存，把「非 2xx 不降级」这条对照实验做成假绿。
      throw new HttpError(state.forcedStatus, `Injected failure (__control/fault)`);
    }
    await routeProtocol(request, response, getStore, state, segments, pageModeParam, subscribers, broadcaster);
  } catch (error) {
    const status = statusOf(error);
    if (request.method === 'HEAD') {
      sendEmpty(response, status);
      return;
    }
    sendJson(response, status, JSON_ERROR(status, messageOf(error)));
  }
};
