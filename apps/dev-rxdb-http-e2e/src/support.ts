/**
 * e2e 公用工具：后端开关的类型化客户端 + 打开 demo 页面的固定流程。
 *
 * @remarks
 * 用例之间共享同一个后端进程，而 `__control/*` 改的是**进程级**状态
 * （离线、注入错误码、`Access-Control-Expose-Headers`、翻页形态）。
 * 因此每条用例都必须先 {@link resetDemo} 把这台机器恢复到已知起点——
 * 否则「上一条用例把 ETag 暴露关了」会以「本条用例的条件请求莫名不命中」的形式出现，
 * 而现场看起来与被测代码有关。
 */

import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { API_BASE_URL, APP_BASE_URL, appUrl } from './env';

/** 种子行数。后端 `config.ts` 的 `SEED_ROW_COUNT`。 */
export const SEED_ROW_COUNT = 250;

/** 列表默认页长。前端 `paging.ts` 的 `DEFAULT_PAGE_SIZE`。 */
export const DEFAULT_PAGE_SIZE = 50;

/** 页长选项里「全部」的取值。前端 `paging.ts` 的 `ALL_ROWS_LIMIT`，也是本地读的上限。 */
export const ALL_ROWS_LIMIT = 1000;

/** `__control/state` 的返回形状。 */
export interface ControlState {
  offline: boolean;
  forcedStatus: number | null;
  exposeEtag: boolean;
  pageMode: 'offset' | 'token';
}

/** `__control/log` 的一条记录。字段与协议流量面板一一对应。 */
export interface ServerLogEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  notModified: boolean;
}

const controlUrl = (path: string): string => `${API_BASE_URL}/__control/${path}`;

const postControl = async (request: APIRequestContext, path: string, data: unknown): Promise<ControlState> => {
  const response = await request.post(controlUrl(path), { data });
  expect(response.status(), `POST __control/${path}`).toBe(200);
  return (await response.json()) as ControlState;
};

/** 读后端当前状态。 */
export const readState = async (request: APIRequestContext): Promise<ControlState> => {
  const response = await request.get(controlUrl('state'));
  expect(response.status(), 'GET __control/state').toBe(200);
  return (await response.json()) as ControlState;
};

/** 读后端视角的请求日志。这是唯一能看见 `OPTIONS` 预检的地方——浏览器不把它暴露给 `fetch`。 */
export const readServerLog = async (request: APIRequestContext): Promise<ServerLogEntry[]> => {
  const response = await request.get(controlUrl('log'));
  expect(response.status(), 'GET __control/log').toBe(200);
  return (await response.json()) as ServerLogEntry[];
};

/** 清空后端日志。 */
export const clearServerLog = async (request: APIRequestContext): Promise<void> => {
  const response = await request.post(controlUrl('log/clear'), { data: {} });
  expect(response.status(), 'POST __control/log/clear').toBe(200);
};

/** 打开 / 关闭离线闸门。打开后所有协议请求被掐断 socket。 */
export const setOffline = (request: APIRequestContext, offline: boolean): Promise<ControlState> =>
  postControl(request, 'offline', { offline });

/** 注入（或取消）一个固定错误码。 */
export const setFault = (request: APIRequestContext, status: number | null): Promise<ControlState> =>
  postControl(request, 'fault', { status });

/** 开关 `Access-Control-Expose-Headers: ETag`。 */
export const setExposeEtag = (request: APIRequestContext, exposeEtag: boolean): Promise<ControlState> =>
  postControl(request, 'cors', { exposeEtag });

/** 切换默认翻页形态。 */
export const setPageMode = (request: APIRequestContext, mode: 'offset' | 'token'): Promise<ControlState> =>
  postControl(request, 'page-mode', { mode });

/** 删库重建 + 重写种子，返回写入行数。 */
export const resetBackendData = async (request: APIRequestContext): Promise<number> => {
  const response = await request.post(controlUrl('reset'), { data: {} });
  expect(response.status(), 'POST __control/reset').toBe(200);
  return ((await response.json()) as { rows: number }).rows;
};

/** 清空所有数据但保留表结构，返回删除行数。 */
export const clearBackendData = async (request: APIRequestContext): Promise<number> => {
  const response = await request.post(controlUrl('clear'), { data: {} });
  expect(response.status(), 'POST __control/clear').toBe(200);
  return ((await response.json()) as { deleted: number }).deleted;
};

/**
 * 把后端恢复到已知起点：开关全默认、数据回到种子、日志清空。
 *
 * @remarks
 * 顺序有讲究：**离线开关必须最先关掉**。它开着的时候虽然 `__control/*` 仍然可达
 * （闸门在控制路由之后），但让后面几步在「协议全断」的状态下跑毫无意义。
 * 日志放在最后清，这样 reset 自己产生的那几条不会混进用例要断言的日志里。
 */
