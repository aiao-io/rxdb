import { ElectronApplication, Page, _electron as electron, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchEnv, resolveExecutable } from './packaged-app';

/**
 * US-904 阶段 D AC#52：真实 userData 重启后，DevTools 面板读回同一实体与同一文件。
 *
 * @remarks
 * 链路上没有任何替身：打包产物（electron-builder --dir）里的**真实** main / preload / host，
 * 真实 renderer，真实 MV3 扩展构建产物，真实 DevTools 前端与它的扩展面板。两次启动共用同一个
 * 临时 userData，因此「一致」是跨进程的结论，内存实现无从伪装。
 *
 * 证据分两路，各自覆盖一段：
 * - **实体**：`DesktopLaunch` 每次启动追加一行。第二次启动后面板必须同时看到两行，且第一行的
 *   `startedAt` 与第一次启动时读到的**逐字符相同** —— 这条数据从 SQLite 出发，经 host → main →
 *   preload → renderer 的 connector → content bridge → background → 面板，中间任一段换成桩都读不到它。
 * - **文件**：一个 1 MiB 确定性文件走原生文件后端落盘。面板的 Storage 页读回它的 `StorageFileMeta`
 *   元数据行，应用侧再把字节读回来算 SHA-256，并与**直接在磁盘上**对同一个文件算出的摘要比对。
 *
 * ## 为什么必须用 `--serve` 起一个真实 http 静态服务
 *
 * 生产入口是自定义 `app:` scheme（`main.utils.ts` 的 `APP_SCHEME`），而**自定义 scheme 不在
 * Chromium 扩展 match pattern 的合法 scheme 集里**。在打包产物上实测过三种写法，
 * `chrome.scripting.executeScript` 全部抛同一句
 * 「Cannot access contents of the page. Extension manifest must request permission…」：
 *
 * | inspected page       | `host_permissions`           | 注入 |
 * | -------------------- | ---------------------------- | ---- |
 * | `app://-/index.html` | `['app://-/*']`              | ❌   |
 * | `app://-/index.html` | `['<all_urls>']`             | ❌   |
 * | `app://-/index.html` | 主机通配的 `app:` pattern 与 `<all_urls>` 并列 | ❌ |
 * | `http://localhost:<port>/` | `['http://localhost/*']` | ✅ 2.6s 接通 |
 *
 * 所以本套件把 renderer 换成应用自己的 `--serve` 路径（main / preload / host 一律不动，只换
 * inspected page 的 origin），并用扩展 dist 的**临时副本**提供那条静态 host permission。
 * 这与阶段 A 对 `apps/rxdb-devtools-extension-e2e` 记录的 variance 同源、同形态：补的是**宿主**，
 * 不是被测物。生产 manifest 保持 `optional_host_permissions`，由
 * `apps/rxdb-devtools-extension/src/manifest.config.spec.ts` 守住。
 *
 * 第二条约束同样来自实测：**Electron 没有 `chrome.permissions` 命名空间**，`optional_host_permissions`
 * 的授权集恒为空，所以 Electron 上必须是**静态** host permission，运行时请求那条路走不通。
 *
 * ⚠️ 依赖 `electron-package-dir` 的产物（electron-builder 需联网下载 Electron 发行包）。跑之前：
 *   pnpm nx build rxdb-devtools-extension
 *   pnpm nx run dev-rxdb-electron:electron-package-dir
 */

/** 扩展构建产物目录，与 `apps/rxdb-devtools-extension/vite.config.ts` 的 `outDir` 一致。 */
const EXTENSION_DIST = join(__dirname, '../../rxdb-devtools-extension/dist');

/** renderer 构建产物目录，与 `apps/dev-rxdb-electron` 的 build outputPath 一致。 */
const RENDERER_DIST = join(__dirname, '../../../dist/apps/dev-rxdb-electron/browser');

