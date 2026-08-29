import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSelfCheck, type SelfCheckRun, type WebviewProbe } from './packaged-app';
import { collectStoredFiles, sha256OfFile } from './stored-files';

/**
 * US-505 AC#6 / AC#7：三家 webview 的 `download()` / `fetch()` 行为在**打包产物**里被锁定。
 *
 * @remarks
 * # 为什么必须是打包产物里的真实 webview
 *
 * 这两个 API 都在 renderer 侧、都**不经 host**：Rust 一个字节都看不到，一致性套件里的 Node
 * 进程更看不到。而 Tauri 的 webview 是三家的矩阵 —— Windows 的 WebView2（Chromium）、
 * macOS 的 WKWebView、Linux 的 WebKitGTK。「它们和 Chromium 一样」是假设，不是事实，
 * 而这条 AC 要的正是把事实记下来。
 *
 * # 为什么不去真的点保存
 *
 * `download()` 在有 `showSaveFilePicker` 的引擎上会弹**原生模态框**。自检进程里没人点它，
 * 于是进程停在那儿直到 60s 看门狗判超时 —— 与「renderer 挂死」这种真实缺陷的失败形态
 * 一模一样，两者无法区分。所以锁的是**分支判据**（`storage.service.ts` 里 `download()`
 * 只按 `window.showSaveFilePicker` 存不存在分岔）与两条分支各自的结构前提。
 *
 * # 跨源那两条为什么允许都失败
 *
 * `tauri.conf.json` 的 CSP 是 `connect-src 'self' ipc: http://ipc.localhost` —— **任何**跨源
 * 请求都被 CSP 挡在 CORS 之前，服务端加不加 `Access-Control-Allow-Origin` 都一样。本用例
 * 把两种服务端配置各打一次，两列取值相同就是这条事实的证据：拦住它的是 CSP，不是 CORS，
 * 因此在服务端加 ACAO 也不会有任何改变。AC#6 要的是「行为被锁定**或有可判别错误**」，
 * 而不是「跨源必须能通」；为了让断言变绿去放宽产品 CSP，是拿真实的安全边界换一条断言。
 *
 * `fetch()` 那一半的**正向**证据由同源那条给：`storage.fetch()` 把 `${origin}/index.html`
 * 缓存进一个原生文件，用例再到磁盘上把那个文件找出来核对 sha256。
 *
 * # AC#7 顺带成立
 *
 * `release-desktop.yml` 的 `tauri-smoke` 已经是三 OS 矩阵、已经跑
 * `dev-rxdb-tauri-e2e:desktop-smoke`，而本文件落在同一个 `include` 下 —— 它绿一次，
 * 「三平台打包后文件仍能持久化」就同时被跑过了，不需要新增 job。
 */

/** 服务端**带** `Access-Control-Allow-Origin` 的那条路由，与 `webview-probe.ts` 一致。 */
const ALLOWED_ROUTE = '/allowed';

/** 服务端**不带** ACAO 的那条路由，与 `webview-probe.ts` 一致。 */
const DENIED_ROUTE = '/denied';

/** 两条路由的响应体；内容本身不重要，重要的是它有确定的长度。 */
const PROBE_BODY = Buffer.from('rxdb-webview-probe');

/** 一个可关闭的本地探针服务，外加它各条路由被真的打中过几次。 */
interface ProbeServer {
  /** 传给 `DEV_RXDB_TAURI_PROBE_BASE_URL` 的根地址，末尾不带 `/`。 */
  readonly baseUrl: string;
  /** 各条路由收到的请求数。 */
  readonly hits: Map<string, number>;
  /** 关掉它。 */
  close: () => Promise<void>;
}

/**
 * 起一个只服务两条路由的本地 HTTP 服务。
 *
 * @returns 根地址、命中计数与关闭手柄
 *
 * @remarks
 * 绑 `127.0.0.1:0` 让内核挑端口：写死端口会在并行跑的 CI 上偶发地撞车，而那种失败会以
 * 「跨源探针拿到了一个不属于它的响应」的形态出现 —— 比一次 `EADDRINUSE` 难查得多。
 *
 * **命中计数是 CSP 与 CORS 的分水岭**：被 CSP 拦下的请求压根不出 renderer，服务端一次都
 * 收不到；被 CORS 拦下的则是请求发出去了、响应被扣住。只看错误名分不开这两件事。
 */
