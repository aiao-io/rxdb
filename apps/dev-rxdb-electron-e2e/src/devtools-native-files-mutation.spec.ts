import { ElectronApplication, _electron as electron, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPanel, PANEL_BUDGET_MS, panelEvaluate, readPanel } from './devtools-panel-driver';
import { launchEnv, resolveDesktopDevExtension, resolveExecutable, serveRendererDist } from './packaged-app';

/**
 * US-904 阶段 D AC#47：面板对原生文件后端的写操作，逐字节落在插件专用根里。
 *
 * @remarks
 * **这条用例在 2026-09-04 之前无法存在。** `DEV_RXDB_DEVTOOLS_MUTATION` 那时只在主进程里
 * 被解析、校验然后丢掉，页内 connector 恒为库默认的 `mutationPolicy: 'omit'`——
 * 「显式允许写入」在桌面端表达不出来，写操作一律被 connector 拒掉。接线补齐后才谈得上验它。
 *
 * 判据取**盘上的字节**，不是面板上的提示。面板说「上传成功」只能证明它收到了一条成功响应；
 * 只有独立地对 `userData/rxdb-files/files/` 里的真实文件算一遍 SHA-256，才排除得掉
 * 「中途换了字节」「只写了元数据」「写进了别的目录」三种情况。这与 AC#52 用的是同一手法。
 *
 * 覆盖 AC#47 点名的边界：正常大小、**零字节**、新建目录、删除。
 * 最后一条 `readonly` 负对照是整组的判别力来源——没有它，前几条在「写入开关恒为 allow」
 * 的实现下同样会绿。
 *
 * ⚠️ 依赖打包产物。跑之前：
 *   pnpm nx run rxdb-devtools-extension:build-desktop-dev
 *   pnpm nx run dev-rxdb-electron:electron-package-dir
 */

/** 被检查窗口：`--serve` 起的 http renderer。 */
const INSPECTED = 'http://localhost' as const;

/**
 * 文件内容在 userData 下的相对位置。
 *
 * @remarks
 * 与 `devtools-restart-persistence.spec.ts` / `storage-persistence.spec.ts` 同源：
 * `rxdb-files/` 来自主进程 `desktop-file-bridge.ts` 的 `DESKTOP_STORAGE_DIRECTORY`，
 * `files/` 来自 demo 的 `DESKTOP_STORAGE_ROOT_DIR`——**面板的 `files` 领域与应用的 storage
 * 插件共用这同一个 `rootDir`**（见 `setup_rxdb_desktop.ts`），看到的才是同一批文件。
 */
const STORAGE_DIR = join('rxdb-files', 'files');

/** 本用例种下的三个名字；带 AC 号，排查时一眼知道是谁写的。 */
const DIR_NAME = 'ac47-dir';
const FILE_NAME = 'ac47-bytes.bin';
const EMPTY_NAME = 'ac47-empty.bin';

/** 正常大小那一份的字节数；小而不平凡，够跨越一次 base64 分块即可。 */
const FILE_BYTES = 64 * 1024;

function launchApp(userDataDir: string, port: number, mutation?: string): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`, '--serve', `--port=${String(port)}`],
    env: {
      ...launchEnv(),
      DEV_RXDB_DEVTOOLS: '1',
      DEV_RXDB_DEVTOOLS_EXTENSION: resolveDesktopDevExtension(),
      DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
      ...(mutation === undefined ? {} : { DEV_RXDB_DEVTOOLS_MUTATION: mutation })
    }
  });
}

/** 确定性内容：第 i 字节为 `i % 251`。质数步长让任何整块错位都改变摘要。 */
function deterministicBytes(size: number): Buffer {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < size; index++) bytes[index] = index % 251;
  return bytes;
}

/** 打开面板的 Files 页并等它列出目录。 */
async function openFilesPage(app: ElectronApplication): Promise<string> {
  return readPanel(app, {
    inspected: INSPECTED,
    hash: '#/opfs',
    awaitPattern: '项 \\(|此目录为空',
    budgetMs: PANEL_BUDGET_MS
  });
}

/**
 * 在面板里点一个按钮（按可见文本或 title 匹配）。
 *
 * @param scope - CSS 选择器，限定在哪一块里找；默认整个文档。
 *
 * @remarks
 * **对话框里的按钮必须传 `scope`。** 文件表每一行的删除按钮是 `title="删除"`，确认对话框里的
 * 是文本为「删除」的按钮，两者都能匹配上同一个 label；不限定范围时 `querySelectorAll` 按 DOM
 * 顺序先撞上行内那个，于是「确认删除」变成了「再点一次删除」，表征是文件始终不消失。
 */
async function clickPanelButton(app: ElectronApplication, label: string, scope = ''): Promise<boolean> {
  return panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const label = ${JSON.stringify(label)};
      const scope = ${JSON.stringify(scope)};
      const root = scope ? document.querySelector(scope) : document;
      if (!root) return false;
      const button = [...root.querySelectorAll('button')]
        .find(el => el.textContent.trim() === label || el.getAttribute('title') === label);
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`
  );
}

