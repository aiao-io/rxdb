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
 * `?api=` 允许的协议。
 *
 * @remarks
 * 留着 `https:` 是因为回环上跑自签名 TLS 是个正当的调试场景；`file:` / `data:` /
 * `javascript:` 一概挡掉——它们里没有一个能是「后端地址」。
 */
const ALLOWED_API_PROTOCOLS = ['http:', 'https:'] as const;

/**
 * `?api=` 允许的主机。
 *
 * @remarks
 * IPv6 写成 `[::1]` 而不是 `::1`：`URL` 的 `hostname` 对 IPv6 字面量保留方括号，
 * 拿 `::1` 去比永远不相等。
 */
const ALLOWED_API_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]'] as const;

/** `?api=` 不合法时统一从这里抛。 */
const rejectApiUrl = (raw: string): never => {
  throw new Error(
    `?api= 只接受指向回环地址的 http(s) URL（${ALLOWED_API_HOSTNAMES.join(' / ')}），收到 ${JSON.stringify(raw)}`
  );
};

/**
 * 解析后端地址。
 *
 * @param search - `location.search`
 * @returns `?api=` 指定的地址，缺省为 {@link DEFAULT_API_BASE_URL}
 * @throws 当 `?api=` 不是指向回环地址的 http(s) URL 时
 *
 * @remarks
 * 走查询串而不是 `import.meta.env`：生产构建会把 `import.meta.env` 定死成不含 `VITE_*`
 * 的常量（见 `project.json` 的 `build.configurations.production.define`），
 * 而 e2e 跑的正是构建产物。运行期读 URL 是唯一在两种形态下都成立的办法。
 *
 * 末尾斜杠会被去掉：适配器把 `baseUrl` 与相对路径直接拼接，
 * `.../v1/` + `recipes/metadata` 会得到 `//recipes/metadata`，路由匹配不上。
 *
 * **为什么要限制主机**：这个值是页面上每一个 `fetch` 的目标前缀，而它整个由 URL 决定
 * （CodeQL `js/client-side-request-forgery`）。不限制的话，一条
 * `?api=https://evil.example.com/v1` 的链接就能让打开它的人用自己的浏览器
 * 把本地数据打去别人家的服务器。这个 demo 的真实用法从来只在回环上——README 的例子是
 * `127.0.0.1:9999`，e2e 是 `127.0.0.1:8317`——收紧到回环不损失任何已文档化的能力。
 *
 * **为什么是抛而不是退回默认值**：默认值静默生效，等于把「地址打错了」变成
 * 「后端连得上但数据不对」，那是最难自己想明白的一类现象。
 *
 * **为什么重新拼装而不是把 `raw` 原样返回**：协议与主机取的是上面两张常量表里**匹配到的
 * 那一项**，不是输入里的那一段。这样返回值的源头部分逐字节来自常量，
 * 「校验过了但流出去的仍是原始输入」这条经典缺口就不存在。查询串与 hash 一并丢掉：
 * 它们不属于 baseUrl，留着只会被适配器拼进路径里。
 */
export const resolveApiBaseUrl = (search: string): string => {
  const raw = new URLSearchParams(search).get('api');
  if (raw === null || raw === '') return DEFAULT_API_BASE_URL;

  const url = parseUrl(raw);
  const protocol = ALLOWED_API_PROTOCOLS.find(item => item === url?.protocol);
  const hostname = ALLOWED_API_HOSTNAMES.find(item => item === url?.hostname);
  if (url === undefined || protocol === undefined || hostname === undefined) return rejectApiUrl(raw);

  const port = url.port === '' ? '' : `:${url.port}`;
  return `${protocol}//${hostname}${port}${url.pathname}`.replace(/\/+$/, '');
};

/** `new URL()` 的非抛版本。解析不出来的输入与「解析出来但不合法」走同一条拒绝路径。 */
const parseUrl = (raw: string): URL | undefined => {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
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

/** 变更通知端点，相对 {@link resolveApiBaseUrl}。与后端 `CHANGES_RESOURCE` 同名。 */
export const CHANGE_FEED_PATH = 'changes';

/** 写入请求上标记「谁改的」的头。与后端 `CLIENT_ID_HEADER` 同名。 */
export const CLIENT_ID_HEADER = 'x-client-id';

/**
 * 变更通知通道的**初始**状态（US-023 D11 / AC#21）。
 *
 * @param search - `location.search`
 * @returns `?changefeed=0` 时为 `false`，其余一律 `true`
 *
 * @remarks
 * **默认开着**——实时同步是这个 demo 想展示的东西，让它躲在一个查询串后面，
 * 直接的后果就是「两个窗口，一个改了另一个没反应」被当成 bug 报上来。
 *
 * 与 `?diagnostics=1` 的默认关**不是**同一件事，两者的判据也刚好相反：那个开关保的是
 * 「没配回调时适配器保持沉默」这一条默认行为本身要能演示，所以缺省必须是关；
 * 而通道的缺省是产品行为，不是被守护的默认值。
 *
 * 判据写成 `!== '0'` 而不是 `=== '1'`：这个函数只决定**开页那一刻**的状态，
 * 通道随后归页面上的开关管（`RxDBAdapterHttp.startChangeFeed()` / `stopChangeFeed()`）。
 * 一个只用来关掉它的参数，语义上是「例外」而不是「取值」，`=== '1'` 会让
 * `?changefeed=true` 这种手敲出来的写法静默关掉通道。
 *
 * 关着时的现象（另一个页面**不会**自动更新）是这个故事当初要修的症状，
 * 已经冻成对照用例（AC#23）：同样的操作、同样的两个页面，只差这一个参数。
 */
export const resolveChangeFeedEnabled = (search: string): boolean =>
  new URLSearchParams(search).get('changefeed') !== '0';

/** `__control/*` 的地址前缀，由 {@link resolveApiBaseUrl} 的结果派生。 */
export const controlUrl = (baseUrl: string, path: string): string => `${baseUrl}/__control/${path}`;
