import { ElectronApplication, Page, _electron as electron, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPanel, PANEL_BUDGET_MS, readPanel } from './devtools-panel-driver';
import { launchEnv, resolveDesktopDevExtension, resolveExecutable, serveRendererDist } from './packaged-app';

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
 * inspected page 的 origin），并用**桌面端调试变体**（US-906 AC#1，`build-desktop-dev`）提供那条
 * 静态 host permission。这与阶段 A 对 `apps/rxdb-devtools-extension-e2e` 记录的 variance 同源、
 * 同形态：补的是**宿主**，不是被测物。发布 manifest 保持 `optional_host_permissions`，由
 * `apps/rxdb-devtools-extension/src/manifest.config.spec.ts` 守住。
 *
 * 第二条约束同样来自实测：**Electron 没有 `chrome.permissions` 命名空间**，`optional_host_permissions`
 * 的授权集恒为空，所以 Electron 上必须是**静态** host permission，运行时请求那条路走不通。
 *
 * US-906 AC#3 之前，这条静态权限来自本文件里一份跑完即删的 dist 临时副本。收敛掉是因为那份副本
 * **只有 e2e 有**：开发者照着 README 走同一条路会卡在「不支持扩展注入」，而套件是绿的，
 * 于是没有任何信号指向真正的缺口。现在两边加载的是同一个 `dist-desktop-dev/`。
 *
 * ⚠️ 依赖 `electron-package-dir` 的产物（electron-builder 需联网下载 Electron 发行包）。跑之前：
 *   pnpm nx run rxdb-devtools-extension:build-desktop-dev
 *   pnpm nx run dev-rxdb-electron:electron-package-dir
 */

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

/** 被检查窗口：`--serve` 起的 http renderer，桌面端唯一能被扩展注入的形态。 */
const INSPECTED = 'http://localhost' as const;

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
 * 面板把每行渲染成 `字段名 类型 值` 的三元组（正文里形如 `startedAt string 2026-…Z`），
 * 所以必须**带字段名**匹配：`createdAt` / `updatedAt` 与 `startedAt` 同为 ISO 时间戳，
 * 只捞时间戳会把一行数成三条。抽不到就是没读到数据 —— 调用方据此断言，比在这里兜底更早暴露问题。
 */
function startedAtValues(panelText: string): string[] {
  const rows = panelText.matchAll(/\bstartedAt\s+string\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/g);
  return [...rows].map(match => match[1]);
}

/** 要跨重启比对的两件证据。 */
interface RestartEvidence {
  /** 第一次启动写下的 `DesktopLaunch.startedAt`。 */
  readonly startedAt: string;
  /** 应用把文件字节读回来算出的 `{ 字节数, SHA-256 }`。 */
  readonly digest: { size: number; sha256: string };
}

/**
 * 第一次启动：种下实体与文件，经真实面板各读一遍。
 *
 * @returns 供第二次启动比对的证据
 */
async function seedAndRead(userDataDir: string, extensionDist: string, port: number): Promise<RestartEvidence> {
  const app = await launchApp(userDataDir, extensionDist, port);
  try {
    const page = await app.firstWindow();
    await expectDesktopBackend(page);
    await openStoragePage(page);
    await uploadGenerated(page, FILE_NAME, FILE_MIB);
    const digest = await verifyEntry(page, FILE_NAME);

    await attachPanel(app, INSPECTED);

    // 实体：这一路证明面板读的是真库 —— `DesktopLaunch` 第一次启动只有一行。
    const launches = await readPanel(app, {
      inspected: INSPECTED,
      hash: '#/database',
      clickText: 'DesktopLaunch',
      awaitPattern: 'startedAt',
      budgetMs: PANEL_BUDGET_MS
    });
    const seen = startedAtValues(launches);
    expect(seen, `面板 Database 页没读到 DesktopLaunch 数据：《${launches}》`).toHaveLength(1);

    // 文件：面板 Storage 页读的是 `StorageFileMeta` 实体，与上面同一条 v1 查询通道。
    const storage = await readPanel(app, {
      inspected: INSPECTED,
      hash: '#/storage',
      awaitPattern: FILE_NAME,
      budgetMs: PANEL_BUDGET_MS
    });
    expect(storage, `面板 Storage 页没读到 ${FILE_NAME}：《${storage}》`).toContain(FILE_NAME);

    return { startedAt: seen[0], digest };
  } finally {
    // 走正常关闭路径：让 'will-quit' 有机会 closeAll() 并 checkpoint WAL。
    await app.close();
  }
}

