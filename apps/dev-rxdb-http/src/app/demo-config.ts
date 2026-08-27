/**
 * demo 的固定参数与运行期可覆写的后端地址。
 *
 * @remarks
 * 这里的数值不是调参偏好，是这个 demo 能不能证明东西的分水岭——见每一项的注释。
 */

/** 参考后端的默认地址。前端 4300 / 后端 4301，**故意不同源**。 */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4301/v1';

/**
 * 单页条数。
 *
 * @remarks
 * 适配器默认 `1000`，而种子只有 250 行——用默认值的话一次请求就拉完了，
 * 翻页代码一行都不会执行，AC#4 那条「短页只出现在末页」就成了没验过的空话。
 * 取 50 才能让 250 行真的翻 5 页。
 */
export const PAGE_SIZE = 50;

/**
 * `findByIds` 单块 id 数。
 *
 * @remarks
 * 同理：默认 `100` 时 250 行只切成 3 块，而首屏冷启动只需拉 50 行的完整数据——
 * 一块就装下了，分块逻辑照样不执行。取 20 让每屏都真的切成 3 块。
 */
export const ID_CHUNK_SIZE = 20;

/** auth hook 注入的固定假 token。真实身份认证是另一件事，不在本 demo 范围内。 */
export const DEMO_TOKEN = 'demo-token';

/**
 * 解析后端地址。
 *
 * @param search - `location.search`
 * @returns `?api=` 指定的地址，缺省为 {@link DEFAULT_API_BASE_URL}
 *
 * @remarks
 * 走查询串而不是 `import.meta.env`：生产构建会把 `import.meta.env` 定死成不含 `VITE_*`
 * 的常量（见 `project.json` 的 `build.configurations.production.define`），
 * 而 e2e 跑的正是构建产物。运行期读 URL 是唯一在两种形态下都成立的办法。
 *
 * 末尾斜杠会被去掉：适配器把 `baseUrl` 与相对路径直接拼接，
 * `.../v1/` + `recipes/metadata` 会得到 `//recipes/metadata`，路由匹配不上。
 */
export const resolveApiBaseUrl = (search: string): string => {
  const raw = new URLSearchParams(search).get('api');
  const value = raw === null || raw === '' ? DEFAULT_API_BASE_URL : raw;
  return value.replace(/\/+$/, '');
};

/**
 * 是否装上 ETag 诊断回调（US-215 AC#8）。
 *
 * @param search - `location.search`
 * @returns `?diagnostics=1` 时为 `true`，缺省 `false`
 *
 * @remarks
 * **默认关着，是为了让两种行为都还能演示。** 适配器对「读不到 ETag」的默认反应就是
 * 沉默（AC#3：没配回调时不打印任何东西），而 e2e 里已有一条用例守着
 * 「跨源查询期间 console 不出任何错误」。把回调无条件装上，那条用例守的就不再是
 * 「默认行为」了。开关让同一个构建产物既能证明默认沉默、又能证明配上之后信号真的到得了。
 */
export const resolveDiagnosticsEnabled = (search: string): boolean =>
  new URLSearchParams(search).get('diagnostics') === '1';

/** `__control/*` 的地址前缀，由 {@link resolveApiBaseUrl} 的结果派生。 */
export const controlUrl = (baseUrl: string, path: string): string => `${baseUrl}/__control/${path}`;
