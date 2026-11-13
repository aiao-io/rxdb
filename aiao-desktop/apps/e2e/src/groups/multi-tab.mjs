import { surgery } from '../harness/database.mjs';
import { passes } from '../harness/helpers.mjs';

/** 同步时限（ADESK-US-105）：同一浏览器上下文里的可见标签页，正常负载，从写入提交算起。超过即失败，不写成「数秒内大概出现」。 */
export const SYNC_LIMIT = 5_000;
/** 终端扫描周期的上限：输出停下 0.3 秒后扫描一次，另外每 3 秒扫描一次，所以终端里的改动最晚约 3.3 秒后写进库。 */
export const SCAN_CYCLE = 3_300;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** 在 `limit` 毫秒内成立（按固定间隔轮询，不依赖 rAF：后台页面没有 rAF）。 */
const within = (page, predicate, argument, limit = SYNC_LIMIT) =>
  passes(page.waitForFunction(predicate, argument, { timeout: limit, polling: 50 }));

const iconIn = (page, name, limit) =>
  within(page, id => Boolean(document.querySelector(`.dicon[data-id="${id}"]`)), `file:${name}`, limit);
const iconGone = (page, name, limit) =>
  within(page, id => !document.querySelector(`.dicon[data-id="${id}"]`), `file:${name}`, limit);
const finderShows = (page, name, limit) =>
  within(
    page,
    item => Boolean(document.querySelector(`.win[data-app="finder"] [data-body] [data-name="${item}"]`)),
    name,
    limit
  );
const theme = (page, wanted, limit) =>
  within(page, value => document.documentElement.dataset.theme === value, wanted, limit);

/** 桌面上全部图标的 id（排序后），用来比较各页面是否收敛一致。 */
const iconIds = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dicon')]
      .map(node => node.getAttribute('data-id'))
      .filter(Boolean)
      .sort()
  );

/** TextEdit 窗口里的正文（取最新打开的那个窗口）。 */
const doc = page => page.locator('.win[data-app="textedit"]:not(.closing) [data-te-doc]').last();
const docText = async page => (await doc(page).innerText()).trim();
const docShows = (page, text, limit) =>
  within(
    page,
    wanted =>
      [...document.querySelectorAll('.win[data-app="textedit"]:not(.closing) [data-te-doc]')].some(node =>
        node.textContent?.includes(wanted)
      ),
    text,
    limit
  );
/** 等 TextEdit 窗口里的内容写完（标题上的「Edited」没了）。 */
const saved = page =>
  within(
    page,
    () => {
      const title = document.querySelector('.win[data-app="textedit"]:not(.closing) [data-te-title]');
      return Boolean(title) && !title.textContent.includes('Edited');
    },
    undefined,
    3_000
  );

async function closeTextEdit(page) {
  for (let guard = 0; guard < 10; guard++) {
    const close = page.locator('.win[data-app="textedit"]:not(.closing) .tl .c');
    if ((await close.count()) === 0) return;
    await close.first().dispatchEvent('click');
    await sleep(260);
  }
}

/** 打开桌面上的文件，等 TextEdit 把内容读出来。 */
async function openInTextEdit(page, helpers, name, expected) {
  await closeTextEdit(page);
  await page.locator(`.dicon[data-id="file:${name}"]`).dblclick();
  await helpers.win('textedit').last().waitFor();
  return expected === undefined ? true : docShows(page, expected, 10_000);
}

/** 在页面里装一个 toast 记录器：之后显示过的每条提示都留在 `window.__toasts`。 */
const watchToasts = page =>
  page.evaluate(() => {
    window.__toasts = [];
    const toast = document.querySelector('#toast');
    new MutationObserver(() => {
      const text = toast.textContent?.trim();
      if (text && toast.classList.contains('on') && window.__toasts.at(-1) !== text) window.__toasts.push(text);
    }).observe(toast, { childList: true, characterData: true, subtree: true, attributes: true });
  });
const takeToasts = page => page.evaluate(() => window.__toasts.splice(0));
const toastMatches = (page, pattern, limit = 4_000) =>
  within(
    page,
    source => new RegExp(source).test(document.querySelector('#toast.on')?.textContent ?? ''),
    pattern.source,
    limit
  );

