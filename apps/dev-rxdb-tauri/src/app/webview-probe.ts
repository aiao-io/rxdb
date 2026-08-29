/**
 * @fileoverview 自检模式下把三家 webview 的 `download()` / `fetch()` 行为记下来（US-505 AC#6）。
 *
 * # 为什么这条探针必须跑在真实 webview 里
 *
 * `download()` 与 `fetch()` 是**不经 host** 的两条 renderer 侧路径：它们的行为由那家 webview
 * 自己决定，Rust 侧一个字节都看不到，一致性套件里的 Node 进程更看不到。而 Tauri 的 webview 是
 * 三家的矩阵（WebView2 / WKWebView / WebKitGTK），「和 Chromium 一样」是假设不是事实。
 *
 * # 为什么不真的触发保存
 *
 * `download()` 走 `showSaveFilePicker` 时会弹一个**原生模态框**。自检进程里没人去点它，
 * 于是进程停在那儿直到 60s 看门狗判它超时 —— 与「renderer 挂死」这种真实缺陷的失败形态
 * 完全一样，两者无法区分。所以这里锁的是**分支判据**（`showSaveFilePicker` 存不存在，
 * 单独决定 `StorageService.download()` 走哪条路）与各分支的结构前提，而不是保存动作本身。
 *
 * # CSP 才是 `fetch()` 这一半的主角
 *
 * `tauri.conf.json` 的 `connect-src 'self' ipc: http://ipc.localhost` 意味着**任何**跨源
 * 请求都会被 CSP 挡在 CORS 之前 —— 服务端加不加 `Access-Control-Allow-Origin` 都一样。
 * 探针把两种服务端配置各打一次，就是为了把这条事实写进证据里：两列取值相同 ⇒ 拦住它的是
 * CSP，不是 CORS。AC#6 要的是「行为被锁定**或有可判别错误**」，而不是「跨源必须能通」——
 * 为了让测试变绿去放宽产品 CSP，是拿真实的安全边界换一条断言。
 *
 * @module webview-probe
 */

import { sha256Hex } from './storage-probe';

/** 跨源探针在服务端**带** `Access-Control-Allow-Origin` 的那条路由。 */
export const WEBVIEW_PROBE_ALLOWED_ROUTE = '/allowed';

/** 跨源探针在服务端**不带** ACAO 的那条路由。 */
export const WEBVIEW_PROBE_DENIED_ROUTE = '/denied';

/**
 * 同源探针要抓的资源，相对 renderer 的 origin。
 *
 * @remarks
 * 取 `index.html` 而不是某个构建产物：它是 `frontendDist` 里唯一一个名字不随构建哈希变的文件。
 */
export const WEBVIEW_PROBE_SAME_ORIGIN_ROUTE = '/index.html';

/** 同源那一份的缓存路径。 */
export const WEBVIEW_PROBE_SAME_ORIGIN_PATH = 'selfcheck-same-origin.bin';

/** 跨源（带 ACAO）那一份的缓存路径。 */
export const WEBVIEW_PROBE_ALLOWED_PATH = 'selfcheck-cross-allowed.bin';

/** 跨源（不带 ACAO）那一份的缓存路径。 */
export const WEBVIEW_PROBE_DENIED_PATH = 'selfcheck-cross-denied.bin';

/**
 * 三条请求都显式给 MIME。
 *
 * @remarks
 * `fetch()` 在两边都缺 MIME 时抛 `StorageMimeTypeMissingError` —— 而三家 webview 给自定义
 * 协议响应补的 `Content-Type` 各不相同。不写死的话，跨源那两条的判别结果可能变成
 * 「MIME 缺失」，与「被 CSP 拦下」混为一谈。
 */
const WEBVIEW_PROBE_MIME = 'application/octet-stream';

/** 探针成功时写进判别字段的值。 */
const PROBE_OK = 'ok';

/** 探针用得到的那一小块运行时事实，全部在调用点一次取齐。 */
export interface WebviewProbeGlobals {
  /** `navigator.userAgent`。 */
  readonly userAgent: string;
  /** `location.origin`，例如 `tauri://localhost`。 */
  readonly origin: string;
  /** `navigator.onLine`。 */
  readonly online: boolean;
  /** `window.showSaveFilePicker` 是否存在。 */
  readonly saveFilePicker: boolean;
  /** `<a download>` 属性是否被实现。 */
  readonly anchorDownload: boolean;
  /** `URL.createObjectURL` 是否交出一个 `blob:` URL。 */
  readonly objectUrl: boolean;
}

/** 探针用得到的那一小块 `rxdb.storage` 表面。 */
export interface WebviewFetchSurface {
  /** 把远程 URL 的内容缓存成一个原生文件并读回来。 */
  fetch(opfsPath: string, options: { readonly url: string; readonly mimeType: string }): Promise<Blob>;
}

/** 探针结果，与 `src-tauri/src/selfcheck.rs` 的 `WebviewProbe` 逐字对应。 */
export interface WebviewProbeResult {
  /** 从 UA 认出的引擎族。 */
  readonly engine: string;
  /** renderer 的 origin。 */
  readonly origin: string;
  /** `navigator.onLine`。 */
  readonly online: boolean;
  /** `download()` 走哪条分支的唯一判据。 */
  readonly saveFilePicker: boolean;
  /** `<a download>` 分支的结构前提之一。 */
  readonly anchorDownload: boolean;
  /** `<a download>` 分支的结构前提之二。 */
  readonly objectUrl: boolean;
  /** 同源缓存内容的 sha256。 */
  readonly sameOriginDigest: string;
  /** 同源缓存内容的字节数。 */
  readonly sameOriginByteLength: number;
  /** 跨源（带 ACAO）的判别结果：成功是 `'ok'`，否则是错误的 `name`。 */
  readonly crossOriginAllowed: string;
  /** 跨源（不带 ACAO）的同一判据。 */
  readonly crossOriginDenied: string;
}