/** 第二次启动：同一 userData 重新连接，逐项比对第一次的证据。 */
async function reconnectAndCompare(
  userDataDir: string,
  extensionDist: string,
  port: number,
  expected: RestartEvidence
): Promise<void> {
  const app = await launchApp(userDataDir, extensionDist, port);
  try {
    const page = await app.firstWindow();
    await expectDesktopBackend(page);
    await attachPanel(app, INSPECTED);

    // 同一实体：第二次启动追加了一行，但第一次那行必须**原样**还在。
    const launches = await readPanel(app, {
      inspected: INSPECTED,
      hash: '#/database',
      clickText: 'DesktopLaunch',
      awaitPattern: expected.startedAt,
      budgetMs: PANEL_BUDGET_MS
    });
    const seen = startedAtValues(launches);
    expect(seen, `重启后面板没读到两次启动记录：《${launches}》`).toHaveLength(2);
    expect(seen, '第一次启动的实体在重启后变了').toContain(expected.startedAt);

    // 同一文件：元数据行还在面板上，字节再读一遍仍与第一次一致。
    const storage = await readPanel(app, {
      inspected: INSPECTED,
      hash: '#/storage',
      awaitPattern: FILE_NAME,
      budgetMs: PANEL_BUDGET_MS
    });
    expect(storage, `重启后面板 Storage 页丢了 ${FILE_NAME}：《${storage}》`).toContain(FILE_NAME);

    await openStoragePage(page);
    expect(await verifyEntry(page, FILE_NAME)).toEqual(expected.digest);
  } finally {
    await app.close();
  }
}

test.describe('DevTools 面板在真实重启后读回同一实体与同一文件（US-904 阶段 D AC#52）', () => {
  test.describe.configure({ timeout: 420000 });

  test.beforeAll(() => {
    // 缺产物时 resolveDesktopDevExtension() 自带补救命令；这里只要它不抛。
    resolveDesktopDevExtension();
    expect(existsSync(resolveExecutable()), '缺打包产物。先 pnpm nx run dev-rxdb-electron:electron-package-dir').toBe(
      true
    );
  });

  test('重启前后同一实体与同一文件，证据全程经过真实 extension/renderer/preload/main/host', async () => {
    // 目录在用例内部创建而不是 beforeAll：重试会重启 worker，放在外面则「这是第几次启动」
    // 取决于重试次数，`DesktopLaunch` 的行数断言随之失去意义。
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac52-userdata-'));
    const extensionDist = resolveDesktopDevExtension();
    const renderer = await serveRendererDist(createServer);

    try {
      const evidence = await seedAndRead(userDataDir, extensionDist, renderer.port);

      // 中途取一次盘上真相：字节到底在不在原生文件后端的根里，大小对不对。
      const filePath = join(userDataDir, STORAGE_DIR, FILE_NAME);
      expect(existsSync(filePath), `内容不在 ${filePath}`).toBe(true);
      expect(statSync(filePath).size).toBe(FILE_MIB * BYTES_PER_MIB);

      // 独立第三方摘要：直接对盘上文件算一遍，和应用「读回来」算的那份比。
      // 两者一致，才说明流式读路径没有在中途替换或截断字节。
      const onDisk = createHash('sha256').update(readFileSync(filePath)).digest('hex');
      expect(evidence.digest).toEqual({ size: FILE_MIB * BYTES_PER_MIB, sha256: onDisk });

      await reconnectAndCompare(userDataDir, extensionDist, renderer.port, evidence);
    } finally {
      // 扩展产物是构建输出、不是本用例造的临时目录 —— 只删自己造的那个。
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
