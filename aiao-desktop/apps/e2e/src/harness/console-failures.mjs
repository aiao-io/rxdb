/**
 * 控制台里的「资源加载失败」分类（D-04）。冒烟拦截全部外网请求，外网内容加载失败时控制台会报错，这是预期内的噪音；
 * 但桌面自己来源的资源（图标、字体、wasm、chunk）加载失败是真问题，不能因为文字相似就一起吞掉。
 * 所以只有**能确认是外部来源**的加载失败才忽略，来源按下面的顺序查：
 *
 * 1. `Failed to load resource…`（Chromium 与 WebKit 的网络层日志）：Playwright 的 `location().url` 就是失败资源的地址；
 * 2. 其他措辞里自带地址的（Firefox `Cross-Origin Request Blocked … at <地址>`、WebKit `… cannot load <地址> due to access control checks`）：
 *    取文字里的地址。这类消息的 `location()` 是空的，或指向发起请求的脚本，不能用；
 * 3. 完全无法归属来源的（Firefox `NetworkError when attempting to fetch resource.`、WebKit `Load failed`，多是应用自己
 *    catch 住后 `console.error` 的，`location()` 只是应用代码的位置）：Chromium 不会产生这类消息，出现了就是应用自己报的错，不忽略；
 *    Firefox 与 WebKit 只在 D-19 之下作为可选诊断运行，保留现有的忽略，免得外网被拦截的噪音淹没诊断结果——这是有意的取舍。
 *
 * 外部来源指 http(s) 地址且来源（origin）不是桌面自己的；替身应用（`STANDIN_ORIGIN` 等）由路由接管，属于外部来源。
 * 看不出是不是 http(s)（`data:`、扩展地址、解析不了）的不算外部。
 */

/** 各引擎里资源加载失败的措辞：Chromium `Failed to load resource` / `ERR_FAILED`，Firefox `Cross-Origin Request Blocked` / `NetworkError` / `NS_BINDING_ABORTED`，WebKit `… due to access control checks` / `Load failed`。 */
const LOAD_FAILURE =
  /Failed to load resource|ERR_FAILED|Cross-Origin Request Blocked|NetworkError when attempting to fetch resource|NS_BINDING_ABORTED|due to access control checks|Load failed/;

/** 网络层日志：失败资源的地址在 `location().url`。 */
const NETWORK_LOG = /^Failed to load resource/;

const EMBEDDED_URL = /https?:\/\/[^\s"'“”<>]+/g;

/** 句子里的地址后面常跟着标点（`…at https://a.example/. (Reason…`），不算地址的一部分。 */
const withoutTrailingPunctuation = address => address.replace(/[.,;:!?)\]]+$/, '');

function originOf(address) {
  try {
    const { protocol, origin } = new URL(address);
    return protocol === 'http:' || protocol === 'https:' ? origin : undefined;
  } catch {
    return undefined;
  }
}

/** 失败的资源在哪些地址上：网络层日志用 `location().url`，其余措辞用文字里的地址。 */
function failedAddresses(text, url) {
  if (NETWORK_LOG.test(text)) return url ? [url] : [];
  return (text.match(EMBEDDED_URL) ?? []).map(withoutTrailingPunctuation);
}

/**
 * 这条控制台错误是不是外网被拦截带来的、可以忽略的资源加载失败。
 *
 * @param {object} message
 * @param {string} message.text `ConsoleMessage.text()`
 * @param {string} [message.url] `ConsoleMessage.location().url`
 * @param {string} message.origin 桌面自己的来源（origin）
 * @param {string} message.engine 浏览器引擎：`chromium`、`firefox`、`webkit`
 * @param {readonly string[]} [message.expected] 测试主动让它失败的同源资源地址（完整地址），这些地址上的加载失败也忽略
 * @returns {boolean} 为真时可以忽略；为假时按页面错误记录
 */
export function isExpectedLoadFailure({ text, url = '', origin, engine, expected = [] }) {
  if (!LOAD_FAILURE.test(text)) return false;
  const desktopOrigin = originOf(origin);
  const addresses = failedAddresses(text, url);
  if (addresses.length === 0) return engine !== 'chromium';
  return addresses.every(address => {
    const source = originOf(address);
    return (source !== undefined && source !== desktopOrigin) || expected.includes(address);
  });
}

/**
 * 把一个页面上的错误收进 `errors`：未捕获的页面错误一律记；控制台 error 消息先过 {@link isExpectedLoadFailure}，
 * 没被忽略的带上来源位置（`（/路径:行号）`）一起记。
 *
 * @param {import('playwright').Page} page
 * @param {object} options
 * @param {string[]} options.errors 收集错误的数组
 * @param {string} options.origin 桌面自己的来源
 * @param {string} options.engine 浏览器引擎
 * @param {string[]} options.expected 测试主动让它失败的同源资源地址；传同一个数组，之后登记的也生效
 * @returns 传入的页面
 */
export function collectPageErrors(page, { errors, origin, engine, expected }) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const { url, lineNumber } = message.location();
    const text = message.text();
    if (isExpectedLoadFailure({ text, url, origin, engine, expected })) return;
    errors.push(url ? `${text}（${url.replace(origin, '')}:${lineNumber}）` : text);
  });
  return page;
}
