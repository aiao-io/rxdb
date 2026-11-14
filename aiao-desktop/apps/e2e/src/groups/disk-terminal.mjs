/** 终端（D-09）与磁盘（ADESK-US-102）：Vivari 终端、磁盘落在 SQLite 与 OPFS、终端与桌面看到同一块磁盘。 */
export const diskTerminal = {
  name: 'disk-terminal',
  description: '终端与磁盘：Vivari shell、SQLite/OPFS 存储、终端与 Finder/TextEdit/预览读写同一块磁盘',
  keys: [
    'terminalState.crossOriginIsolated',
    'terminalState.xterm',
    'terminalState.helperInput',
    'terminalState.vivariShell',
    'diskState.sqliteInOpfs',
    'diskState.fileBodiesInOpfs',
    'diskState.desktopFromFolder',
    'diskState.shellStartsAtHome',
    'diskState.shellReadsFile',
    'diskState.shellListsDesktop',
    'diskState.shellWritesDisk',
    'diskState.shellCommandsWork',
    'diskState.openCommandOpensTextEdit',
    'diskState.finderFolderOnDesktop',
    'diskState.shellSeesFinderChange',
    'diskState.textEditShowsFile',
    'diskState.previewShowsImage'
  ],
  async run(session) {
    const { page } = session;
    const { win, closeAll, appears, xtermText, runInShell, desktopIcon, openTerminal } = session.helpers;
    await session.openDesktop();

    await closeAll();
    await openTerminal();
    await page.locator('.win[data-app="terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.type('echo VIVARI_SMOKE');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () =>
        /VIVARI_SMOKE[\s\S]*VIVARI_SMOKE/.test(
          document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? ''
        ),
      undefined,
      { timeout: 15_000 }
    );
    const terminalState = {
      crossOriginIsolated: await page.evaluate(() => window.crossOriginIsolated),
      xterm: (await page.locator('.win[data-app="terminal"] .xterm').count()) === 1,
      helperInput: (await page.locator('.win[data-app="terminal"] .xterm-helper-textarea').count()) === 1,
      vivariShell: (await xtermText()).includes('VIVARI_SMOKE')
    };

    /* 磁盘：目录树与元数据在本地 SQLite（库文件在 OPFS），文件体由 storage 插件放在 OPFS；终端看到同一块磁盘。 */
    const storage = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const names = [];
      for await (const [name] of root.entries()) names.push(name);
      const blobDir = await (await root.getDirectoryHandle('aiao-desktop-files')).getDirectoryHandle('blobs');
      return { names, blobs: (await Array.fromAsync(blobDir.keys())).length };
    });
    const diskState = {
      sqliteInOpfs: storage.names.some(name => /^aiao-desktop@.*\.sqlite$/.test(name)),
      fileBodiesInOpfs: storage.blobs > 30,
      desktopFromFolder: (
        await Promise.all(
          ['Projects', 'prasenx.txt', 'Interface Guidelines.pdf', 'Screenshot 2026-07-27 at 4.34.11 PM.png'].map(name =>
            appears(desktopIcon(name))
          )
        )
      ).every(Boolean),
      shellStartsAtHome: await runInShell('pwd', /\/Users\/prasenjit/),
      shellReadsFile: await runInShell('cat Desktop/prasenx.txt', /Scratchpad\. Everything on this Mac/),
      shellListsDesktop: await runInShell('ls ~/Desktop', /Interface Guidelines\.pdf/)
    };
    await runInShell('echo smoke-from-terminal > ~/Desktop/terminal-note.txt');
    diskState.shellWritesDisk = await appears(desktopIcon('terminal-note.txt'));
    await runInShell(
      'touch ~/Desktop/touched.txt && mv ~/Desktop/touched.txt ~/Desktop/moved.txt && cp ~/Desktop/moved.txt ~/Desktop/copied.txt'
    );
    diskState.shellCommandsWork = await page
      .waitForFunction(() => {
        const exists = name => document.querySelector(`.dicon[data-id="file:${name}"]`) !== null;
        return exists('moved.txt') && exists('copied.txt') && !exists('touched.txt');
      })
      .then(
        () => true,
        () => false
      );
    await runInShell('open ~/Desktop/terminal-note.txt');
    diskState.openCommandOpensTextEdit = await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('.win[data-app="textedit"] [data-te-doc]')].some(doc =>
            doc.textContent.includes('smoke-from-terminal')
          ),
        undefined,
        { timeout: 10_000 }
      )
      .then(
        () => true,
        () => false
      );

    /* 桌面这边的改动推进终端：Finder 在桌面目录新建文件夹，终端里马上 ls 得到。 */
    await page.locator('#dock .di[data-app="finder"]').click();
    await win('finder').last().locator('[data-place="Desktop"]').click();
    await win('finder').last().locator('[data-more]').click();
    await page.locator('#layer-menu .pop .mi', { hasText: 'New Folder' }).click();
    diskState.finderFolderOnDesktop = await appears(desktopIcon('untitled folder'));
    diskState.shellSeesFinderChange = await runInShell('ls ~/Desktop', /untitled folder/);

    /* 打开真文件：TextEdit 显示文本内容，预览显示图片本身。 */
    await closeAll();
    await desktopIcon('prasenx.txt').dblclick();
    diskState.textEditShowsFile = await page
      .waitForFunction(
        () =>
          document.querySelector('.win[data-app="textedit"] [data-te-doc]')?.textContent?.includes('cat prasenx.txt'),
        undefined,
        { timeout: 10_000 }
      )
      .then(
        () => true,
        () => false
      );
    await desktopIcon('Screenshot 2026-07-27 at 4.34.11 PM.png').dblclick();
    diskState.previewShowsImage = await page
      .waitForFunction(
        () => document.querySelector('.win[data-app="preview"] img[data-pv-image]')?.naturalWidth === 1440,
        undefined,
        { timeout: 10_000 }
      )
      .then(
        () => true,
        () => false
      );

    return { terminalState, diskState };
  }
};
