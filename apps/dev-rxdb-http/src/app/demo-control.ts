/**
 * `__control/*` 的客户端。
 *
 * @remarks
 * 这些端点只在参考后端里存在，且只在 `NODE_ENV !== 'production'` 时注册。
 * 它们不是协议的一部分——双下划线前缀就是为了让人一眼看出「这条路径不在
 * `http-protocol.md` 里」。前端把它们收在这一个文件里，同一个理由：
 * 别让演示开关的调用散进业务代码，看起来像适配器支持的功能。
 *
 * 这里用**裸 `fetch`**，且请求会被流量面板的默认判据滤掉（URL 含 `/__control/`）：
 * 面板要展示的是协议流量，混进开关请求会让「一次列表刷新发了几个请求」这件事失真。
 */

import { CLIENT_ID_HEADER, controlUrl } from './demo-config';

/** 后端当前状态。与后端 `stateSnapshot()` 的返回一一对应。 */
export interface DemoControlState {
  readonly offline: boolean;
  readonly forcedStatus: number | null;
  readonly exposeEtag: boolean;
  readonly pageMode: 'offset' | 'token';
}

/** 后端记的一条请求日志。 */
export interface DemoRequestLogEntry {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly notModified: boolean;
}

const request = async <T>(baseUrl: string, path: string, body?: unknown, clientId?: string): Promise<T> => {
  const response = await fetch(controlUrl(baseUrl, path), {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json', ...clientIdHeader(clientId) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`__control/${path} 返回 ${response.status}`);
  }
  return (await response.json()) as T;
};

/** 读当前状态。 */
export const readControlState = (baseUrl: string): Promise<DemoControlState> =>
  request<DemoControlState>(baseUrl, 'state');

/** 读后端侧的请求日志（含浏览器发的 `OPTIONS` 预检——那个在 `fetch` 上看不见）。 */
export const readRequestLog = (baseUrl: string): Promise<readonly DemoRequestLogEntry[]> =>
  request<readonly DemoRequestLogEntry[]>(baseUrl, 'log');

/** 清空后端日志。 */
export const clearRequestLog = (baseUrl: string): Promise<unknown> => request(baseUrl, 'log/clear', {});

/**
 * 谁发起的这次数据变更。
 *
 * @param clientId - 本机 `rxdb.context.clientId`，没有就不带这个头
 *
 * @remarks
 * 只有改数据的那两个端点用得上：后端会把它回显进广播，发起方收到自己的回声即丢弃（D6）。
 *
 * 这里**不**像写入路径那样再判一次通道开关。写入路径判它，是因为 AC#21 要求关掉通道时
 * 协议流量逐字回到没有通道的样子；而 `__control/*` 压根不在协议里、也被流量面板滤掉，
 * 这个头唯一的作用是让**发起方自己**认得出回声。通道关着时它不影响任何人。
 */
const clientIdHeader = (clientId?: string): Record<string, string> =>
  clientId === undefined ? {} : { [CLIENT_ID_HEADER]: clientId };

/**
 * 把数据库重置回种子状态（250 行，逐字节可复现）。
 *
 * @param clientId - 见 {@link clientIdHeader}
 */
export const resetDatabase = (baseUrl: string, clientId?: string): Promise<unknown> =>
  request(baseUrl, 'reset', {}, clientId);

/**
 * 清空所有数据，但**保留表结构**。
 *
 * @remarks
 * 与 {@link resetDatabase} 的区别在后端一侧（`recipes-store.ts` 的 `deleteAllRecipes`）：
 * 重置删库文件重建，清空只删行。表还在，`HEAD :entity` 就继续回 200，客户端看到的是
 * 「这张表存在，只是一行都不匹配」——QueryCache 的孤儿清理要的正是这一种，
 * 它会把本地行缓存里那 250 行全部删掉。这是这个按钮真正想演示的东西。
 *
 * @param clientId - 见 {@link clientIdHeader}
 */
export const clearDatabase = (baseUrl: string, clientId?: string): Promise<unknown> =>
  request(baseUrl, 'clear', {}, clientId);

/** 离线开关：打开后后端直接掐断连接，浏览器侧表现为传输失败。 */
export const setOffline = (baseUrl: string, offline: boolean): Promise<DemoControlState> =>
  request<DemoControlState>(baseUrl, 'offline', { offline });

/** 注入一个固定状态码（400–599），`null` 取消。用来对照「传输失败」与「HTTP 错误」两种情形。 */
export const setForcedStatus = (baseUrl: string, status: number | null): Promise<DemoControlState> =>
  request<DemoControlState>(baseUrl, 'fault', { status });

/** 开关 `Access-Control-Expose-Headers: ETag`。关掉后浏览器就读不到 ETag，条件请求全程不命中。 */
export const setExposeEtag = (baseUrl: string, exposeEtag: boolean): Promise<DemoControlState> =>
  request<DemoControlState>(baseUrl, 'cors', { exposeEtag });

/**
 * 切换服务端默认翻页形态。
 *
 * @remarks
 * 为什么是服务端开关而不是前端参数：`?pageMode=token` 走不进 `createRestHandlers()` 的模板——
 * 模板在构造期就用 `UNSAFE_IN_SEGMENT` 把 `?` 挡掉了，查询串根本表达不出来。
 * 后端因此同时认两种输入：curl / e2e 直接带 `?pageMode=token`，
 * 页面上的开关走这条，改的是后端的默认值，前端一行适配器配置都不用动。
 */
export const setPageMode = (baseUrl: string, mode: 'offset' | 'token'): Promise<DemoControlState> =>
  request<DemoControlState>(baseUrl, 'page-mode', { mode });