export const resetDemo = async (request: APIRequestContext): Promise<void> => {
  await setOffline(request, false);
  await setFault(request, null);
  await setExposeEtag(request, true);
  await setPageMode(request, 'offset');
  await resetBackendData(request);
  await clearServerLog(request);
};

/**
 * 清掉前端这一源的全部浏览器存储（含 OPFS）。
 *
 * @remarks
 * 走 CDP 而不是在页面里 `navigator.storage.getDirectory()` 逐个 `removeEntry`：
 * 后者要求页面已经加载，而页面一加载 wa-sqlite 的 worker 立刻抓住库文件的
 * sync access handle，此时删除会抛 `NoModificationAllowedError`——清理反而变成了
 * 一个偶发失败源。`Storage.clearDataForOrigin` 在导航之前执行，没有这个竞争。
 *
 * `file_systems` 就是 OPFS 在 CDP 里的名字。
 */
export const clearOriginStorage = async (page: Page): Promise<void> => {
  const session = await page.context().newCDPSession(page);
  await session.send('Storage.clearDataForOrigin', {
    origin: APP_BASE_URL,
    storageTypes: 'file_systems,indexeddb,cache_storage,local_storage'
  });
  await session.detach();
};

/**
 * 打开 demo 页面：先清干净本地存储，再带着 `?api=` 指向 e2e 的后端。
 *
 * @param extraQuery - 追加的查询串（不含前导 `&`）。
 */
export const openDemo = async (page: Page, extraQuery: string = ''): Promise<void> => {
  await clearOriginStorage(page);
  await page.goto(appUrl(extraQuery), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('feed-status')).toHaveText(/已接通|已断开/);
};

/** 等列表稳定在指定行数。 */
export const expectRowCount = async (page: Page, rows: number, timeout: number = 60_000): Promise<void> => {
  await expect(page.getByTestId('row-count')).toHaveText(`${rows} 行`, { timeout });
};

/** `row-count` 上的总行数（整个筛选集合，不是这一页）。 */
export const readTotalRowCount = async (page: Page): Promise<number> => {
  const text = (await page.getByTestId('row-count').textContent()) ?? '';
  const total = Number.parseInt(text, 10);
  expect(Number.isNaN(total), `row-count 读出来不是个数字：${text}`).toBe(false);
  return total;
};

/**
 * 切页长。
 *
 * @remarks
 * 只等到选中态生效为止——行是后到的，要断言行请接着用 {@link expectRowIds}。
 */
export const setPageSize = async (page: Page, pageSize: number): Promise<void> => {
  await page.getByTestId('page-size').selectOption(String(pageSize));
  await expect(page.getByTestId('page-size')).toHaveValue(String(pageSize));
};

/**
 * 把页长切到「全部」，让 {@link readRowIds} 读得到整个结果集。
 *
 * @remarks
 * 列表默认每页 50 行。凡是要断言**全量** id 的用例（跨页去重、孤儿清理）都得先调这个，
 * 否则读到的只是第一页——那种失败看起来像「行丢了」，其实只是没翻到。
 *
 * 「全部」的取值就是本地读的上限 `ALL_ROWS_LIMIT`（1000），高于种子的 250 行，
 * 所以切过去之后一页装得下整份数据。
 *
 * 最后那句等待不能省，也不能换成等 `page-info` 的页码：页码是信号直接算出来的，
 * 切完页长立刻就是「第 1 / 1 页」，而行要等本地读回来才换。只等页码就会读到上一页的 50 行，
 * 失败现场看起来像「行丢了」，其实是断言跑在了重查前面。
 */
export const showAllRows = async (page: Page): Promise<void> => {
  const total = await readTotalRowCount(page);
  await setPageSize(page, ALL_ROWS_LIMIT);
  await expect(page.getByTestId('page-info')).toContainText('第 1 / 1 页');
  await expect(page.locator('[data-row-id]')).toHaveCount(total);
};

/**
 * 等列表铺出来的行**正好**是这一串 id（含顺序）。
 *
 * @remarks
 * 翻页与切页长都是异步重查：页码文案先变、行后到。断言必须落在行本身上且可重试，
 * 所以这里用 `expect.poll` 而不是读一次 {@link readRowIds} 就比。
 */
export const expectRowIds = async (page: Page, expected: readonly string[]): Promise<void> => {
  await expect.poll(() => readRowIds(page), { timeout: 30_000 }).toEqual([...expected]);
};

/** 当前列表里所有行的 id，按渲染顺序。 */
export const readRowIds = (page: Page): Promise<string[]> =>
  page.locator('[data-row-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-row-id') ?? ''));

/** 后端日志里命中某个方法 + 路径后缀的条目。 */
export const logEntriesFor = (log: readonly ServerLogEntry[], method: string, suffix: string): ServerLogEntry[] =>
  log.filter(entry => entry.method === method && entry.path.endsWith(suffix));
