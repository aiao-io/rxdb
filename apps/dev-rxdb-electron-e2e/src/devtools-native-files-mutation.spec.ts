import { _electron as electron, ElectronApplication, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPanel, PANEL_BUDGET_MS, panelEvaluate, readPanel } from './devtools-panel-driver';
import { awaitAnswer, installWireTap, postToConnector, requestFrame, waitForSessionId } from './devtools-wire-tap';
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

/**
 * 本 demo 给原生文件 provider 配的 `maxTransferBytes`。
 *
 * @remarks
 * 与 `apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts` 里传的
 * `DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT`（1 GiB）一致。写死而不 import 的理由同本目录其余常量；
 * 漂了也不会静默——`+1` 那条请求会变成一次合法声明，于是拿不到 `transfer_size_exceeded` 而红。
 */
const MAX_TRANSFER_BYTES = 1_073_741_824;

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

/** 存储根下的全部条目（递归）；目录不存在按空计。 */
function storageEntries(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true }).map(String);
}

/**
 * 经面板下载一个文件，并在**面板帧里**算出它收到的字节的摘要。
 *
 * @returns `{ size, sha256 }`；预算内没拿到字节时为 `null`。
 *
 * @remarks
 * 面板把字节交给用户走的是一次性 object URL + `<a download>`（`v2-file-channel.ts`），
 * 而 DevTools 里的下载落到哪、叫什么名字都不受用例控制。所以这里在**它交给浏览器之前**
 * 把 Blob 截下来算摘要——量的就是「经 wire 回到面板的那份字节」，比事后去翻下载目录
 * 少一整段与被测物无关的不确定性。
 *
 * 补回原始实现而不是让它一直被替换：patch 只活到本次断言结束，套件不留下一个被改过的全局。
 */
async function downloadThroughPanel(
  app: ElectronApplication,
  name: string
): Promise<{ size: number; sha256: string } | null> {
  const armed = await panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const original = URL.createObjectURL.bind(URL);
      window.__AC47_DOWNLOAD__ = null;
      URL.createObjectURL = blob => {
        void blob.arrayBuffer()
          .then(buffer => crypto.subtle.digest('SHA-256', buffer).then(digest => ({ buffer, digest })))
          .then(({ buffer, digest }) => {
            window.__AC47_DOWNLOAD__ = {
              size: buffer.byteLength,
              sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
            };
          });
        URL.createObjectURL = original;
        return original(blob);
      };
      return true;
    })()`
  );
  if (!armed) throw new Error('没能在面板帧里替换 URL.createObjectURL —— 面板没加载？');

  const clicked = await panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const row = [...document.querySelectorAll('tr')].find(el => el.textContent.includes(${JSON.stringify(name)}));
      const button = row?.querySelector('button[title="下载"]');
      if (!button) return false;
      button.click();
      return true;
    })()`
  );
  if (!clicked) {
    const rows = await panelEvaluate<string>(
      app,
      INSPECTED,
      `(() => [...document.querySelectorAll('tr')].map(el => el.textContent.replace(/\\s+/g, ' ').trim()).join(' | '))()`
    );
    throw new Error(`Files 页里点不到 ${name} 那一行的下载按钮；当前行：${rows || '(一行都没有)'}`);
  }

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const seen = await panelEvaluate<{ size: number; sha256: string } | null>(
      app,
      INSPECTED,
      `(() => window.__AC47_DOWNLOAD__ ?? null)()`
    );
    if (seen !== null) return seen;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return null;
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

      // ④ 下载 —— 字节真的经 wire 回到了面板。
      // 先刷一次列表：上面三步之后面板上的目录项还是操作前那一份，行找不到会被误报成「下载没拿到字节」。
      await openFilesPage(app);
      // 判据取**面板拿到的 Blob 的摘要**，与盘上文件独立算出的摘要比对：面板显示「下载成功」
      // 只证明它收到了一条成功应答，此前那条路正是「应答成功但一个字节都没到」。
      const downloaded = await downloadThroughPanel(app, FILE_NAME);
      expect(downloaded, `面板下载没拿到字节（Files 页里找不到 ${FILE_NAME} 的下载按钮？）`).not.toBeNull();
      expect(downloaded?.size, '面板收到的字节数与盘上不一致').toBe(FILE_BYTES);
      expect(downloaded?.sha256, '面板收到的内容与盘上不一致').toBe(
        createHash('sha256').update(readFileSync(filePath)).digest('hex')
      );

      // ⑤ 删除 —— 经面板删掉，盘上真的没了。
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

  test('面板显示 files provider 的 runtime，越限上传被拒且盘上无半写', async () => {
    // AC#47 的两个保留项：`runtime: electron` 的显示，以及「越限 / 失败时无半写文件或孤儿 metadata」。
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac47-limits-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port, 'allow');
    const root = join(userDataDir, STORAGE_DIR);

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      await installWireTap(page);
      await attachPanel(app, INSPECTED);
      const sessionId = await waitForSessionId(page, PANEL_BUDGET_MS);

      // ① runtime 显示。取自握手里的 descriptor，不是面板按 URL 猜的。
      const files = await openFilesPage(app);
      expect(files, `Files 页没有显示来源 runtime：《${files}》`).toContain('electron');
      expect(files, 'Files 页把别的 runtime 也印出来了').not.toContain('tauri');

      const beforeEntries = storageEntries(root);

      // ② 越限：声明一个超过 provider `maxTransferBytes` 的 size。
      // 判据是**声明值就被拒**——真去传 1 GiB 只会把用例变成一次带宽测试，而边界检查
      // （`native-files-provider.ts` 的 `isSafeIntegerInRange(params.size, 0, maxTransferBytes)`）
      // 在收到第一个 chunk 之前就该拦下它。
      await postToConnector(
        page,
        requestFrame(sessionId, 'ac47-oversize', 'files', 'upload', {
          transferId: 'ac47-oversize-transfer',
          path: '/',
          name: 'ac47-oversize.bin',
          size: MAX_TRANSFER_BYTES + 1
        })
      );
      expect(await awaitAnswer(page, 'ac47-oversize', 30000)).toEqual({
        type: 'ERROR',
        code: 'transfer_size_exceeded'
      });

      // ③ 无半写：被拒之后存储根下既没有新文件，也没有未提交的 `.rxdb-tmp` 孤儿。
      // 给足与正常上传同样的落盘预算再判「没有」。
      await new Promise(resolve => setTimeout(resolve, 3000));
      const afterEntries = storageEntries(root);
      expect(afterEntries, '越限被拒之后存储根下多出了东西').toEqual(beforeEntries);
      expect(
        afterEntries.filter(entry => entry.endsWith('.rxdb-tmp')),
        '越限被拒之后留下了未提交的临时文件'
      ).toEqual([]);
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
