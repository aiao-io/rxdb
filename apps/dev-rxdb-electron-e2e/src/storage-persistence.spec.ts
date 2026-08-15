import { ElectronApplication, Locator, Page, _electron as electron, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { launchEnv, resolveExecutable } from './packaged-app';

/**
 * US-504 AC#1 / AC#3 / AC#5：文件内容与库文件同属一个备份域，且崩溃不留半写文件。
 *
 * @remarks
 * 这三条只有真实打包产物验得到：`--serve` 下 userData 落在开发目录，单测里 host 与
 * renderer 同在一个 Node 进程 —— 两者都验不到「整个进程被杀掉、重新拉起，内容还在」。
 *
 * 静态门禁（testid 是否还在、渲染进程有没有误导入 `/host`）在
 * `apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts`，那套不依赖打包，先于本套件失败。
 */

/**
 * 文件内容在 userData 下的相对位置。
 *
 * @remarks
 * 由两段拼成，各有出处：
 * - `rxdb-files/` —— `desktop-file-bridge.ts` 的 `DESKTOP_STORAGE_DIRECTORY`，与 `rxdb-data/` 同级
 * - `files/` —— demo 传给插件的 `DESKTOP_STORAGE_ROOT_DIR`（`desktop-database.service.ts`）
 *
 * 写死而不 import：本文件跑在打包产物之外的纯 Node 进程里，import 这两个常量要把
 * Electron 主进程与 `@aiao/rxdb-plugin-storage` 一起拖进 e2e 的依赖里。写死也不会悄悄放行 ——
 * 值一旦对不上，下面「物理文件在不在」的断言直接红。
 */
const STORAGE_DIR = join('rxdb-files', 'files');

/**
 * Chromium 自己在 userData 下用的存储目录。
 *
 * @remarks
 * US-504 的核心主张是「文件内容不再落在 WebView 的存储里」。这两个目录的体积**不随上传增长**
 * 就是该主张的反证据 —— 内容真要写进了 OPFS，它必然出现在 `File System/` 下。
 */
const WEB_STORAGE_DIRS = ['File System', 'IndexedDB'];

/** 一 MiB 的字节数。 */
const BYTES_PER_MIB = 1024 * 1024;

/**
 * 与 `storage.page.ts` 同一个公式，独立实现一遍。
 *
 * @remarks
 * 故意不共享代码：共享后「写进去的和读回来的一致」就退化成页面自己跟自己比，
 * 生成端与期望端一起错也照样绿。两侧各算一遍，才是真的在验字节。
 */
const patternByte = (index: number, seed: number): number => (index * 31 + seed) & 0xff;

/** 与 `storage.page.ts` 同一个种子折叠方式。 */
const seedOf = (name: string): number => {
  let seed = 0;
  for (const character of name) seed = (seed * 33 + character.charCodeAt(0)) & 0xff;
  return seed;
};

/** 复算某个 (名字, 大小) 应有的 SHA-256，小写十六进制。 */
function expectedSha256(name: string, sizeBytes: number): string {
  const seed = seedOf(name);
  const bytes = Buffer.alloc(sizeBytes);
  for (let index = 0; index < sizeBytes; index++) bytes[index] = patternByte(index, seed);
  return createHash('sha256').update(bytes).digest('hex');
}

/** 递归求目录字节数；目录不存在按 0 计。 */
function directorySize(directory: string): number {
  if (!existsSync(directory)) return 0;
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    total += statSync(join(entry.parentPath, entry.name)).size;
  }
  return total;
}

/** WebView 自有存储（OPFS / IndexedDB）当前占用的总字节数。 */
const webStorageSize = (userDataDir: string): number =>
  WEB_STORAGE_DIRS.reduce((total, directory) => total + directorySize(join(userDataDir, directory)), 0);

/** 列出存储根下所有未提交的临时文件（host 写入用的 `.<uuid>.rxdb-tmp`）。 */
function temporaryFiles(userDataDir: string): string[] {
  const root = join(userDataDir, STORAGE_DIR);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.rxdb-tmp'))
    .map(entry => join(entry.parentPath, entry.name));
}

