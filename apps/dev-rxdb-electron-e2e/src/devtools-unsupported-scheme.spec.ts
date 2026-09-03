import { ElectronApplication, _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PANEL_BUDGET_MS, attachPanel, readPanel } from './devtools-panel-driver';
import { launchEnv, resolveDesktopDevExtension, resolveExecutable } from './packaged-app';

/**
 * US-906 AC#4：打包产物（`app://` 入口）下，面板给的是**原因**而不只是结论。
 *
 * @remarks
 * 这条 AC 验的是一个**永远不会成功**的路径，所以它的价值全在措辞上。开发者在打包态打开面板
 * 只会看到一句话，那句话要么让他知道「此路不通、去用 `--serve`」，要么让他去翻源码。
 *
 * 判据有三半，缺一条都不算：
 * 1. 状态仍是 `unsupported` —— **不许**为了「能连上」去放宽 `permissionPatternForUrl`。
 *    放宽会让状态伪装成 `granted`，面板从诚实的「不支持」变成永远转圈的
 *    「Waiting for RxDB connection...」，那正是仓库禁止的兜底。
 * 2. 文案点出**合法 scheme 集**（http / https / file / ftp），开发者据此判断自己这一页属不属于其中。
 * 3. 文案**不写死宿主**：同一个分支在浏览器的 `chrome://` 内部页上也会出现。
 *
 * 本用例故意用**带 host permission 的 dev 变体**扩展。用发布产物也会 `unsupported`，但那样
 * 就分不清「因为 scheme 不合法」还是「因为这份扩展本来就没有 host permission」——
 * 带上权限再失败，才把原因唯一地钉在 scheme 上。
 *
 * ⚠️ 依赖 `electron-package-dir` 的产物。跑之前：
 *   pnpm nx run rxdb-devtools-extension:build-desktop-dev
 *   pnpm nx run dev-rxdb-electron:electron-package-dir
 */

/** 被检查窗口：打包产物的生产入口，自定义 `app:` scheme。 */
const INSPECTED = 'app://' as const;

/** 拉起打包产物；**不带** `--serve`，renderer 因此走 `app://-/index.html`。 */
function launchApp(userDataDir: string, extensionDist: string): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`],
    env: {
      ...launchEnv(),
      DEV_RXDB_DEVTOOLS: '1',
      DEV_RXDB_DEVTOOLS_EXTENSION: extensionDist,
      DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
      DEV_RXDB_DEVTOOLS_MUTATION: 'allow'
    }
  });
}

test.describe('打包态 app:// 入口下面板说明不可注入的原因（US-906 AC#4）', () => {
  test.describe.configure({ timeout: 180000 });

  test('面板停在 unsupported 并点出合法 scheme 集，措辞不写死任何宿主', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac906-userdata-'));
    const app = await launchApp(userDataDir, resolveDesktopDevExtension());

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      expect(page.url(), '这条用例的前提就是 renderer 走 app:// —— 前提不成立就别往下断言').toContain('app://');

      await attachPanel(app, INSPECTED);

      // 任意一页都会被守卫拦在同一个分支上；用 Database 页是因为它在「连上」时的正文最好认。
      const panel = await readPanel(app, {
        inspected: INSPECTED,
        hash: '#/database',
        awaitPattern: '不支持扩展注入',
        budgetMs: PANEL_BUDGET_MS
      });

      // ① 结论仍在，且**没有**掉进「已授权但永远转圈」那个假象里。
      expect(panel, `面板正文：《${panel}》`).toContain('不支持扩展注入');
      expect(panel, 'app:// 下不该出现等待连接态 —— 那说明状态被伪装成了 granted').not.toContain(
        'Waiting for RxDB connection'
      );

      // ② 原因给全：合法 scheme 集逐个列出。
      for (const scheme of ['http', 'https', 'file', 'ftp']) {
        expect(panel, `面板没点出 ${scheme}：《${panel}》`).toContain(scheme);
      }

      // ③ 措辞对三宿主都成立。
      for (const host of ['Electron', 'Tauri']) {
        expect(panel, `面板文案写死了宿主 ${host}：《${panel}》`).not.toContain(host);
      }
    } finally {
      await app.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
