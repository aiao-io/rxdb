import { _electron as electron, ElectronApplication, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPanel, PANEL_BUDGET_MS, panelEvaluate, readPanel } from './devtools-panel-driver';
import { awaitAnswer, installWireTap, postToConnector, requestFrame, waitForSessionId } from './devtools-wire-tap';
import { launchEnv, resolveDesktopDevExtension, resolveExecutable, serveRendererDist } from './packaged-app';

/**
 * US-904 阶段 D AC#49：Settings 的两条拒绝在**真实 wire** 上成立。
 *
 * @remarks
 * 面板侧那一半已于 2026-09-04 关闭（导出按钮常量禁用 + 停用理由），本文件补的是 wire 侧：
 * **绕开 UI** 强制发出命令之后，答案仍然是固定的拒绝码。
 *
 * 为什么必须绕开 UI：导出按钮是 `[disabled]="databaseExportDisabled"` 且该字段是常量 `true`
 * （`settings.page.ts`），面板上根本没有发出这条命令的出口。「点不到」不等于「发过去也会被拒」——
 * 后者才是 AC 要的性质，而它只能由一次真实的强制调用来证。注入口见 `devtools-wire-tap.ts`：
 * 用的是 connector 自己的 window 总线，不是另开的后门。
 *
 * 两条判据各自钉住一个不同的拒绝原因，不能互相替代：
 * - `settings.export` 是**已声明**的操作（descriptor 的 `operations` 含 `export`），
 *   所以它走到 provider 才被拒，答案固定为 `export_unsupported`；
 * - `settings.clear` **未声明**，在 descriptor 这一层就被拒，答案是 `provider_unsupported`。
 *
 * 档位取 `full` + `mutation: allow`：把授权这个变量**排除掉**。低档位下两条都会先撞在授权上，
 * 拿到的拒绝就与「未声明 / 不支持」无关了——那样的绿证明不了这条 AC。
 *
 * ⚠️ 依赖打包产物。跑之前：
 *   pnpm nx run rxdb-devtools-extension:build-desktop-dev
 *   pnpm nx run dev-rxdb-electron:electron-package-dir
 */

/** 被检查窗口：`--serve` 起的 http renderer。 */
const INSPECTED = 'http://localhost' as const;

/** 库文件在 userData 下的相对位置，与 `desktop-persistence.spec.ts` 同源。 */
const DATABASE_FILE = join('rxdb-data', 'desktop_demo@0_1.sqlite3');

/** Chromium 自有存储目录，与 `storage-persistence.spec.ts` 同源。 */
const WEB_STORAGE_DIRS = ['File System', 'IndexedDB'];

/** 一次强制调用的应答预算。拒绝是同步算出来的，不需要 40s 那种握手预算。 */
const ANSWER_BUDGET_MS = 15000;

function launchApp(userDataDir: string, port: number): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`, '--serve', `--port=${String(port)}`],
    env: {
      ...launchEnv(),
      DEV_RXDB_DEVTOOLS: '1',
      DEV_RXDB_DEVTOOLS_EXTENSION: resolveDesktopDevExtension(),
      DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
      DEV_RXDB_DEVTOOLS_MUTATION: 'allow'
    }
  });
}

/** 库文件与它的 WAL / SHM 的修改时间；文件不存在记 `null`。 */
function databaseStamps(userDataDir: string): Record<string, number | null> {
  const base = join(userDataDir, DATABASE_FILE);
  return Object.fromEntries(
    ['', '-wal', '-shm'].map(suffix => [
      suffix || 'db',
      existsSync(base + suffix) ? statSync(base + suffix).mtimeMs : null
    ])
  );
}

/** WebView 自有存储里的文件数；OPFS / IndexedDB 有没有被碰过看这个。 */
function webStorageEntries(userDataDir: string): string[] {
  return WEB_STORAGE_DIRS.flatMap(directory => {
    const root = join(userDataDir, directory);
    if (!existsSync(root)) return [];
    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => join(directory, entry.name));
  });
}

test.describe('Settings 的两条拒绝在真实 wire 上成立（US-904 阶段 D AC#49）', () => {
  test.describe.configure({ timeout: 420000 });

  test('强制导出得到 export_unsupported，未声明的清理得到 provider_unsupported，且不碰 OPFS/SQLite/WAL', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac49-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port);

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      // 必须在开 DevTools 之前装：HANDSHAKE 只发一次，晚装就录不到 sessionId。
      await installWireTap(page);

      await attachPanel(app, INSPECTED);
      const sessionId = await waitForSessionId(page, PANEL_BUDGET_MS);

      // 面板侧那一半的回归闸：按钮仍然是禁用的，停用理由仍在。
      const settings = await readPanel(app, {
        inspected: INSPECTED,
        hash: '#/settings',
        awaitPattern: '导出数据库',
        budgetMs: PANEL_BUDGET_MS
      });
      expect(settings, `Settings 页没渲染出来：《${settings}》`).toContain('导出已停用');
      const exportEnabled = await panelEvaluate<boolean>(
        app,
        INSPECTED,
        `(() => {
          const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '导出数据库');
          return !!button && !button.disabled;
        })()`
      );
      expect(exportEnabled, '导出按钮变成可点了——面板侧的禁用回退了').toBe(false);

      // 强制调用之前先取一份盘上快照，作为「host 侧一个动作都没发生」的对照。
      const stampsBefore = databaseStamps(userDataDir);
      const webStorageBefore = webStorageEntries(userDataDir);

      // ① 已声明但恒不支持 → export_unsupported
      await postToConnector(page, requestFrame(sessionId, 'ac49-export', 'settings', 'export'));
      expect(await awaitAnswer(page, 'ac49-export', ANSWER_BUDGET_MS)).toEqual({
        type: 'ERROR',
        code: 'export_unsupported'
      });

      // ② 未声明的操作 → provider_unsupported（拒绝发生在 descriptor 这一层）
      await postToConnector(page, requestFrame(sessionId, 'ac49-clear', 'settings', 'clear'));
      expect(await awaitAnswer(page, 'ac49-clear', ANSWER_BUDGET_MS)).toEqual({
        type: 'ERROR',
        code: 'provider_unsupported'
      });

      // 两次拒绝都必须在任何 host 动作之前返回：库文件、WAL、SHM 一个都没被动过，
      // WebView 自有存储也没有新增条目。这一条是 `read-only-settings.ts` 那个结构性主张
      // （工厂里根本没有可以读取任何东西的入口）在真实产物上的对照。
      expect(databaseStamps(userDataDir), '强制调用之后库文件/WAL/SHM 的修改时间变了').toEqual(stampsBefore);
      expect(webStorageEntries(userDataDir), 'WebView 自有存储被碰过').toEqual(webStorageBefore);
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