/**
 * 文件内容在 userData 下的相对位置。
 *
 * @remarks
 * 与 `storage-persistence.spec.ts` 同源：`rxdb-files/` 来自 `desktop-file-bridge.ts` 的
 * `DESKTOP_STORAGE_DIRECTORY`，`files/` 来自 demo 传给插件的 `DESKTOP_STORAGE_ROOT_DIR`。
 * 同样写死而不 import —— 值一旦漂移，下面「磁盘上这个文件在不在」的断言直接红。
 */
const STORAGE_DIR = join('rxdb-files', 'files');

/** 桌面适配器注册名，与适配器包的 `ELECTRON_ADAPTER_NAME` 一致。 */
const DESKTOP_ADAPTER_NAME = 'sqlite-electron';

const BYTES_PER_MIB = 1024 * 1024;

/** 本用例种下的文件；名字带 AC 号，排查时一眼知道是谁写的。 */
const FILE_NAME = 'ac52-restart.bin';
const FILE_MIB = 1;

/** 面板从「打开 DevTools」到「四段中继接通」的预算。实测冷启动约 2.6s，留足重试余量。 */
const PANEL_BUDGET_MS = 40000;

/**
 * 一份只改了 `host_permissions` 的扩展 dist 临时副本。
 *
 * @returns 副本目录绝对路径，调用方负责删除
 *
 * @remarks
 * 不含端口：Chrome 的 host pattern 本就不匹配端口，静态服务用哪个随机端口都覆盖得到。
 */
function devtoolsExtensionCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ac52-ext-'));
  cpSync(EXTENSION_DIST, dir, { recursive: true });
  const manifestPath = join(dir, 'manifest.json');
  const manifest: Record<string, unknown> = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest['host_permissions'] = ['http://localhost/*'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dir;
}

/** 静态服务的 MIME 表；`.wasm` 少一条就会让 SQLite 侧的实例化失败在一句无关的报错上。 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm'
};

/**
 * 把 renderer 构建产物用真实 http 服务出去。
 *
 * @returns 端口与关闭函数
 * @throws 缺 renderer 产物时抛出
 *
 * @remarks
 * 存在的唯一理由是把 inspected page 的 scheme 从 `app:` 换成 `http:`（见文件头）。
 * 找不到的路径回落到 `index.html` —— 应用走的是 hash 路由，这只服务于深链接刷新。
 */