const startProbeServer = async (): Promise<ProbeServer> => {
  const hits = new Map<string, number>([
    [ALLOWED_ROUTE, 0],
    [DENIED_ROUTE, 0]
  ]);

  const server: Server = createServer((request, response) => {
    const route = (request.url ?? '').split('?')[0];
    const seen = hits.get(route);
    if (seen === undefined) {
      response.writeHead(404).end();
      return;
    }
    hits.set(route, seen + 1);
    const headers: Record<string, string> = {
      'content-type': 'application/octet-stream',
      'content-length': String(PROBE_BODY.byteLength)
    };
    // 只有 allowed 那条带 ACAO —— 两条之间**只差这一个头**，别的都一样，
    // 否则「结果不同」就可能是别的差异造成的。
    if (route === ALLOWED_ROUTE) headers['access-control-allow-origin'] = '*';
    response.writeHead(200, headers).end(PROBE_BODY);
  });

  const port = await new Promise<number>((settle, fail) => {
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        fail(new Error(`探针服务没有拿到 TCP 端口：${String(address)}`));
        return;
      }
      settle(address.port);
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${String(port)}`,
    hits,
    close: () =>
      new Promise<void>((settle, fail) => {
        server.close(error => (error ? fail(error) : settle()));
      })
  };
};

/** 每平台被冻结的能力事实。 */
interface WebviewExpectation {
  /** 从 UA 认出的引擎族。 */
  readonly engine: string;
  /** `window.showSaveFilePicker` 是否存在。 */
  readonly saveFilePicker: boolean;
  /** `<a download>` 是否被实现。 */
  readonly anchorDownload: boolean;
  /** `URL.createObjectURL` 是否交出 `blob:` URL。 */
  readonly objectUrl: boolean;
  /** 跨源（带 ACAO）的判别结果。 */
  readonly crossOriginAllowed: string;
  /** 跨源（不带 ACAO）的判别结果。 */
  readonly crossOriginDenied: string;
  /** 带 ACAO 那条路由服务端实际收到的请求数。 */
  readonly allowedHits: number;
  /** 不带 ACAO 那条路由服务端实际收到的请求数。 */
  readonly deniedHits: number;
}

/**
 * 三平台的能力事实表。
 *
 * @remarks
 * 只有 `darwin` 一列能在本机核对，另外两列要按 `release-desktop.yml` 的
 * `workflow_dispatch` 首次真实输出回填 —— 缺一列时下面的查表会**红**并直接打印一段
 * 可粘贴的字面量，而不是悄悄放行。那次红是锁定过程的一部分，不是失败。
 *
 * 冻结它的意义在于：某天 Tauri 换了 webview 版本、或某家引擎补上了
 * `showSaveFilePicker`，`storage.service.ts` 的分支会**静默地**换一条路走。有这张表，
 * 那一刻会以一条写着新旧取值的断言失败出现。
 */
const EXPECTED_BY_PLATFORM: Readonly<Partial<Record<NodeJS.Platform, WebviewExpectation>>> = Object.freeze({
  darwin: {
    engine: 'webkit',
    saveFilePicker: false,
    anchorDownload: true,
    objectUrl: true,
    // CSP 的 `connect-src 'self'` 把两条都挡在 CORS 之前：`fetch()` 抛 `TypeError`，
    // 存储插件（`storage.ops.ts`）把它映射成 `StorageOfflineError`。
    crossOriginAllowed: 'StorageOfflineError',
    crossOriginDenied: 'StorageOfflineError',
    // 都是 0：请求根本没出 renderer —— 这正是「拦住它的是 CSP 不是 CORS」的判据。
    allowedHits: 0,
    deniedHits: 0
  }
});

/** 把失败报告里的原因带进断言消息。 */
const because = (run: SelfCheckRun): string => run.report.message ?? '(报告里没有原因)';

/**
 * 取出 webview 探针结果。
 *
 * @throws 报告里没有它时抛出，并带上失败原因
 */
const webviewOf = (run: SelfCheckRun): WebviewProbe => {
  const { webview } = run.report;
  if (webview === null) throw new Error(`报告里没有 webview 探针结果：${because(run)}`);
  return webview;
};

/**
 * 把本次实测值排成一段可直接粘进 {@link EXPECTED_BY_PLATFORM} 的字面量。
 *
 * @param probe - 本次探针结果
 * @param hits - 服务端各路由的命中计数
 * @returns 多行字符串
 *
 * @remarks
 * 没有这一段的话，Windows / Linux 那两列要靠人去 CI 日志里一个字段一个字段地抄 ——
 * 而首跑必红是**设计好**的，让它一次就交出可用的结果，那次红才有价值。
 */
const asTableEntry = (probe: WebviewProbe, hits: Map<string, number>): string =>
  [
    `  ${platform}: {`,
    `    engine: ${JSON.stringify(probe.engine)},`,
    `    saveFilePicker: ${String(probe.saveFilePicker)},`,
    `    anchorDownload: ${String(probe.anchorDownload)},`,
    `    objectUrl: ${String(probe.objectUrl)},`,
    `    crossOriginAllowed: ${JSON.stringify(probe.crossOriginAllowed)},`,
    `    crossOriginDenied: ${JSON.stringify(probe.crossOriginDenied)},`,
    `    allowedHits: ${String(hits.get(ALLOWED_ROUTE) ?? 0)},`,
    `    deniedHits: ${String(hits.get(DENIED_ROUTE) ?? 0)}`,
    '  }'
  ].join('\n');

describe('打包产物里的 webview 能力', () => {
  let server: ProbeServer;
  let workspace: string;
  let run: SelfCheckRun;
  let probe: WebviewProbe;

  // 一次启动供全部断言共用：每条断言各拉起一次打包产物的话，这个文件要跑五六次
  // Angular bootstrap + 建库，而它们看的本来就是同一次启动的同一份事实。
  beforeAll(async () => {
    server = await startProbeServer();
    workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-webview-'));
    const dataDir = join(workspace, 'app-data');
    mkdirSync(dataDir);

    run = await runSelfCheck({
      dataDir,
      reportPath: join(workspace, 'selfcheck-1.json'),
      probeBaseUrl: server.baseUrl
    });
    expect(run.report.status, because(run)).toBe('ok');
    probe = webviewOf(run);
  });

  afterAll(async () => {
    await server.close();
    rmSync(workspace, { force: true, recursive: true });
  });

  /**
   * 三平台共同的硬断言：`download()` 至少有一条分支立得住。
   *
   * `storage.service.ts` 的 `download()` 只按 `showSaveFilePicker` 存不存在分岔，
   * 而它选中的那条分支还需要各自的结构前提。两条都不成立时 `download()` 在那个平台上
   * 根本没有可走的路 —— 这条断言就是为了不让那种情况静默地留在产品里。
   */
  it('download() 至少有一条分支可用', () => {
    const anchorBranch = probe.anchorDownload && probe.objectUrl;
    expect(probe.saveFilePicker || anchorBranch, `两条下载分支都立不住：${JSON.stringify(probe)}`).toBe(true);
  });

  /**
   * 三平台共同的硬断言：同源 `fetch()` 真的把字节落到了原生文件上。
   *
   * 这是 `fetch()` 那半条 AC 的正向证据，也是唯一一条端到端的：请求由真实 webview 发出，
   * 内容经存储插件写进 Rust 宿主管理的原生文件，再由本进程在磁盘上原地核对。
   */
  it('同源 fetch() 的内容落在应用数据目录里的原生文件上', () => {
    const stored = collectStoredFiles(join(workspace, 'app-data'));
    const digests = stored.map(path => sha256OfFile(path));
    expect(digests, `磁盘上没有一个文件的内容与同源 fetch() 的摘要相符：\n  ${stored.join('\n  ')}`).toContain(
      probe.sameOriginDigest
    );
    expect(probe.sameOriginByteLength, '同源 fetch() 拿回来的是一份空内容').toBeGreaterThan(0);
  });

  /**
   * 三平台共同的硬断言：跨源的结果与服务端是否真的收到请求**自洽**。
   *
   * 判成 `ok` 却一次请求都没到过服务端，只可能是探针把别的东西（比如一次缓存命中）
   * 当成了成功 —— 那会让这条 AC 的证据整个作废。
   */
  it('跨源判成 ok 时服务端必须真的收到过那次请求', () => {
    if (probe.crossOriginAllowed === 'ok') expect(server.hits.get(ALLOWED_ROUTE)).toBeGreaterThan(0);
    if (probe.crossOriginDenied === 'ok') expect(server.hits.get(DENIED_ROUTE)).toBeGreaterThan(0);
  });

  /** 冻结本平台的全部能力事实；表里没有这一列时红掉并交出可粘贴的实测值。 */
  it('能力事实与本平台被冻结的取值一致', () => {
    const expected = EXPECTED_BY_PLATFORM[platform];
    if (expected === undefined) {
      throw new Error(
        [
          `EXPECTED_BY_PLATFORM 里还没有 ${platform} 这一列。`,
          '这次跑出来的真实取值如下，核对无误后粘进 desktop-webview-capability.spec.ts：',
          '',
          asTableEntry(probe, server.hits)
        ].join('\n')
      );
    }

    expect({
      engine: probe.engine,
      saveFilePicker: probe.saveFilePicker,
      anchorDownload: probe.anchorDownload,
      objectUrl: probe.objectUrl,
      crossOriginAllowed: probe.crossOriginAllowed,
      crossOriginDenied: probe.crossOriginDenied,
      allowedHits: server.hits.get(ALLOWED_ROUTE) ?? 0,
      deniedHits: server.hits.get(DENIED_ROUTE) ?? 0
    }).toEqual(expected);
  });
});