/** 经面板新建一个目录。 */
async function createDirectory(app: ElectronApplication, name: string): Promise<void> {
  expect(await clickPanelButton(app, '新建文件夹'), '找不到「新建文件夹」按钮').toBe(true);

  // Angular 的 `(input)` 绑定读的是事件里的 target.value：只赋值不派发事件，
  // 信号不会更新，「创建」会因为 `[disabled]="!newFolderName().trim()"` 一直是禁用的。
  const typed = await panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const input = document.querySelector('input[placeholder="文件夹名称"]');
      if (!input) return false;
      input.value = ${JSON.stringify(name)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`
  );
  expect(typed, '找不到新建文件夹对话框的输入框').toBe(true);
  expect(await clickPanelButton(app, '创建', '.modal-action'), '「创建」按钮不可点（名字没进信号？）').toBe(true);
}

/**
 * 经面板上传一份字节。
 *
 * @remarks
 * 走的是工具栏那个隐藏的 `<input type="file">`：构造 `DataTransfer` 塞进 `files` 再派发
 * `change`，与用户选文件走的是同一条 `uploadRequested` 出口。**不**去直接调组件方法——
 * 那样会跳过一段真实路径，验到的就不是用户实际走的那条。
 */
async function uploadThroughPanel(app: ElectronApplication, name: string, bytes: Buffer): Promise<boolean> {
  return panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const input = document.querySelector('input[type="file"]');
      if (!input) return false;
      const data = Uint8Array.from(${JSON.stringify([...bytes])});
      const transfer = new DataTransfer();
      transfer.items.add(new File([data], ${JSON.stringify(name)}, { type: 'application/octet-stream' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`
  );
}

/** 轮询盘上某个路径出现（或消失）。面板的写是异步的，落盘晚于按钮返回。 */
async function waitForPath(path: string, shouldExist: boolean, budgetMs = 30000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (existsSync(path) === shouldExist) return true;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return existsSync(path) === shouldExist;
}

test.describe('面板对原生文件后端的写操作逐字节落盘（US-904 阶段 D AC#47）', () => {
  test.describe.configure({ timeout: 420000 });

  test('显式允许写入：新建目录、正常大小与零字节上传、删除，盘上逐字节一致', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac47-allow-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port, 'allow');
    const root = join(userDataDir, STORAGE_DIR);

    try {
      await app.firstWindow();
      await attachPanel(app, INSPECTED);
      await openFilesPage(app);

      // ① 新建目录 —— 盘上真的多出一个目录。
      await createDirectory(app, DIR_NAME);
      expect(await waitForPath(join(root, DIR_NAME), true), `面板新建的目录没落盘：${join(root, DIR_NAME)}`).toBe(true);
      expect(statSync(join(root, DIR_NAME)).isDirectory()).toBe(true);

      // ② 正常大小上传 —— 盘上的字节由**测试自己**算摘要比对，不看面板的说法。
      const bytes = deterministicBytes(FILE_BYTES);
      expect(await uploadThroughPanel(app, FILE_NAME, bytes), '找不到上传用的 file input').toBe(true);
      const filePath = join(root, FILE_NAME);
      expect(await waitForPath(filePath, true), `面板上传的文件没落盘：${filePath}`).toBe(true);
      expect(statSync(filePath).size, '落盘字节数与上传的不一致').toBe(FILE_BYTES);
      expect(createHash('sha256').update(readFileSync(filePath)).digest('hex'), '落盘内容与上传的不一致').toBe(
        createHash('sha256').update(bytes).digest('hex')
      );

      // ③ 零字节 —— AC 点名的边界。空文件最容易被「写了个占位再补内容」的实现蒙混过去。
      expect(await uploadThroughPanel(app, EMPTY_NAME, Buffer.alloc(0))).toBe(true);
      const emptyPath = join(root, EMPTY_NAME);
      expect(await waitForPath(emptyPath, true), `零字节文件没落盘：${emptyPath}`).toBe(true);
      expect(statSync(emptyPath).size, '零字节文件的大小不是 0').toBe(0);

      // ④ 删除 —— 经面板删掉，盘上真的没了。
      await openFilesPage(app);
      const deleted = await panelEvaluate<boolean>(
        app,
        INSPECTED,
        `(() => {
          const row = [...document.querySelectorAll('tr')].find(el => el.textContent.includes(${JSON.stringify(FILE_NAME)}));
          const button = row?.querySelector('button[title="删除"]');
          if (!button) return false;
          button.click();
          return true;
        })()`
      );
      expect(deleted, `Files 页里找不到 ${FILE_NAME} 那一行的删除按钮`).toBe(true);
      // 限定在对话框动作区里找：行内那个删除按钮 title 也是「删除」，不限范围会再点一次它。
      expect(await clickPanelButton(app, '删除', '.modal-action'), '删除确认对话框没出现').toBe(true);
      expect(await waitForPath(filePath, false), `面板删除后文件仍在盘上：${filePath}`).toBe(true);
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });

  test('省略写入开关：同一套操作一个字节都不落盘', async () => {
    // 整组的判别力来源。没有这一条，「写入开关恒为 allow」的实现同样能让上面全绿。
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac47-readonly-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port);
    const root = join(userDataDir, STORAGE_DIR);

    try {
      await app.firstWindow();
      await attachPanel(app, INSPECTED);
      await openFilesPage(app);

      await createDirectory(app, DIR_NAME);
      await uploadThroughPanel(app, FILE_NAME, deterministicBytes(FILE_BYTES));

      // 给足与 allow 档同样的落盘预算再判「没有」——短预算下的「还没出现」不是「被拒绝」。
      expect(await waitForPath(join(root, DIR_NAME), false), '只读档下面板仍然建出了目录').toBe(true);
      expect(await waitForPath(join(root, FILE_NAME), false), '只读档下面板仍然写出了文件').toBe(true);
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
