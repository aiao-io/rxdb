import { ElectronApplication, Page, _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HIDE_WINDOW_ENV, launchEnv, resolveExecutable } from './packaged-app';

/**
 * ELEC-10：对 `electron-builder --dir` 真实产物的打包 smoke。
 *
 * @remarks
 * 这套用例的存在意义是「只有真实打包才能验到」的那三件事：
 * 生产 CSP 是否匹配、hash 路由能否完成首次导航、wa-sqlite 的 WASM 能否实例化。
 * 跑 dev server 一件都验不到 —— dev 是 `http://localhost`，
 * 生产是自定义协议 `app://-`，两者在 CSP、History API、存储配额上的行为都不同。
 *
 * ELEC-22：生产入口已从 `file:` 改为 `app://-`。`file:` 下 Angular 的 ESM 入口
 * 会被 Chromium 当跨域拒绝，应用根本起不来；即便放行也还有 fetch 不可用这堵墙。
 *
 * 相关静态门禁在 `apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts`，
 * 那套不依赖打包，先于本套件失败。
 */

/** 整个文件共用一个 Electron 实例：冷启动约数秒，每个用例重启不划算。 */
let app: ElectronApplication;
let page: Page;
let userDataDir: string;

/** 首屏加载期间收集到的控制台错误（含 CSP 违规）。 */
const consoleErrors: string[] = [];
/** 加载失败的资源。CSP 拦截与路径写错都会落在这里。 */
const failedRequests: string[] = [];
/** HTTP 404 响应（Playwright 不会把 4xx 算作 requestfailed）。 */
const notFoundUrls: string[] = [];

test.beforeAll(async () => {
  // 用独立的 userData 目录，避免复用开发时的库（旧 schema / 旧数据会让断言变得不可解释）。
  userDataDir = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-e2e-'));

  app = await electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`],
    env: launchEnv()
  });

  page = await app.firstWindow();
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => {
    failedRequests.push(`${request.failure()?.errorText ?? 'failed'} ${request.url()}`);
  });
  page.on('response', response => {
    if (response.status() === 404) notFoundUrls.push(response.url());
  });

  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  if (userDataDir) rmSync(userDataDir, { force: true, recursive: true });
});

test.describe('打包产物 smoke', () => {
  // ELEC-22：必须是 app://-。退回 file: 的话下面每一条都会挂，
  // 但报错会是一片 CORS，跟真正的原因对不上号 —— 所以先在这里把协议本身钉死。
  test('窗口以 app: 自定义协议加载产物', async () => {
    const url = page.url();
    expect(url).toMatch(/^app:\/\/-\//);
    expect(url).toContain('index.html');
  });

  // 窗口不显示是这套件的运行前提，不是锦上添花：一轮 e2e 要把产物连开三次，
  // 每次弹窗都会在 macOS 上抢走焦点与菜单栏。接线（launchEnv 写变量、主进程读变量）
  // 一旦漂移，其余用例全都照样绿 —— 症状只是窗口又开始弹，没人会因此去查代码。
  // 这条断言把「没弹窗」变成可判定的事实；显式 =0 时跳过，那是排查用的逃生口。
  test('窗口隐藏运行，不抢焦点', async () => {
    test.skip(process.env[HIDE_WINDOW_ENV] === '0', '本次显式要求显示窗口');
    const visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => w.isVisible()));
    expect(visible).toEqual([false]);
  });

  // handler 的越界判定（resolveAppAssetPath）有单测，但「注册没生效 / 根目录指错」
  // 只有真实产物能验：路径合法时必须 200，越界时必须 404 而不是读到文件。
  test('自定义协议只对外提供 browser 目录内的文件', async () => {
    const outcome = await page.evaluate(async () => {
      const probe = async (url: string): Promise<number> => (await fetch(url)).status;
      return {
        asset: await probe('app://-/index.html'),
        escaped: await probe('app://-/%2e%2e%2fapp.asar')
      };
    });
    expect(outcome.asset).toBe(200);
    expect(outcome.escaped).toBe(404);
    // 清理本测试故意触发的预期 404 日志，避免污染后续的「无 CSP/404」断言
    consoleErrors.length = 0;
    notFoundUrls.length = 0;
  });

  // 修复前：PathLocationStrategy 对 `file:` 调 replaceState 抛 SecurityError，
  // 首次导航中断 —— `<router-outlet>` 在但内容区永远空白。
  test('通配路由完成首次导航并渲染首页', async () => {
    await expect(page.locator('app-home-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Electron + Angular Demo');
    expect(page.url()).toContain('#/home');
  });

  // preload 的 contextBridge 是否真的注入到了打包产物里。
  test('渲染进程识别到 Electron 环境', async () => {
    await expect(page.getByText('运行在 Electron 环境')).toBeVisible();
  });

  // ELEC-10 三个「待实测」里的最后一个：WASM 能否实例化。
  // 这条同时守住 ELEC-11 —— 状态卡必须真的反映连接结果，而不是永久停在「连接中」。
  test('wa-sqlite WASM 实例化并完成连接', async () => {
    const status = page.getByTestId('rxdb-status');
    await expect(status).toHaveText(/已连接/, { timeout: 60000 });
    await expect(page.getByTestId('rxdb-error')).toBeHidden();
  });

  test('IPC 往返可用', async () => {
    await page.getByTestId('ipc-run').click();
    await expect(page.getByTestId('ipc-result')).toBeVisible();
    await expect(page.getByTestId('ipc-error')).toBeHidden();
  });

  // 放在最后：前面的用例已经把首屏、导航、WASM、IPC 都走了一遍，
  // 此时的错误集合才覆盖完整启动路径。
  test('启动全程无 CSP 违规与资源加载失败', () => {
    const cspViolations = consoleErrors.filter(text => text.includes('Content Security Policy'));
    // 排除其他测试故意探测的路径（路径穿越探测期望 404）
    const unexpected404s = notFoundUrls.filter(u => u !== 'app://-/%2e%2e%2fapp.asar');
    expect(cspViolations, `CSP 违规：\n${cspViolations.join('\n')}`).toEqual([]);
    expect(failedRequests, `资源加载失败：\n${failedRequests.join('\n')}`).toEqual([]);
    expect(unexpected404s, `非预期 HTTP 404：\n${unexpected404s.join('\n')}`).toEqual([]);
    expect(consoleErrors, `控制台错误：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