async function serveRenderer(): Promise<{ port: number; close: () => Promise<void> }> {
  if (!existsSync(RENDERER_DIST)) {
    throw new Error(`缺 renderer 产物：${RENDERER_DIST}。先 pnpm nx run dev-rxdb-electron:electron-package-dir`);
  }
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const candidate = join(RENDERER_DIST, pathname);
    const file = pathname !== '/' && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(RENDERER_DIST, 'index.html');
    response.writeHead(200, { 'content-type': CONTENT_TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('拿不到静态服务端口');
  return { port: address.port, close: () => new Promise<void>(resolve => void server.close(() => resolve())) };
}

/** 拉起打包产物：真实 userData、http renderer、开发态扩展副本。 */
function launchApp(userDataDir: string, extensionDist: string, port: number): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`, '--serve', `--port=${String(port)}`],
    env: {
      ...launchEnv(),
      DEV_RXDB_DEVTOOLS: '1',
      DEV_RXDB_DEVTOOLS_EXTENSION: extensionDist,
      DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
      DEV_RXDB_DEVTOOLS_MUTATION: 'allow'
    }
  });
}

/**
 * 打开 DevTools 并选中扩展面板 tab。
 *
 * @throws 预算内没等到扩展 tab 时抛出
 *
 * @remarks
 * **必须先把窗口放宽到 1600。** DevTools 的 `TabbedPane` 放不下的 tab 会被**移出 DOM**、
 * 只挂在「»」下拉里；应用窗口默认 900px，bottom 模式下主 tab 条只显示前 9 个内置 tab，
 * 扩展面板一律读不到 —— 那会被误读成「面板没登记」，而它其实一直都登记着。
 *
 * 整段逻辑放进 `app.evaluate()`：用的全是主进程 Electron API，不经 page 级 CDP，
 * 因此与 DevTools 自己的调试通道不冲突（Playwright 的 page API 打不开 DevTools 宿主）。
 */
async function attachPanel(app: ElectronApplication, budgetMs: number): Promise<void> {
  const selected = await app.evaluate(async ({ BrowserWindow }, input) => {
    const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
    const win = BrowserWindow.getAllWindows().find(candidate =>
      candidate.webContents.getURL().startsWith('http://localhost')
    );
    if (!win) throw new Error('找不到 http renderer 窗口');

    win.setSize(1600, 1000);
    const opened = new Promise<void>(resolve => win.webContents.once('devtools-opened', () => resolve()));
    win.webContents.openDevTools({ mode: 'bottom' });
    await opened;

    const devTools = win.webContents.devToolsWebContents;
    if (!devTools) throw new Error('devToolsWebContents 为 null');

    // 内置 tab 的 id 一律是 `tab-*`，含 `chrome-extension://` 就等价于「这是扩展面板」。
    // tab 藏在 DevTools 前端的多层 shadow root 里，只能自己走一遍。
    const clickExtensionTab = `(() => {
      const seen = new Set();
      let hit = null;
      const walk = root => {
        if (seen.has(root) || hit) return;
        seen.add(root);
        for (const el of root.querySelectorAll('*')) {
          if (el.classList.contains('tabbed-pane-header-tab') && el.id.includes('chrome-extension://')) { hit = el; return; }
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      walk(document);
      if (!hit) return false;
      for (const type of ['mousedown', 'mouseup', 'click']) hit.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      return true;
    })()`;

    const deadline = Date.now() + input.budgetMs;
    while (Date.now() < deadline) {
      const done: boolean = await devTools.executeJavaScript(clickExtensionTab).catch(() => false);
      if (done) return true;
      await sleep(500);
    }
    return false;
  }, { budgetMs });

  expect(selected, 'DevTools 里始终没有出现扩展面板 tab').toBe(true);
}

interface PanelRead {
  /** 面板路由（hash 路由，见 `devtools/main.ts` 的 `withHashLocation()`）。 */
  readonly hash: string;
  /** 需要先点开的实体按钮文本；不给就不点。 */
  readonly clickText?: string;
  /** 轮询到文本匹配它才算读到终态。 */
  readonly awaitPattern: string;
  readonly budgetMs: number;
}

/**
 * 切到面板某一页、可选地点开一个实体，并等页面走到终态。
 *
 * @returns 面板正文（空白已折叠）；超时则返回**最后一次**读到的文本，让断言报出真实现场
 *
 * @remarks
 * 每次轮询都重新取 `WebFrameMain`：面板帧会随导航重建，缓存住的引用会在半路失效。
 * 已经选中的实体按钮不重复点 —— `selectEntity()` 每次点击都会重新发查询。
 */
async function readPanel(app: ElectronApplication, input: PanelRead): Promise<string> {
  return app.evaluate(async ({ BrowserWindow }, opts) => {
    const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
    const panelFrame = (): Electron.WebFrameMain | null => {
      const win = BrowserWindow.getAllWindows().find(candidate =>
        candidate.webContents.getURL().startsWith('http://localhost')
      );
      const devTools = win?.webContents.devToolsWebContents;
      return devTools?.mainFrame.framesInSubtree.find(frame => frame.url.includes('/panel.html')) ?? null;
    };

    const script = `(() => {
      const hash = ${JSON.stringify(opts.hash)};
      if (location.hash !== hash) location.hash = hash;
      const label = ${JSON.stringify(opts.clickText ?? '')};
      if (label) {
        const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
        if (button && !button.classList.contains('active')) button.click();
      }
      return document.body.innerText.replace(/\\s+/g, ' ').slice(0, 4000);
    })()`;

    const wanted = new RegExp(opts.awaitPattern);
    const deadline = Date.now() + opts.budgetMs;
    let latest = '(面板帧始终没有出现)';
    while (Date.now() < deadline) {
      const frame = panelFrame();
      const text: string | null =
        frame ? await frame.executeJavaScript(script).catch((error: Error) => `帧内执行抛错：${error.message}`) : null;
      if (text !== null && text.trim().length > 0) latest = text;
      if (wanted.test(latest)) return latest;
      await sleep(400);
    }
    return latest;
  }, input);
}

