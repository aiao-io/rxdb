/**
 * 参考后端的路由层。
 *
 * @remarks
 * 七个协议端点 + 一组 `__control` 开关，全部跑在 `node:http` 上，零第三方依赖。
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
import type { DatabaseSync } from 'node:sqlite';

import { BACKEND_VERSION, BASE_PATH, RECIPES_RESOURCE, SEED_ROW_COUNT } from './config.ts';
import type { ControlActions, DemoState } from './control.ts';
import { createDemoState, handleControlRequest, recordRequest } from './control.ts';
import { applyCorsHeaders, handlePreflight } from './cors.ts';
import { openDatabase } from './db.ts';
import { computeEtag, HttpError, matchesIfNoneMatch, readJsonBody, sendEmpty, sendJson } from './http-utils.ts';
import {
  createRecipe,
  deleteAllRecipes,
  deleteRecipes,
  findByIds,
  listMetadataByOffset,
  listMetadataByToken,
  recipesTableExists,
  updateRecipe
} from './recipes-store.ts';
import { resetDatabase, seedDatabase } from './seed.ts';

/** 建服务器需要的一切。全部显式传入——没有隐式读 `process.env` 的角落，e2e 才好摆布。 */
export interface DemoServerOptions {
  databasePath: string;
  exposeEtag: boolean;
  controlEnabled: boolean;
}

/** 已建好但尚未 `listen` 的服务器及其可变状态。 */
export interface DemoServer {
  server: Server;
  state: DemoState;
  /** 关连接 + 关库。测试里必须调用，否则 SQLite 句柄会拖住进程。 */
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
  db: DatabaseSync,
  state: DemoState,
  pageModeParam: string | null
): Promise<void> => {
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const limit = readPositiveInt(body['limit'], 'limit', 1000);
  // 请求体里带了 pageToken 就必然是形态 B——客户端已经锁定了模式，这里没有选择权。
  const tokenMode = body['pageToken'] !== undefined || pageModeParam === 'token' || state.pageMode === 'token';

  if (!tokenMode) {
    const offset = readPositiveInt(body['offset'], 'offset', 0);
    sendConditional(request, response, listMetadataByOffset(db, body['where'], limit, offset));
    return;
  }
  sendConditional(request, response, listMetadataByToken(db, body['where'], limit, body['pageToken']));
};

/** 协议七端点的分发。命中不了就是 404。 */
const routeProtocol = async (
  request: IncomingMessage,
  response: ServerResponse,
  db: DatabaseSync,
  state: DemoState,
  segments: string[],
  pageModeParam: string | null
): Promise<void> => {
  const method = request.method ?? 'GET';
  const route = `${method} ${segments.join('/')}`;

  if (route === `GET meta/version`) {
    sendJson(response, 200, { version: BACKEND_VERSION });
    return;
  }
  if (route === `HEAD ${RECIPES_RESOURCE}`) {
    sendEmpty(response, recipesTableExists(db) ? 200 : 404);
    return;
  }
  if (route === `POST ${RECIPES_RESOURCE}/metadata`) {
    await handleMetadata(request, response, db, state, pageModeParam);
    return;
  }
  if (route === `POST ${RECIPES_RESOURCE}/by-ids`) {
    sendConditional(request, response, findByIds(db, await readJsonBody(request)));
    return;
  }
  if (route === `POST ${RECIPES_RESOURCE}/delete`) {
    sendJson(response, 200, { deleted: deleteRecipes(db, await readJsonBody(request)) });
    return;
  }
  if (route === `POST ${RECIPES_RESOURCE}`) {
    sendJson(response, 201, createRecipe(db, await readJsonBody(request)));
    return;
  }
  if (method === 'PATCH' && segments.length === 2 && segments[0] === RECIPES_RESOURCE) {
    // id 可能被客户端 encodeURIComponent 过，按标准解码——协议「通用约定」的最后一条。
    sendJson(response, 200, updateRecipe(db, decodeURIComponent(segments[1]), await readJsonBody(request)));
    return;
  }

  throw new HttpError(404, `No route for ${method} ${BASE_PATH}/${segments.join('/')}`);
};