/** 读 OPFS 里某个文件体的文本（经页面里的 OPFS，库里只存元数据）。 */
const blobText = (page, opfsPath) =>
  page.evaluate(async path => {
    const root = await navigator.storage.getDirectory();
    const dir = await (await root.getDirectoryHandle('aiao-desktop-files')).getDirectoryHandle('blobs');
    try {
      return await (await (await dir.getFileHandle(path.replace(/^blobs\//, ''))).getFile()).text();
    } catch (error) {
      return `<<缺失:${error.name}>>`;
    }
  }, opfsPath);

/** 库里名字在 `names` 里的文件：[名字, 父目录名, 内容]；文件体缺失时内容是「<<缺失…>>」。 */
async function filesNamed(session, page, names) {
  const marks = names.map(() => '?').join(',');
  const rows = await surgery(session, db =>
    db.shell.rows(
      `SELECT f.name, p.name, m.opfs_path FROM "desktop$desktop_file" f LEFT JOIN "desktop$desktop_file" p ON p.id = f."parentId" LEFT JOIN "storage$storage_file_meta" m ON m.id = f.content_id WHERE f.name IN (${marks}) ORDER BY f.name, p.name`,
      names
    )
  );
  const found = [];
  for (const [name, parent, opfsPath] of rows)
    found.push([name, parent, opfsPath ? (await blobText(page, opfsPath)).trim() : null]);
  return found;
}

const integrityOk = async session =>
  (await surgery(session, db => db.shell.rows('PRAGMA integrity_check')))[0]?.[0] === 'ok';

/** 刷新页面并等桌面起来（磁盘种好、桌面图标出现）。刷新后窗口按本标签页保存的布局恢复（ADESK-US-104），不一定有 Finder 窗口，所以不等它。 */
async function reloadDesktop(page) {
  await page.reload({ waitUntil: 'load' });
  await page.locator('.dicon[data-id="file:prasenx.txt"]').waitFor({ timeout: 60_000 });
  await watchToasts(page); // 刷新把页面里的提示记录器也清掉了
}

/** 磁盘工具抹掉之后这个标签页会重启：走完开机进度进入锁屏，点一下登录，Finder 随后自动打开。 */
async function logInAfterRestart(page) {
  await page.locator('#lock:not([hidden]) .lk-user').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#lock').click();
  await page.locator('#lock').waitFor({ state: 'hidden', timeout: 10_000 });
}

/** 终端里的一条命令：等输出里出现标记（命令回显一次、输出一次）。 */
const echoes = (helpers, mark) => helpers.runInShell(`echo ${mark}`, new RegExp(`${mark}[\\s\\S]*${mark}`));

/** 把 Finder 切到桌面目录并新建一个文件夹；返回新文件夹的名字（取桌面上新出现的图标，不假定序号）。 */
async function newFolderOnDesktop(page, helpers) {
  const before = await iconIds(page);
  if ((await helpers.win('finder').count()) === 0) {
    await page.locator('#dock .di[data-app="finder"]').click();
    await helpers.win('finder').first().waitFor();
  }
  await helpers.win('finder').last().locator('[data-place="Desktop"]').click();
  await helpers.win('finder').last().locator('[data-more]').click();
  await page.locator('#layer-menu .pop .mi', { hasText: 'New Folder' }).click();
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const added = (await iconIds(page)).filter(id => !before.includes(id) && id.startsWith('file:untitled folder'));
    if (added.length === 1) return added[0].slice('file:'.length);
    await sleep(60);
  }
  throw new Error('新建文件夹后桌面上没有出现新图标');
}

/**
 * 多标签页实时互通（ADESK-US-105）：同一个浏览器上下文里同时开着多个桌面页面（共享 OPFS 里的库、BroadcastChannel 与 Web Locks，
 * 不同上下文互相隔离，不能代表多标签页），覆盖 AC#1～11，外加后台标签页恢复可见后的收敛、Dock 固定项的跨标签页互通。
 *
 * 时限类检查以 `SYNC_LIMIT` 为界（终端里的改动再加一个扫描周期 `SCAN_CYCLE`），从「写入的页面已经看到结果」起算——
 * 那一刻写入已经提交。每项实测耗时写在 stderr（`[multi-tab]` 开头），不进检查项。
 *
 * 在检查组登记表里是独占运行（`exclusive`）：时限只在「正常负载」下才有意义，不和别的检查组抢 CPU。
 * 库的完整性与文件体内容经 `surgery` 的夹具（同一个库上的另一条连接）取证，只在 Chromium 上验证过；
 * WebKit 的 OPFS 对第二条连接不安全（见 ADESK-US-105 的验收记录），这个检查组还没有为 WebKit 重新设计。
 */
export const multiTab = {
  name: 'multi-tab',
  description:
    '多标签页互通：同时保存同一文件、两台虚拟机、文件夹/外观/文件/备忘录/Dock 固定在同步时限内出现在别的标签页、最后写入生效、保存目标消失时失败、后台标签页恢复可见后收敛',
  timeout: 900_000,
  keys: [
    'multiTab.sameFileSavesStaySafe',
    'multiTab.sameFileConvergesWithoutReload',
    'multiTab.sameFileConsistentAfterReload',
    'multiTab.bothTerminalsStart',
    'multiTab.closingOneTerminalKeepsOther',
    'multiTab.terminalRestartsAfterReload',
    'multiTab.terminalFilesInDatabase',
    'multiTab.folderAppearsInFinder',
    'multiTab.folderAppearsOnDesktop',
    'multiTab.appearanceSyncs',
    'multiTab.appearanceSurvivesReload',
    'multiTab.savedFileReadableInOtherTab',
    'multiTab.terminalFileReachesOtherTab',
    'multiTab.terminalFileOpensInOtherTab',
    'multiTab.threePagesConverge',
    'multiTab.lastWriteWinsWithoutPrompt',
    'multiTab.openWindowFollowsOtherTabSave',
    'multiTab.saveFailsAfterTrash',
    'multiTab.saveFailsAfterRename',
    'multiTab.saveFailsAfterErase',
    'multiTab.failedSaveKeepsWindowContent',
    'multiTab.failedSaveCreatesNothing',
    'multiTab.tabsConvergeAfterFailedSaves',
    'multiTab.databaseIntactAfterFailedSaves',
    'multiTab.noteAppearsInOtherTab',
    'multiTab.terminalsWriteSameFile',
    'multiTab.backgroundTabConverges',
    'multiTab.dockPinSyncs',
    'multiTab.dockRunStateStaysLocal'
  ],
  async run(session) {
    const { page: A, helpers: hA } = session;
    const timings = {};
    const mark = (name, since) => (timings[name] = Date.now() - since);
    const checks = {};

    /* 三个页面：A 先起，磁盘种好之后 B、C 才开（各页的内存索引都从已有的库读起）。 */
    await session.openDesktop();
    await A.locator('.dicon[data-id="file:prasenx.txt"]').waitFor({ timeout: 60_000 });
    const second = await session.openDesktopPage();
    const third = await session.openDesktopPage();
    const { page: B, helpers: hB } = second;
    const { page: C, helpers: hC } = third;
    await Promise.all(
      [B, C].map(page => page.locator('.dicon[data-id="file:prasenx.txt"]').waitFor({ timeout: 60_000 }))
    );
    const pages = [
      [A, hA],
      [B, hB],
      [C, hC]
    ];
    await Promise.all(pages.map(([page]) => watchToasts(page)));

    /* AC#3：A 的 Finder 新建文件夹，B 的 Finder 与桌面图标在同步时限内出现，无需刷新。 */
    await Promise.all([hB, hC].map(helpers => helpers.win('finder').last().locator('[data-place="Desktop"]').click()));
    const firstFolder = await newFolderOnDesktop(A, hA);
    let wrote = Date.now();
    const [inFinder, onDesktop] = await Promise.all([finderShows(B, firstFolder), iconIn(B, firstFolder)]);
    mark('AC3 文件夹出现在 B', wrote);
    checks.folderAppearsInFinder = inFinder;
    checks.folderAppearsOnDesktop = onDesktop;

    /* AC#7：三个页面，A 再新建一个文件夹，B 与 C 都在同步时限内看到，桌面图标全部一致。 */
    const secondFolder = await newFolderOnDesktop(A, hA);
    wrote = Date.now();
    const converged = await Promise.all([B, C].map(page => iconIn(page, secondFolder)));
    mark('AC7 三页收敛', wrote);
    const [idsA, idsB, idsC] = await Promise.all([A, B, C].map(iconIds));
    checks.threePagesConverge =
      converged.every(Boolean) &&
      JSON.stringify(idsA) === JSON.stringify(idsB) &&
      JSON.stringify(idsA) === JSON.stringify(idsC);

    /* AC#4：A 切深色外观（聚焦搜索的 Toggle Dark Mode），B 与 C 在同步时限内跟着切，刷新后一致。 */
    await hA.spotlight('dark mode');
    await A.keyboard.press('Enter');
    await theme(A, 'dark', 3_000);
    wrote = Date.now();
    const darkEverywhere = await Promise.all([B, C].map(page => theme(page, 'dark')));
    mark('AC4 外观', wrote);
    checks.appearanceSyncs = darkEverywhere.every(Boolean);
    await sleep(900); // 设置在停手 0.4 秒后写回库
    await reloadDesktop(B);
    checks.appearanceSurvivesReload = await theme(B, 'dark', 10_000);
    await hA.spotlight('dark mode');
    await A.keyboard.press('Enter');
    await Promise.all([A, B, C].map(page => theme(page, 'light', 8_000)));
    await sleep(900);

    /* AC#5：A 在 TextEdit 保存文件，B 双击同一文件读到新内容。 */
    await Promise.all(pages.map(([, helpers]) => helpers.closeAll()));
    await openInTextEdit(A, hA, 'prasenx.txt');
    await sleep(400);
    await doc(A).fill('saved-by-A');
    await A.keyboard.press('Meta+s');
    await saved(A);
    wrote = Date.now();
    await B.locator('.dicon[data-id="file:prasenx.txt"]').dblclick();
    await hB.win('textedit').last().waitFor();
    checks.savedFileReadableInOtherTab = await docShows(B, 'saved-by-A');
    mark('AC5 B 打开读到新内容', wrote);

    /* AC#8：同一个文件已在两边的 TextEdit 里打开。A 保存内容 1，B 在界面出现内容 1 之后保存内容 2：
       两边最终都是内容 2（后保存的生效），没有冲突提示。 */
    await takeToasts(A);
    await takeToasts(B);
    await doc(A).fill('content-1');
    await A.keyboard.press('Meta+s');
    await saved(A);
    wrote = Date.now();
    checks.openWindowFollowsOtherTabSave = await docShows(B, 'content-1');
    mark('AC8 B 的窗口出现内容 1', wrote);
    await doc(B).fill('content-2');
    await B.keyboard.press('Meta+s');
    await saved(B);
    wrote = Date.now();
    const bothShowSecond = await Promise.all([A, B].map(page => docShows(page, 'content-2')));
    mark('AC8 A 的窗口出现内容 2', wrote);
    const lastWriter = await filesNamed(session, A, ['prasenx.txt']);
    const promptsShown = [...(await takeToasts(A)), ...(await takeToasts(B))];
    checks.lastWriteWinsWithoutPrompt =
      bothShowSecond.every(Boolean) &&
      lastWriter.length === 1 &&
      lastWriter[0][2] === 'content-2' &&
      promptsShown.length === 0;

    /* AC#1：A、B 同时保存同一个文件的不同内容（多轮）：库不损坏、没有页面错误，两边无需刷新就在同步时限内一致且等于其中一份；
       各自刷新后再打开该文件，看到同一份内容。 */
    const errorsBefore = session.errors.length;
    let candidates = [];
    let convergedEveryRound = true;
    for (let round = 1; round <= 5; round++) {
      const fromA = `A-round-${round}`;
      const fromB = `B-round-${round}`;
      candidates = [fromA, fromB];
      await doc(A).fill(fromA);
      await doc(B).fill(fromB);
      await Promise.all([A.keyboard.press('Meta+s'), B.keyboard.press('Meta+s')]);
      wrote = Date.now();
      let agreed = false;
      while (Date.now() - wrote < SYNC_LIMIT && !agreed) {
        const [a, b] = await Promise.all([docText(A), docText(B)]);
        agreed = a === b && candidates.includes(a);
        if (!agreed) await sleep(60);
      }
      mark(`AC1 第 ${round} 轮两边一致`, wrote);
      convergedEveryRound &&= agreed;
    }
    checks.sameFileConvergesWithoutReload = convergedEveryRound;
    checks.sameFileSavesStaySafe = (await integrityOk(session)) && session.errors.length === errorsBefore;
    await reloadDesktop(A);
    await reloadDesktop(B);
    await openInTextEdit(A, hA, 'prasenx.txt');
    await openInTextEdit(B, hB, 'prasenx.txt');
    await sleep(800);
    const [afterA, afterB] = await Promise.all([docText(A), docText(B)]);
    checks.sameFileConsistentAfterReload = afterA === afterB && candidates.includes(afterA);
    await Promise.all(pages.map(([page]) => closeTextEdit(page)));

    /* AC#2、#6、#11：A、B 各自打开终端（两台虚拟机同时启动）。 */
    await Promise.all([hA.openTerminal(), hB.openTerminal()]);
    const [aliveA, aliveB] = await Promise.all([echoes(hA, 'ALIVE_A'), echoes(hB, 'ALIVE_B')]);
    checks.bothTerminalsStart = aliveA && aliveB;

    /* AC#6：A 的终端写 ~/Desktop 里的文件，B 与 C 在「扫描周期 + 同步时限」内看到，并能打开读到内容（经库中转）。 */
    wrote = Date.now();
    await hA.runInShell('echo from-terminal > ~/Desktop/via-terminal.txt');
    const reached = await Promise.all([B, C].map(page => iconIn(page, 'via-terminal.txt', SCAN_CYCLE + SYNC_LIMIT)));
    mark('AC6 终端文件出现在 B/C（含扫描周期）', wrote);
    checks.terminalFileReachesOtherTab = reached.every(Boolean);
    wrote = Date.now();
    checks.terminalFileOpensInOtherTab = await openInTextEdit(B, hB, 'via-terminal.txt', 'from-terminal');
    mark('AC6 B 打开终端文件', wrote);
    await closeTextEdit(B);

    /* AC#11：两边的终端都向 ~/Desktop/same.txt 写不同内容（各自再写自己的文件），等两边的扫描写回完成。 */
    await Promise.all([
      hA.runInShell('echo from-A > ~/Desktop/same.txt; echo a-content > ~/Desktop/a.txt'),
      hB.runInShell('echo from-B > ~/Desktop/same.txt; echo b-content > ~/Desktop/b.txt')
    ]);
    await sleep(2 * SCAN_CYCLE + 500);

    /* AC#2：关闭 A 的终端不影响 B；刷新后 B 的终端仍可启动；两个文件最终都在库里。 */
    await hA.win('terminal').locator('.tl .c').first().dispatchEvent('click');
    await sleep(1_500);
    checks.closingOneTerminalKeepsOther = await echoes(hB, 'STILL_B');
    await reloadDesktop(B);
    await hB.closeAll();
    await hB.openTerminal();
    checks.terminalRestartsAfterReload = await echoes(hB, 'AGAIN_B');
    const fromTerminals = await filesNamed(session, A, ['a.txt', 'b.txt', 'same.txt']);
    const byName = Object.fromEntries(fromTerminals.map(([name, , text]) => [name, text]));
    checks.terminalFilesInDatabase = byName['a.txt'] === 'a-content' && byName['b.txt'] === 'b-content';

    /* AC#11 的判定：各自刷新后再看 same.txt，内容一致且等于其中一份。 */
    await hB.closeAll();
    await reloadDesktop(A);
    await reloadDesktop(B);
    await openInTextEdit(A, hA, 'same.txt');
    await openInTextEdit(B, hB, 'same.txt');
    await sleep(800);
    const [sameA, sameB] = await Promise.all([docText(A), docText(B)]);
    checks.terminalsWriteSameFile =
      sameA === sameB && ['from-A', 'from-B'].includes(sameA) && sameA === byName['same.txt'];
    await Promise.all(pages.map(([page]) => closeTextEdit(page)));

    /* AC#9：A、B 的 TextEdit 都打开了同一个文件，A 把它移进废纸篓 / 改名 / 抹掉磁盘之后 B 保存：
       保存失败并给出原因，B 窗口里的内容保留，桌面与废纸篓里没有新出现的文件；库不损坏，两边收敛一致。 */
    await hA.closeAll();
    await hA.openTerminal();
    const failures = {};
    const keepsContent = [];
    const createsNothing = [];
    const prepare = async name => {
      await hA.runInShell(`echo orig > ~/Desktop/${name}`);
      await Promise.all([A, B].map(page => iconIn(page, name, SCAN_CYCLE + SYNC_LIMIT)));
      await Promise.all([openInTextEdit(A, hA, name, 'orig'), openInTextEdit(B, hB, name, 'orig')]);
    };
    const failToSave = async () => {
      await doc(B).fill('B-late-edit');
      await B.keyboard.press('Meta+s');
      const reason = await toastMatches(B, /can’t be saved because it was moved, renamed or deleted/);
      await sleep(300);
      keepsContent.push(
        reason &&
          (await docText(B)) === 'B-late-edit' &&
          (await B.locator('[data-te-title]').last().innerText()).includes('Edited')
      );
      return reason;
    };

    /* ① A 把文件移进废纸篓。 */
    await prepare('gone-trash.txt');
    await A.locator('.dicon[data-id="file:gone-trash.txt"]').click({ button: 'right' });
    await A.locator('#layer-menu .pop .mi', { hasText: 'Move to Trash' }).click();
    await iconGone(B, 'gone-trash.txt');
    failures.trash = await failToSave();
    const trashed = await filesNamed(session, A, ['gone-trash.txt']);
    createsNothing.push(trashed.length === 1 && trashed[0][1] === '.Trash' && trashed[0][2] === 'orig');
    await closeTextEdit(B);
    await closeTextEdit(A);

    /* ② A 在终端里把文件改名。 */
    await prepare('gone-rename.txt');
    await hA.runInShell('mv ~/Desktop/gone-rename.txt ~/Desktop/gone-renamed.txt');
    await iconIn(B, 'gone-renamed.txt', SCAN_CYCLE + SYNC_LIMIT);
    failures.rename = await failToSave();
    const renamed = await filesNamed(session, A, ['gone-rename.txt', 'gone-renamed.txt']);
    createsNothing.push(
      renamed.length === 1 &&
        renamed[0][0] === 'gone-renamed.txt' &&
        renamed[0][1] === 'Desktop' &&
        renamed[0][2] === 'orig'
    );
    await closeTextEdit(B);
    await closeTextEdit(A);

    /* ③ A 在磁盘工具里抹掉磁盘。 */
    await prepare('gone-erase.txt');
    await hA.closeAll();
    await hA.launch('Disk Utility');
    await hA.win('diskutil').waitFor();
    await hA.win('diskutil').locator('[data-duerase]').click();
    await A.locator('.pop [data-e]').click();
    await iconGone(A, 'gone-erase.txt', 30_000);
    await sleep(2_500); // 抹掉是先清空再复制内置内容，等复制做完
    await iconIn(A, 'prasenx.txt', 30_000);
    wrote = Date.now();
    checks.tabsConvergeAfterFailedSaves = await within(
      B,
      () =>
        !document.querySelector('.dicon[data-id="file:gone-erase.txt"]') &&
        Boolean(document.querySelector('.dicon[data-id="file:prasenx.txt"]')),
      undefined,
      SYNC_LIMIT
    );
    mark('AC9 抹掉磁盘后 B 收敛', wrote);
    failures.erase = await failToSave();
    createsNothing.push((await filesNamed(session, A, ['gone-erase.txt'])).length === 0);
    const [erasedA, erasedB] = await Promise.all([A, B].map(iconIds));
    checks.tabsConvergeAfterFailedSaves &&= JSON.stringify(erasedA) === JSON.stringify(erasedB);
    checks.saveFailsAfterTrash = failures.trash;
    checks.saveFailsAfterRename = failures.rename;
    checks.saveFailsAfterErase = failures.erase;
    checks.failedSaveKeepsWindowContent = keepsContent.length === 3 && keepsContent.every(Boolean);
    checks.failedSaveCreatesNothing = createsNothing.length === 3 && createsNothing.every(Boolean);
    checks.databaseIntactAfterFailedSaves = await integrityOk(session);
    await logInAfterRestart(A);
    await Promise.all(pages.map(([, helpers]) => helpers.closeAll()));

    /* AC#10：B 已打开备忘录，在 A 的备忘录新建一条并输入文字，B 的列表在同步时限内出现（应用数据与磁盘走同一条互通路径）。 */
    await B.locator('#dock .di[data-app="notes"]').click();
    await hB.win('notes').waitFor();
    await A.locator('#dock .di[data-app="notes"]').click();
    await hA.win('notes').waitFor();
    await hA.win('notes').locator('[data-new]').click();
    await sleep(400);
    await hA.win('notes').locator('[data-doc]').click();
    const noteText = `note-from-A-${Date.now() % 100_000}`;
    await A.keyboard.type(noteText);
    const inA = await hA.windowShowsText('notes', '[data-items]', noteText);
    wrote = Date.now();
    checks.noteAppearsInOtherTab =
      inA &&
      (await within(
        B,
        text => (document.querySelector('.win[data-app="notes"] [data-items]')?.textContent ?? '').includes(text),
        noteText
      ));
    mark('AC10 备忘录出现在 B', wrote);
    await Promise.all(pages.map(([, helpers]) => helpers.closeAll()));

    /* 后台标签页：B 切到后台（Chromium 里用 CDP 冻结页面，与浏览器冻结后台标签页同一机制），A 写入文件夹与外观，
       B 恢复可见之后同样在同步时限内收敛。其他引擎没有 CDP，用页面可见性的模拟，只证明恢复时的重读接线。 */
    const hide = await hideTab(session, B);
    const backgroundFolder = await newFolderOnDesktop(A, hA);
    await hA.spotlight('dark mode');
    await A.keyboard.press('Enter');
    await theme(A, 'dark', 3_000);
    await sleep(1_200);
    await hide.show();
    wrote = Date.now();
    const catchUp = await Promise.all([iconIn(B, backgroundFolder), theme(B, 'dark')]);
    mark('后台标签页恢复可见后收敛', wrote);
    checks.backgroundTabConverges = catchUp.every(Boolean);
    await hA.spotlight('dark mode');
    await A.keyboard.press('Enter');
    await theme(A, 'light', 3_000);

    /* Dock 固定项（ADESK-US-205 的 Dock 布局，偏好键 dock:layout）跨标签页共享；运行指示与临时图标只反映本标签页的窗口。 */
    await A.locator('#dock .di[data-app="launchpad"]').click();
    await A.waitForSelector('#lpad:not(.out) [data-lq]');
    await sleep(700);
    await A.locator('#lpad .app[data-app="weather"]').click({ button: 'right' });
    await A.locator('#layer-menu .pop .mi[data-act="add-to-dock"]').click();
    await sleep(300);
    await A.keyboard.press('Escape');
    await A.locator('#dock .di[data-app="weather"]').waitFor();
    wrote = Date.now();
    checks.dockPinSyncs = await within(
      B,
      () => Boolean(document.querySelector('#dock .di[data-app="weather"]:not(.temp)')),
      undefined,
      SYNC_LIMIT
    );
    mark('Dock 固定项出现在 B', wrote);
    await A.locator('#dock .di[data-app="weather"]').click();
    await hA.win('weather').waitFor();
    await hA.launch('Stocks');
    await hA.win('stocks').waitFor();
    await sleep(600);
    const stateOf = (page, app) =>
      page.evaluate(id => {
        const node = document.querySelector(`#dock .di[data-app="${id}"]`);
        return node ? { running: node.classList.contains('run'), temporary: node.classList.contains('temp') } : null;
      }, app);
    const [weatherInA, stocksInA] = [await stateOf(A, 'weather'), await stateOf(A, 'stocks')];
    const [weatherInB, stocksInB] = [await stateOf(B, 'weather'), await stateOf(B, 'stocks')];
    checks.dockRunStateStaysLocal =
      weatherInA?.running === true &&
      stocksInA?.temporary === true &&
      weatherInB?.running === false &&
      weatherInB?.temporary === false &&
      stocksInB === null;
    await Promise.all(pages.map(([, helpers]) => helpers.closeAll()));

    console.error(`[multi-tab] 同步耗时(毫秒)：${JSON.stringify(timings)}`);
    return { multiTab: checks };
  }
};

/**
 * 把一个页面切到后台，返回恢复可见的函数。Chromium 用 CDP 的 `Page.setWebLifecycleState` 冻结页面：冻结期间任务与计时器都停，
 * BroadcastChannel 的消息排队，恢复时才交付——与浏览器冻结后台标签页同一机制。别的引擎没有 CDP，退而求其次：
 * 在页面里把 `document.visibilityState` 改成 `hidden` 并派发 `visibilitychange`，恢复时撤掉再派发一次。
 */
async function hideTab(session, page) {
  if (session.engine === 'chromium') {
    const cdp = await session.context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await sleep(300);
    return {
      show: async () => {
        await cdp.send('Page.setWebLifecycleState', { state: 'active' });
        await cdp.detach();
      }
    };
  }
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  return {
    show: () =>
      page.evaluate(() => {
        delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
      })
  };
}