/** 打开应用的 storage 页并等它就绪。 */
async function openStoragePage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  // 走 hash 而不是点菜单：侧边栏折叠时菜单项只剩图标，点击目标随样式漂移。
  await page.evaluate(() => {
    window.location.hash = '#/storage';
  });
  const status = page.getByTestId('storage-status');
  await expect(status).not.toHaveText(/初始化中/, { timeout: 60000 });
  const failure = page.getByTestId('storage-error');
  if (await failure.count()) throw new Error(`文件存储初始化失败：${await failure.textContent()}`);
  await expect(status).toHaveText(/就绪/);
}

/** 确认首页选中的确实是桌面 SQLite 后端，而不是探测失败后落到 wa-sqlite。 */
async function expectDesktopBackend(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/home';
  });
  const status = page.getByTestId('rxdb-status');
  await expect(status).not.toHaveText(/连接中/, { timeout: 60000 });
  const failure = page.getByTestId('rxdb-error');
  if (await failure.count()) throw new Error(`本地适配器连接失败：${await failure.textContent()}`);
  await expect(status).toHaveText(/已连接/);
  await expect(page.getByTestId('rxdb-backend')).toHaveText(DESKTOP_ADAPTER_NAME);
}

/** 生成确定性内容并上传，等条目出现在列表里。 */
async function uploadGenerated(page: Page, name: string, sizeMib: number): Promise<void> {
  await page.getByTestId('storage-generate-name').fill(name);
  await page.getByTestId('storage-generate-size').fill(String(sizeMib));
  await page.getByTestId('storage-generate-upload').click();
  await expect(page.locator(`[data-testid="storage-entry"][data-name="${name}"]`)).toHaveCount(1, { timeout: 180000 });
  const failure = page.getByTestId('storage-error');
  if (await failure.count()) throw new Error(`上传失败：${await failure.textContent()}`);
}

/**
 * 让应用把文件字节读回来并算摘要。
 *
 * @returns 页面算出的 `{ 字节数, SHA-256 }`
 *
 * @remarks
 * 这一路走的是 renderer → preload → main → host 的**流式读取**，与面板那一路彼此独立。
 */
async function verifyEntry(page: Page, name: string): Promise<{ size: number; sha256: string }> {
  await page.locator(`[data-testid="storage-entry"][data-name="${name}"]`).getByTestId('storage-verify').click();
  const digest = page.getByTestId('storage-digest');
  await expect(digest).toContainText(name, { timeout: 180000 });
  const [, size, sha256] = ((await digest.textContent()) ?? '').split('·').map(part => part.trim());
  return { size: Number.parseInt(size, 10), sha256 };
}

/**
 * 从面板 Database 页读到的 `DesktopLaunch` 行里抽出全部 `startedAt`。
 *
 * @remarks
 * 面板把每行渲染成 JSON 风格的键值对，所以直接从正文里捞 ISO 时间戳即可。
 * 抽不到就是没读到数据 —— 调用方据此断言，比在这里兜底更早暴露问题。
 */
function startedAtValues(panelText: string): string[] {
  return [...panelText.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g)].map(match => match[0]);
}

