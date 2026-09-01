import { describe, expect, it } from 'vitest';
import {
  WEBVIEW_PROBE_ALLOWED_PATH,
  WEBVIEW_PROBE_ALLOWED_ROUTE,
  WEBVIEW_PROBE_DENIED_PATH,
  WEBVIEW_PROBE_DENIED_ROUTE,
  WEBVIEW_PROBE_SAME_ORIGIN_PATH,
  detectEngine,
  probeWebview,
  type WebviewFetchSurface,
  type WebviewProbeGlobals
} from './webview-probe';

/** 三家 webview 的真实 UA（macOS 26 / Windows WebView2 / Ubuntu WebKitGTK 上抄下来的形状）。 */
const CHROMIUM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
const WKWEBVIEW_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const WEBKITGTK_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const globals = (overrides: Partial<WebviewProbeGlobals> = {}): WebviewProbeGlobals => ({
  userAgent: WKWEBVIEW_UA,
  origin: 'tauri://localhost',
  online: true,
  saveFilePicker: false,
  anchorDownload: true,
  objectUrl: true,
  ...overrides
});

/** 同源那一份的内容；断言里要拿它算 sha256 与探针对。 */
const SAME_ORIGIN_BODY = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

const sha256 = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');

interface FakeStorage extends WebviewFetchSurface {
  /** 被请求过的 `(opfsPath, url)` 对，按调用顺序。 */
  readonly calls: [string, string][];
}

/**
 * 造一份内存替身：同源那条给内容，两条跨源的按 `crossOrigin` 决定抛什么。
 *
 * @param crossOrigin - 跨源请求要抛的错误；`null` 表示让它成功
 */
const storageFake = (crossOrigin: Error | null): FakeStorage => {
  const calls: [string, string][] = [];
  return {
    calls,
    fetch: async (opfsPath, options) => {
      calls.push([opfsPath, options.url]);
      if (opfsPath === WEBVIEW_PROBE_SAME_ORIGIN_PATH) return new Blob([SAME_ORIGIN_BODY]);
      if (crossOrigin !== null) throw crossOrigin;
      return new Blob([new Uint8Array([9])]);
    }
  };
};

const offline = (): Error => {
  const error = new Error('Storage offline: cannot fetch');
  error.name = 'StorageOfflineError';
  return error;
};

describe('detectEngine', () => {
  // Chromium 的 UA 里**同时**有 AppleWebKit 与 Chrome —— 先判 WebKit 的话，
  // WebView2 会被认成 webkit，而平台期望表正是靠这个字段区分两族的。
  it('把 Chromium 系认成 chromium，而不是被 AppleWebKit 骗过去', () => {
    expect(detectEngine(CHROMIUM_UA)).toBe('chromium');
  });

  // WKWebView 与 WebKitGTK 的 UA 分不开，这是事实而不是缺陷：分开靠的是读报告那一方
  // 自己的 process.platform。这条用例把「分不开」也钉住，免得有人去加一条猜测性的规则。
  it('把两家 WebKit 都认成 webkit', () => {
    expect(detectEngine(WKWEBVIEW_UA)).toBe('webkit');
    expect(detectEngine(WEBKITGTK_UA)).toBe('webkit');
  });

  it('认不出来时说 unknown，而不是随便挑一个', () => {
    expect(detectEngine('curl/8.4.0')).toBe('unknown');
  });
});

describe('probeWebview', () => {
  it('没给 baseUrl 时什么都不做', async () => {
    const storage = storageFake(null);
    expect(await probeWebview({ globals: globals(), storage, baseUrl: null })).toBeNull();
    expect(storage.calls, '不跑探针时不该动文件存储').toEqual([]);
  });

  it('把能力事实、同源缓存摘要与两条跨源判据一起报上来', async () => {
    const storage = storageFake(offline());
    const result = await probeWebview({
      globals: globals({ saveFilePicker: false, anchorDownload: true }),
      storage,
      baseUrl: 'http://127.0.0.1:54321'
    });

    expect(result).toEqual({
      engine: 'webkit',
      origin: 'tauri://localhost',
      online: true,
      saveFilePicker: false,
      anchorDownload: true,
      objectUrl: true,
      sameOriginDigest: await sha256(SAME_ORIGIN_BODY),
      sameOriginByteLength: SAME_ORIGIN_BODY.byteLength,
      // 错误的 name 才是可判别载体：message 里带着 URL 与端口，端口每次都不同。
      crossOriginAllowed: 'StorageOfflineError',
      crossOriginDenied: 'StorageOfflineError'
    });
  });

  it('跨源真的通了的时候记 ok，而不是把成功也写成一个错误名', async () => {
    const storage = storageFake(null);
    const result = await probeWebview({ globals: globals(), storage, baseUrl: 'http://127.0.0.1:54321' });

    expect(result?.crossOriginAllowed).toBe('ok');
    expect(result?.crossOriginDenied).toBe('ok');
  });

  // 三次请求各用各的缓存路径。共用一个的话，第二次会命中第一次的缓存**直接返回**
  // （`fetch()` 是永久缓存），于是「跨源被拦下」这条判据会以一个 ok 的形式消失。
  it('三条请求的缓存路径与目标 URL 互不相同', async () => {
    const storage = storageFake(null);
    await probeWebview({ globals: globals(), storage, baseUrl: 'http://127.0.0.1:54321' });

    expect(storage.calls).toEqual([
      [WEBVIEW_PROBE_SAME_ORIGIN_PATH, expect.stringContaining('tauri://localhost/') as unknown as string],
      [WEBVIEW_PROBE_ALLOWED_PATH, `http://127.0.0.1:54321${WEBVIEW_PROBE_ALLOWED_ROUTE}`],
      [WEBVIEW_PROBE_DENIED_PATH, `http://127.0.0.1:54321${WEBVIEW_PROBE_DENIED_ROUTE}`]
    ]);
  });

  // 同源那条是 AC#6 里 `fetch()` 的**正向**判据，它失败就该让整份自检判 failed 并带上原因，
  // 而不是报一个 ok 里藏着一个空摘要 —— 后者要等 e2e 侧发现 digest 对不上才暴露。
  it('同源缓存失败时向上抛，不吞成一个空摘要', async () => {
    const storage: WebviewFetchSurface = {
      fetch: async () => {
        throw new Error('asset protocol is unreachable');
      }
    };

    await expect(probeWebview({ globals: globals(), storage, baseUrl: 'http://127.0.0.1:54321' })).rejects.toThrow(
      /asset protocol/
    );
  });
});