/** {@link probeWebview} 的入参。 */
export interface WebviewProbeOptions {
  /** 一次取齐的运行时事实。 */
  readonly globals: WebviewProbeGlobals;
  /** 已连接的 `rxdb.storage`。 */
  readonly storage: WebviewFetchSurface;
  /** 跨源探针的服务根地址；`null` 表示这次不跑探针。 */
  readonly baseUrl: string | null;
}

/**
 * 从 UA 认出引擎族。
 *
 * @param userAgent - `navigator.userAgent`
 * @returns `chromium` / `webkit` / `gecko` / `unknown`
 *
 * @remarks
 * 顺序不能反：Chromium 的 UA 里**同时**有 `AppleWebKit` 与 `Chrome`，先判 WebKit 的话
 * WebView2 会被认成 webkit —— 而平台期望表正是靠这个字段区分两族的。
 *
 * WKWebView 与 WebKitGTK 都自称 WebKit，这里**分不开**，也不去猜：读报告的一方有自己的
 * `process.platform`，那才是可靠的判据。
 */
export const detectEngine = (userAgent: string): string => {
  if (userAgent.includes('Chrome/') || userAgent.includes('Edg/')) return 'chromium';
  if (userAgent.includes('AppleWebKit')) return 'webkit';
  if (userAgent.includes('Gecko/')) return 'gecko';
  return 'unknown';
};

/**
 * 在真实 DOM 上取齐 {@link WebviewProbeGlobals}。
 *
 * @returns 本次启动的运行时事实
 *
 * @remarks
 * 与 {@link probeWebview} 分开，是为了让后者在单测里不必碰 DOM：这里读的每一样东西在
 * happy-dom 上都只有「宿主自己的答案」，测它等于测 happy-dom。
 */
export const readWebviewGlobals = (): WebviewProbeGlobals => ({
  userAgent: navigator.userAgent,
  origin: location.origin,
  online: navigator.onLine,
  saveFilePicker: 'showSaveFilePicker' in window,
  anchorDownload: 'download' in HTMLAnchorElement.prototype,
  objectUrl: probeObjectUrl()
});

/** `URL.createObjectURL` 是否真的交出一个 `blob:` URL；缺失本身就是要记的事实之一。 */
const probeObjectUrl = (): boolean => {
  if (typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(new Blob([new Uint8Array([0])]));
  try {
    return url.startsWith('blob:');
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * 打一次跨源请求，把结果压成一个可判别的字符串。
 *
 * @returns 成功是 `'ok'`，失败是错误的 `name`
 *
 * @remarks
 * 取 `name` 而不是 `message`：后者带着 URL 与端口，而端口每次运行都不同 —— 拿它当期望值，
 * 平台期望表根本冻结不住。
 */
const classifyFetch = async (storage: WebviewFetchSurface, opfsPath: string, url: string): Promise<string> => {
  try {
    await storage.fetch(opfsPath, { url, mimeType: WEBVIEW_PROBE_MIME });
    return PROBE_OK;
  } catch (error) {
    return error instanceof Error ? error.name : String(error);
  }
};

/**
 * 记录三家 webview 上 `download()` / `fetch()` 的真实行为。
 *
 * @param options - 运行时事实、文件存储与服务根地址
 * @returns 探针结果；`baseUrl` 为 `null` 时返回 `null`（这次不跑）
 * @throws 同源缓存失败时抛出；调用方（`startLocalDatabase`）把它落成自检报告里的失败原因
 *
 * @remarks
 * 三条请求各用各的缓存路径：`fetch()` 是**永久缓存**，共用一个路径的话第二次会直接命中
 * 缓存返回，于是「跨源被拦下」这条判据会以一个 `ok` 的形式消失。
 */
export const probeWebview = async (options: WebviewProbeOptions): Promise<WebviewProbeResult | null> => {
  const { baseUrl, globals, storage } = options;
  if (baseUrl === null) return null;

  // 同源这条排在最前且**不吞异常**：它是 `fetch()` 那一半的正向判据，
  // 也是「探针本身跑得通」的前提。它挂了，后面两条的取值没有任何解释力。
  const cached = await storage.fetch(WEBVIEW_PROBE_SAME_ORIGIN_PATH, {
    url: `${globals.origin}${WEBVIEW_PROBE_SAME_ORIGIN_ROUTE}`,
    mimeType: WEBVIEW_PROBE_MIME
  });
  const bytes = new Uint8Array(await cached.arrayBuffer());

  return {
    engine: detectEngine(globals.userAgent),
    origin: globals.origin,
    online: globals.online,
    saveFilePicker: globals.saveFilePicker,
    anchorDownload: globals.anchorDownload,
    objectUrl: globals.objectUrl,
    sameOriginDigest: await sha256Hex(bytes),
    sameOriginByteLength: bytes.byteLength,
    crossOriginAllowed: await classifyFetch(
      storage,
      WEBVIEW_PROBE_ALLOWED_PATH,
      `${baseUrl}${WEBVIEW_PROBE_ALLOWED_ROUTE}`
    ),
    crossOriginDenied: await classifyFetch(storage, WEBVIEW_PROBE_DENIED_PATH, `${baseUrl}${WEBVIEW_PROBE_DENIED_ROUTE}`)
  };
};