test.describe('DevTools 面板在真实重启后读回同一实体与同一文件（US-904 阶段 D AC#52）', () => {
  test.describe.configure({ timeout: 420000 });

  test.beforeAll(() => {
    expect(
      existsSync(EXTENSION_DIST),
      `缺扩展构建产物：${EXTENSION_DIST}。先 pnpm nx build rxdb-devtools-extension`
    ).toBe(true);
    expect(existsSync(resolveExecutable()), '缺打包产物。先 pnpm nx run dev-rxdb-electron:electron-package-dir').toBe(
      true
    );
  });

  test('重启前后同一实体与同一文件，证据全程经过真实 extension/renderer/preload/main/host', async () => {
    // 目录在用例内部创建而不是 beforeAll：重试会重启 worker，放在外面则「这是第几次启动」
    // 取决于重试次数，`DesktopLaunch` 的行数断言随之失去意义。
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac52-userdata-'));
    const extensionDist = devtoolsExtensionCopy();
    const renderer = await serveRenderer();

    let firstStartedAt = '';
    let firstDigest = { size: 0, sha256: '' };

    try {
      const first = await launchApp(userDataDir, extensionDist, renderer.port);
      try {
        const page = await first.firstWindow();
        await expectDesktopBackend(page);
        await openStoragePage(page);
        await uploadGenerated(page, FILE_NAME, FILE_MIB);
        firstDigest = await verifyEntry(page, FILE_NAME);

        await attachPanel(first, PANEL_BUDGET_MS);

        // 实体：这一路证明面板读的是真库 —— `DesktopLaunch` 第一次启动只有一行。
        const launches = await readPanel(first, {
          hash: '#/database',
          clickText: 'DesktopLaunch',
          awaitPattern: 'startedAt',
          budgetMs: PANEL_BUDGET_MS
        });
        const before = startedAtValues(launches);
        expect(before, `面板 Database 页没读到 DesktopLaunch 数据：《${launches}》`).toHaveLength(1);
        firstStartedAt = before[0];

        // 文件：面板 Storage 页读的是 `StorageFileMeta` 实体，与上面同一条 v1 查询通道。
        const storage = await readPanel(first, {
          hash: '#/storage',
          awaitPattern: FILE_NAME,
          budgetMs: PANEL_BUDGET_MS
        });
        expect(storage, `面板 Storage 页没读到 ${FILE_NAME}：《${storage}》`).toContain(FILE_NAME);
      } finally {
        // 走正常关闭路径：让 'will-quit' 有机会 closeAll() 并 checkpoint WAL。
        await first.close();
      }

      // 中途取一次盘上真相：字节到底在不在原生文件后端的根里，大小对不对。
      const filePath = join(userDataDir, STORAGE_DIR, FILE_NAME);
      expect(existsSync(filePath), `内容不在 ${filePath}`).toBe(true);
      expect(statSync(filePath).size).toBe(FILE_MIB * BYTES_PER_MIB);

      // 独立第三方摘要：直接对盘上文件算一遍，和应用「读回来」算的那份比。
      // 两者一致，才说明流式读路径没有在中途替换或截断字节。
      const onDisk = createHash('sha256').update(readFileSync(filePath)).digest('hex');
      expect(firstDigest).toEqual({ size: FILE_MIB * BYTES_PER_MIB, sha256: onDisk });

      const second = await launchApp(userDataDir, extensionDist, renderer.port);
      try {
        const page = await second.firstWindow();
        await expectDesktopBackend(page);
        await attachPanel(second, PANEL_BUDGET_MS);

        // 同一实体：第二次启动追加了一行，但第一次那行必须**原样**还在。
        const launches = await readPanel(second, {
          hash: '#/database',
          clickText: 'DesktopLaunch',
          awaitPattern: firstStartedAt,
          budgetMs: PANEL_BUDGET_MS
        });
        const after = startedAtValues(launches);
        expect(after, `重启后面板没读到两次启动记录：《${launches}》`).toHaveLength(2);
        expect(after, '第一次启动的实体在重启后变了').toContain(firstStartedAt);

        // 同一文件：元数据行还在面板上，字节再读一遍仍与盘上摘要一致。
        const storage = await readPanel(second, {
          hash: '#/storage',
          awaitPattern: FILE_NAME,
          budgetMs: PANEL_BUDGET_MS
        });
        expect(storage, `重启后面板 Storage 页丢了 ${FILE_NAME}：《${storage}》`).toContain(FILE_NAME);

        await openStoragePage(page);
        expect(await verifyEntry(page, FILE_NAME)).toEqual(firstDigest);
      } finally {
        await second.close();
      }
    } finally {
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
      rmSync(extensionDist, { force: true, recursive: true });
    }
  });
});