/**
 * 建服务器。
 *
 * @remarks
 * 库连接放在闭包里的 `let`，因为 `__control/reset` 会**删掉文件重建**（AC#6），
 * 旧句柄指向的 inode 已经不在了，必须整个换掉。
 */
export const createDemoServer = (options: DemoServerOptions): DemoServer => {
  let db = openDatabase(options.databasePath);
  const state = createDemoState(options.exposeEtag);

  // 两个都必须闭包读那个 `let db`：`reseed` 会把句柄整个换掉，`clear` 之后拿到的
  // 得是换过之后的那一个。
  const actions: ControlActions = {
    reseed: (): number => {
      db.close();
      db = resetDatabase(options.databasePath);
      return seedDatabase(db, SEED_ROW_COUNT);
    },
    clear: (): number => deleteAllRecipes(db)
  };

  const server = createHttpServer((request, response) => {
    void dispatch(request, response, () => db, state, options.controlEnabled, actions);
  });

  const close = async (): Promise<void> => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  };

  return { server, state, close };
};

/** 一次请求的完整生命周期：记日志 → 控制端点 → 离线闸门 → 预检 → 故障注入 → 鉴权 → 路由。 */
const dispatch = async (
  request: IncomingMessage,
  response: ServerResponse,
  getDb: () => DatabaseSync,
  state: DemoState,
  controlEnabled: boolean,
  actions: ControlActions
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

  const segments = path
    .slice(BASE_PATH.length + 1)
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
  applyCorsHeaders(request, response, state.exposeEtag);

  if (segments[0] === '__control') {
    await runControl(request, response, segments, state, controlEnabled, actions);
    return;
  }
  if (state.offline) {
    // 掐断 socket 而不是回 5xx：只有传输失败才会让客户端抛 NetworkOfflineError 并降级。
    recordRequest(state, { method, path, status: 0, durationMs: Date.now() - started, notModified: false });
    request.socket.destroy();
    return;
  }
  if (handlePreflight(request, response, state.exposeEtag)) return;

  await runProtocol(request, response, getDb(), state, segments, url.searchParams.get('pageMode'));
};

const runControl = async (
  request: IncomingMessage,
  response: ServerResponse,
  segments: string[],
  state: DemoState,
  controlEnabled: boolean,
  actions: ControlActions
): Promise<void> => {
  if (!controlEnabled) {
    sendJson(response, 404, JSON_ERROR(404, `Control endpoints are disabled when NODE_ENV=production`));
    return;
  }
  if (handlePreflight(request, response, state.exposeEtag)) return;

  try {
    const handled = await handleControlRequest(request, response, segments.slice(1), state, actions);
    if (!handled)
      sendJson(response, 404, JSON_ERROR(404, `No control route for ${request.method} ${segments.join('/')}`));
  } catch (error) {
    sendJson(response, statusOf(error), JSON_ERROR(statusOf(error), messageOf(error)));
  }
};

const runProtocol = async (
  request: IncomingMessage,
  response: ServerResponse,
  db: DatabaseSync,
  state: DemoState,
  segments: string[],
  pageModeParam: string | null
): Promise<void> => {
  try {
    assertAuthorized(request);
    if (state.forcedStatus !== null) {
      // 注入的错误响应同样带着跨源头（上面已经加过）——否则浏览器把它变成 network error，
      // 客户端就会降级到本地缓存，把「非 2xx 不降级」这条对照实验做成假绿。
      throw new HttpError(state.forcedStatus, `Injected failure (__control/fault)`);
    }
    await routeProtocol(request, response, db, state, segments, pageModeParam);
  } catch (error) {
    const status = statusOf(error);
    if (request.method === 'HEAD') {
      sendEmpty(response, status);
      return;
    }
    sendJson(response, status, JSON_ERROR(status, messageOf(error)));
  }
};