/** 拉起打包产物；调用方负责关闭或杀死它。 */
function launchPackagedApp(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`],
    env: launchEnv()
  });
}

/**
 * 打开 storage 页并等它走到终态。
 *
 * @throws 初始化失败时抛出，并带上页面上的真实原因
 */
async function openStoragePage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  // 走 hash 而不是点菜单：侧边栏折叠状态下菜单项只剩图标，点击目标随样式漂移；
  // 路由本身用的就是 withHashLocation，改 hash 与用户点击等价。
  await page.evaluate(() => {
    window.location.hash = '#/storage';
  });

  const status = page.getByTestId('storage-status');
  // 先等它离开「初始化中」而不是直接等条目列表：失败态下列表照样渲染（空的），
  // 直接等条目只会超时在一句「找不到元素」上，把真正的原因盖掉。
  await expect(status).not.toHaveText(/初始化中/, { timeout: 60000 });
  const failure = page.getByTestId('storage-error');
  if (await failure.count()) throw new Error(`文件存储初始化失败：${await failure.textContent()}`);
  await expect(status).toHaveText(/就绪/);
}

/** 按逻辑名定位列表里的条目行。 */
const entryRow = (page: Page, name: string): Locator =>
  page.locator(`[data-testid="storage-entry"][data-name="${name}"]`);

/** 断言页面上没有挂着失败文案。 */
async function expectNoFailure(page: Page): Promise<void> {
  const failure = page.getByTestId('storage-error');
  if (await failure.count()) throw new Error(`操作失败：${await failure.textContent()}`);
}

/**
 * 就地生成指定大小的确定性文件并上传。
 *
 * @remarks
 * 等的是「条目出现在列表里」而不是忙碌标记消失：后者在小文件上可能在 Playwright
 * 观察到之前就翻回去了，等它等于在等一个可能永不出现的状态。
 */
async function uploadGenerated(page: Page, name: string, sizeMib: number): Promise<void> {
  await page.getByTestId('storage-generate-name').fill(name);
  await page.getByTestId('storage-generate-size').fill(String(sizeMib));
  await page.getByTestId('storage-generate-upload').click();
  await expect(entryRow(page, name)).toHaveCount(1, { timeout: 180000 });
  await expectNoFailure(page);
}

/** 读回文件并返回页面算出的 `{ 字节数, SHA-256 }`。 */
async function verifyEntry(page: Page, name: string): Promise<{ size: number; sha256: string }> {
  await entryRow(page, name).getByTestId('storage-verify').click();
  const digest = page.getByTestId('storage-digest');
  await expect(digest).toContainText(name, { timeout: 180000 });
  await expectNoFailure(page);

  const [, size, sha256] = ((await digest.textContent()) ?? '').split('·').map(part => part.trim());
  return { size: Number.parseInt(size, 10), sha256 };
}

/** 当前目录下的条目名，按字典序。 */
async function entryNames(page: Page): Promise<string[]> {
  const names = await page
    .getByTestId('storage-entry')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-name') ?? ''));
  return names.sort();
}

test.describe('打包产物的本地文件存储', () => {
  test('重启与整目录拷贝后内容逐字节不变，且不落在 WebView 存储里', async () => {
    test.setTimeout(300000);
    // 目录在用例内部创建而不是 beforeAll：重试会重启 worker，放在外面则「这是第几次启动」
    // 取决于重试次数，断言随之失去意义。
    const userDataDir = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-storage-'));
    const copiedDir = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-storage-copy-'));

    try {
      const first = await launchPackagedApp(userDataDir);
      let webStorageBefore = 0;
      try {
        const page = await first.firstWindow();
        await openStoragePage(page);
        webStorageBefore = webStorageSize(userDataDir);

        await uploadGenerated(page, 'alpha.bin', 8);
        await page.getByTestId('storage-directory-name').fill('nested');
        await page.getByTestId('storage-create-directory').click();
        await expect(entryRow(page, 'nested')).toHaveCount(1);
        await entryRow(page, 'nested').getByTestId('storage-enter').click();
        await expect(page.getByTestId('storage-path')).toHaveText('/nested');
        await uploadGenerated(page, 'beta.bin', 1);
      } finally {
        // 走正常关闭路径：让 'will-quit' 有机会 closeAll()。这一条验的是常规重启，
        // 崩溃语义留给下面那条用例。
        await first.close();
      }

      // AC#1：内容在应用数据目录里，尺寸精确 —— 差一个字节都说明分帧写出了问题。
      const alphaPath = join(userDataDir, STORAGE_DIR, 'alpha.bin');
      const betaPath = join(userDataDir, STORAGE_DIR, 'nested', 'beta.bin');
      expect(existsSync(alphaPath), `内容不在 ${alphaPath}`).toBe(true);
      expect(statSync(alphaPath).size).toBe(8 * BYTES_PER_MIB);
      expect(statSync(betaPath).size).toBe(BYTES_PER_MIB);

      // AC#1：8 MiB 写进去了，WebView 自有存储却基本没长 —— 内容确实没走 OPFS。
      // 阈值取上传量的四分之一而不是零：wa-sqlite 那个实例照常在 OPFS 里活动，
      // 要求严格不变只会验成 flaky。
      const webStorageGrowth = webStorageSize(userDataDir) - webStorageBefore;
      expect(webStorageGrowth, 'WebView 存储随上传增长，内容可能仍写在 OPFS 里').toBeLessThan(2 * BYTES_PER_MIB);

      const expectedAlpha = expectedSha256('alpha.bin', 8 * BYTES_PER_MIB);
      const expectedBeta = expectedSha256('beta.bin', BYTES_PER_MIB);

      // AC#1：重启后读回，字节由两侧独立复算比对。
      const second = await launchPackagedApp(userDataDir);
      try {
        const page = await second.firstWindow();
        await openStoragePage(page);
        expect(await entryNames(page)).toEqual(['alpha.bin', 'nested']);
        expect(await verifyEntry(page, 'alpha.bin')).toEqual({ size: 8 * BYTES_PER_MIB, sha256: expectedAlpha });
      } finally {
        await second.close();
      }

      // AC#3：整个 userData 拷到别处即完整搬迁。跳过 Singleton*：
      // 那是 Chromium 的锁与 socket，拷贝会失败，且它们本就不属于「应用数据」。
      cpSync(userDataDir, copiedDir, {
        recursive: true,
        filter: source => !basename(source).startsWith('Singleton')
      });

      const migrated = await launchPackagedApp(copiedDir);
      try {
        const page = await migrated.firstWindow();
        await openStoragePage(page);
        expect(await entryNames(page)).toEqual(['alpha.bin', 'nested']);
        expect(await verifyEntry(page, 'alpha.bin')).toEqual({ size: 8 * BYTES_PER_MIB, sha256: expectedAlpha });

        await entryRow(page, 'nested').getByTestId('storage-enter').click();
        await expect(page.getByTestId('storage-path')).toHaveText('/nested');
        expect(await entryNames(page)).toEqual(['beta.bin']);
        expect(await verifyEntry(page, 'beta.bin')).toEqual({ size: BYTES_PER_MIB, sha256: expectedBeta });
      } finally {
        await migrated.close();
      }
    } finally {
      rmSync(userDataDir, { force: true, recursive: true });
      rmSync(copiedDir, { force: true, recursive: true });
    }
  });

  test('大文件传输中途被杀掉后，目标路径要么旧内容要么新内容', async () => {
    test.setTimeout(420000);
    const userDataDir = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-storage-kill-'));
    const targetPath = join(userDataDir, STORAGE_DIR, 'big.bin');

    try {
      // 先放一份旧内容：目标路径原本为空的话，「没有半写文件」可以靠什么都没写来满足，
      // 验不到原子替换。有了旧内容，中途被杀就必须完整回到旧的那一份。
      const first = await launchPackagedApp(userDataDir);
      try {
        const page = await first.firstWindow();
        await openStoragePage(page);
        await uploadGenerated(page, 'big.bin', 1);
      } finally {
        await first.close();
      }
      expect(statSync(targetPath).size).toBe(BYTES_PER_MIB);

      // AC#5：60 MiB 覆盖写到一半 SIGKILL。等的是磁盘上真的出现了临时文件且已写进
      // 至少 8 MiB —— 按固定时长睡一觉的话，机器一快就杀在写入开始之前，用例退化成空跑。
      const second = await launchPackagedApp(userDataDir);
      const killed = second.process();
      try {
        const page = await second.firstWindow();
        await openStoragePage(page);
        await page.getByTestId('storage-generate-name').fill('big.bin');
        await page.getByTestId('storage-generate-size').fill('60');
        await page.getByTestId('storage-generate-upload').click();

        await expect
          .poll(() => temporaryFiles(userDataDir).filter(path => statSync(path).size >= 8 * BYTES_PER_MIB).length, {
            timeout: 180000,
            message: '临时文件始终没写到 8 MiB，无法确认杀在传输途中'
          })
          .toBeGreaterThan(0);
      } finally {
        killed.kill('SIGKILL');
      }

      // 旧内容必须逐字节完好。**不断言临时文件已被清掉**：SIGKILL 之后没有任何代码有机会
      // 删它，除非另加一次启动扫描（本轮 Out of Scope）。AC#5 要的是目标路径没有半写内容，
      // 残留的 `.rxdb-tmp` 是设计内的垃圾，不是半写文件。
      expect(statSync(targetPath).size).toBe(BYTES_PER_MIB);

      const third = await launchPackagedApp(userDataDir);
      try {
        const page = await third.firstWindow();
        await openStoragePage(page);
        // 没有孤儿 metadata：多出来的行会在这里作为一个读不出内容的条目暴露。
        expect(await entryNames(page)).toEqual(['big.bin']);
        expect(await verifyEntry(page, 'big.bin')).toEqual({
          size: BYTES_PER_MIB,
          sha256: expectedSha256('big.bin', BYTES_PER_MIB)
        });
      } finally {
        await third.close();
      }
    } finally {
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
