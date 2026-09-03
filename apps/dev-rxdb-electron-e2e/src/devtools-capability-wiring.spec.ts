import { _electron as electron, ElectronApplication, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPanel, PANEL_BUDGET_MS, readPanel } from './devtools-panel-driver';
import { launchEnv, resolveDesktopDevExtension, resolveExecutable, serveRendererDist } from './packaged-app';

/**
 * US-904 阶段 D AC#45 / AC#49：本次运行的授权配置真的到得了页内 connector。
 *
 * @remarks
 * **这条 e2e 补的是一个此前根本不成立的接线。** `DEV_RXDB_DEVTOOLS_CAPABILITY` 与
 * `DEV_RXDB_DEVTOOLS_MUTATION` 原先只在主进程里被解析、校验，然后**丢掉**：没有任何一条
 * 路把它们送到渲染进程，页内 connector 恒为库默认的 `capabilities: 'full'` +
 * `mutationPolicy: 'omit'`。表征是两条开关看着像在工作、实际对授权毫无影响——
 * 「显式允许写入」在桌面端表达不出来，AC#47 因此一直没法验。
 *
 * 现在的链路：main 解析 env → `devToolsLaunchArguments()` 编码成 `additionalArguments`
 * → preload 同步读 `process.argv` 并 `exposeInMainWorld` → 渲染进程 `setup_rxdb_desktop.ts`
 * 展开进 `getDevToolsConnector()`。用启动参数而不是 IPC 是因为时序：connector 是应用
 * bootstrap 时建的一次性全局单例，异步 IPC 到不了那么早。
 *
 * 判据取**面板上看得见的差别**，而不是去读渲染进程里的某个变量——后者只能证明值传到了，
 * 证不到它真的参与了授权判定。`capabilities: 'none'` 下 connector 连事件订阅都不建立
 * （见 connector 的 `#subscribeToEvents` 首行），面板因此永远拿不到实体与事件。
 *
 * ⚠️ 依赖打包产物。跑之前：
 *   pnpm nx run rxdb-devtools-extension:build-desktop-dev
 *   pnpm nx run dev-rxdb-electron:electron-package-dir
 */

/** 被检查窗口：`--serve` 起的 http renderer，桌面端唯一能被扩展注入的形态。 */
const INSPECTED = 'http://localhost' as const;

/** 一次运行的四个开关；`capability` 与 `mutation` 由用例给。 */
function launchApp(
  userDataDir: string,
  port: number,
  capability: string,
  mutation?: string
): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`, '--serve', `--port=${String(port)}`],
    env: {
      ...launchEnv(),
      DEV_RXDB_DEVTOOLS: '1',
      DEV_RXDB_DEVTOOLS_EXTENSION: resolveDesktopDevExtension(),
      DEV_RXDB_DEVTOOLS_CAPABILITY: capability,
      // 省略即只读：这正是 `resolveDevToolsDevConfig()` 的语义，别在这里补默认值。
      ...(mutation === undefined ? {} : { DEV_RXDB_DEVTOOLS_MUTATION: mutation })
    }
  });
}

/** 读渲染进程里那份由 preload 挂上的运行配置。 */
function runtimeConfig(app: ElectronApplication, port: number): Promise<unknown> {
  return app.evaluate(
    async ({ BrowserWindow }, origin) => {
      const win = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith(origin));
      if (!win) throw new Error('找不到 http renderer 窗口');
      return win.webContents.executeJavaScript('globalThis.__aiaoRxdbDevToolsConfig__ ?? null');
    },
    `http://localhost:${String(port)}`
  );
}

test.describe('DevTools 授权配置从 env 一路到达页内 connector（US-904 阶段 D AC#45/#49）', () => {
  test.describe.configure({ timeout: 300000 });

  test('capability=full + mutation=allow：配置到位，面板读到真实实体', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac45-full-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port, 'full', 'allow');

    try {
      await app.firstWindow();

      // ① 配置真的到了渲染进程，且**逐字**是本次运行给的那一份。
      expect(await runtimeConfig(app, renderer.port)).toEqual({ capability: 'full', mutationPolicy: 'allow' });

      // ② 面板侧看得见的后果：握手完成、Database 页读到真实实体行。
      await attachPanel(app, INSPECTED);
      const panel = await readPanel(app, {
        inspected: INSPECTED,
        hash: '#/database',
        clickText: 'DesktopLaunch',
        awaitPattern: 'startedAt',
        budgetMs: PANEL_BUDGET_MS
      });
      expect(panel, `full 档下面板没读到实体：《${panel}》`).toContain('startedAt');
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });

  test('省略 mutation 即只读：配置如实报出 omit，不被补成 allow', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac45-readonly-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port, 'readonly');

    try {
      await app.firstWindow();
      expect(await runtimeConfig(app, renderer.port)).toEqual({ capability: 'readonly', mutationPolicy: 'omit' });
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });

  test('capability=none：connector 不建事件订阅，面板拿不到实体', async () => {
    // 这条是整组用例的**判别力来源**。前两条只证明「值传到了」，证不到它参与授权判定；
    // `none` 档下 connector 的 `#subscribeToEvents` 首行就返回，面板因此永远读不到数据。
    // 接线断掉时这条会由红转绿（退回默认的 `full`），所以它同时是回归闸。
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac45-none-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port, 'none');

    try {
      await app.firstWindow();
      expect(await runtimeConfig(app, renderer.port)).toEqual({ capability: 'none', mutationPolicy: 'omit' });

      await attachPanel(app, INSPECTED);
      // 给足与 full 档同样的预算再判「没有」——短预算下的「没读到」只能说明还没到。
      const panel = await readPanel(app, {
        inspected: INSPECTED,
        hash: '#/database',
        clickText: 'DesktopLaunch',
        awaitPattern: 'startedAt',
        budgetMs: PANEL_BUDGET_MS
      });
      expect(panel, `none 档下面板不该读到任何实体数据：《${panel}》`).not.toContain('startedAt');
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });

  test('AC#49：Settings 页导出常量禁用，并给出停用理由', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac49-settings-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port, 'full', 'allow');

    try {
      await app.firstWindow();
      await attachPanel(app, INSPECTED);

      const panel = await readPanel(app, {
        inspected: INSPECTED,
        hash: '#/settings',
        awaitPattern: '导出数据库',
        budgetMs: PANEL_BUDGET_MS
      });

      // 面板不是「按钮长得像能点」而是**常量禁用**，且说明了为什么停用。
      expect(panel, `Settings 页没渲染出来：《${panel}》`).toContain('导出数据库');
      expect(panel).toContain('导出已停用');

      const exportButtonDisabled = await app.evaluate(async ({ BrowserWindow }, origin) => {
        const win = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith(origin));
        const frame = win?.webContents.devToolsWebContents?.mainFrame.framesInSubtree.find(candidate =>
          candidate.url.includes('/panel.html')
        );
        if (!frame) throw new Error('找不到面板帧');
        return frame.executeJavaScript(
          `(() => {
            const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '导出数据库');
            return button === undefined ? null : button.disabled;
          })()`
        );
      }, INSPECTED);

      expect(exportButtonDisabled, '导出按钮必须是禁用的').toBe(true);
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
