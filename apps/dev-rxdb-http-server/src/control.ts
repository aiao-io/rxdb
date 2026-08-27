/**
 * `__control/*`：demo 专用的运行期开关与请求日志。
 *
 * @remarks
 * 这些端点**显式不属于 `http-protocol.md`**。双下划线前缀就是这个意思：
 * 照着协议实现自己后端的人一眼能看出这一段不用抄。它们只在 `NODE_ENV !== 'production'`
 * 时注册（见 `config.ts` 的 `resolveControlEnabled`）。
 *
 * 存在的理由是「有些现象只能从服务端观测」：
 *
 * - **预检**（AC#9）：`OPTIONS` 不会出现在 `fetch` 的可观测面上，浏览器自己发、自己收。
 *   要断言它确实发生过，只能问后端——于是有了 {@link DemoState} 里的请求日志。
 * - **离线**（AC#13）：真正的断网无法在测试里制造，用「服务端掐断 socket」等价替代——
 *   客户端侧同样是 `fetch` reject，同样翻译成 `NetworkOfflineError`。
 * - **ETag 暴露**（AC#10 / AC#11）：这对反例要求同一个后端能在两种 CORS 配置间来回切。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import { HttpError, readJsonBody, sendJson } from './http-utils.ts';

/** 翻页形态。协议的形态 A / 形态 B。 */
export type PageMode = 'offset' | 'token';

/** 一条请求日志。字段与 AC#8 的协议流量面板一一对应。 */
export interface RequestLogEntry {
  method: string;
  path: string;
  /** 被离线开关掐断的请求记 `0`——它根本没有状态码。 */
  status: number;
  durationMs: number;
  notModified: boolean;
}

/** 后端的全部可变状态。除此之外后端是无状态的（数据在 SQLite 里）。 */
export interface DemoState {
  /** 打开后所有协议请求被掐断 socket，客户端侧表现为网络失败。 */
  offline: boolean;
  /** 非空时所有协议请求直接回这个状态码。AC#13 的对照实验用 `409`。 */
  forcedStatus: number | null;
  /** 是否回 `Access-Control-Expose-Headers: ETag`。 */
  exposeEtag: boolean;
  /** `fetchMetadata` 的默认翻页形态，可被 `?pageMode=` 覆盖。 */
  pageMode: PageMode;
  /** 请求日志，环形截断到 {@link LOG_CAPACITY} 条。 */
  log: RequestLogEntry[];
}

/**
 * 由 server 注入的数据操作。
 *
 * @remarks
 * 控制模块自己**不碰文件系统、不写 SQL**：它只知道「有这么两件事可以做」。
 * 库句柄会被 {@link ControlActions.reseed} 换掉（删文件重建），闭包由 server 持有，
 * 这一层拿到的永远是当前那一个。
 */
export interface ControlActions {
  /** 删库重建 + 写种子，返回写入行数。 */
  reseed: () => number;
  /** 清空数据但保留表结构，返回删除行数。 */
  clear: () => number;
}

/** 日志容量。够放下一次全量翻页（6 次）加上前后若干次操作，又不会无限涨。 */
const LOG_CAPACITY = 200;

/** 建一份初始状态。`exposeEtag` 的默认值由环境决定（demo 默认开，AC#11）。 */
export const createDemoState = (exposeEtag: boolean): DemoState => ({
  offline: false,
  forcedStatus: null,
  exposeEtag,
  pageMode: 'offset',
  log: []
});

/** 追加一条日志，超出容量时丢最旧的。 */
export const recordRequest = (state: DemoState, entry: RequestLogEntry): void => {
  state.log.push(entry);
  if (state.log.length > LOG_CAPACITY) state.log.splice(0, state.log.length - LOG_CAPACITY);
};

const readBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') throw new HttpError(400, `Field '${field}' must be a boolean`);
  return value;
};

const readForcedStatus = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 400 || value > 599) {
    throw new HttpError(400, `Field 'status' must be null or an integer in [400, 599]`);
  }
  return value;
};

const readPageMode = (value: unknown): PageMode => {
  if (value !== 'offset' && value !== 'token') throw new HttpError(400, `Field 'mode' must be 'offset' or 'token'`);
  return value;
};

/** 对外可见的状态快照（不含日志，日志走单独端点，避免每次切换都拖一大坨）。 */
const stateSnapshot = (state: DemoState): Record<string, unknown> => ({
  offline: state.offline,
  forcedStatus: state.forcedStatus,
  exposeEtag: state.exposeEtag,
  pageMode: state.pageMode
});

/**
 * 路由 `__control/*`。
 *
 * @param segments - `__control` 之后的路径片段。
 * @param actions - 由 server 注入的数据操作，见 {@link ControlActions}。
 * @returns 是否命中了某条控制路由。
 */
export const handleControlRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  segments: string[],
  state: DemoState,
  actions: ControlActions
): Promise<boolean> => {
  const route = `${request.method ?? 'GET'} ${segments.join('/')}`;

  if (route === 'GET state') {
    sendJson(response, 200, stateSnapshot(state));
    return true;
  }
  if (route === 'GET log') {
    sendJson(response, 200, state.log);
    return true;
  }
  if (route === 'POST log/clear') {
    state.log.length = 0;
    sendJson(response, 200, { cleared: true });
    return true;
  }
  if (route === 'POST reset') {
    sendJson(response, 200, { rows: actions.reseed() });
    return true;
  }
  if (route === 'POST clear') {
    sendJson(response, 200, { deleted: actions.clear() });
    return true;
  }

  if (route === 'POST offline') return await applyOffline(request, response, state);
  if (route === 'POST fault') return await applyFault(request, response, state);
  if (route === 'POST cors') return await applyCorsToggle(request, response, state);
  if (route === 'POST page-mode') return await applyPageMode(request, response, state);

  return false;
};

const applyOffline = async (request: IncomingMessage, response: ServerResponse, state: DemoState): Promise<boolean> => {
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  state.offline = readBoolean(body['offline'], 'offline');
  sendJson(response, 200, stateSnapshot(state));
  return true;
};

const applyFault = async (request: IncomingMessage, response: ServerResponse, state: DemoState): Promise<boolean> => {
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  state.forcedStatus = readForcedStatus(body['status']);
  sendJson(response, 200, stateSnapshot(state));
  return true;
};

const applyCorsToggle = async (
  request: IncomingMessage,
  response: ServerResponse,
  state: DemoState
): Promise<boolean> => {
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  state.exposeEtag = readBoolean(body['exposeEtag'], 'exposeEtag');
  sendJson(response, 200, stateSnapshot(state));
  return true;
};

const applyPageMode = async (
  request: IncomingMessage,
  response: ServerResponse,
  state: DemoState
): Promise<boolean> => {
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  state.pageMode = readPageMode(body['mode']);
  sendJson(response, 200, stateSnapshot(state));
  return true;
};
