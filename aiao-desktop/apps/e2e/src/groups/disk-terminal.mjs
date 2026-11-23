/** 终端（D-09）与磁盘（ADESK-US-102）：Vivari 终端、磁盘落在 SQLite 与 OPFS、终端与桌面看到同一块磁盘。 */
export const diskTerminal = {
  name: 'disk-terminal',
  description: '终端与磁盘：Vivari shell、Git、SQLite/OPFS 存储、终端与 Finder/TextEdit/预览读写同一块磁盘',
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
    'diskState.gitCommandsWork',
    'diskState.gitShellSemantics',
    'diskState.gitTabsShareIndex',
    'diskState.gitHistorySurvivesReopen',
    'diskState.finderHiddenGitDirectory',
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
      shellStartsAtHome: await runInShell('pwd', /\/Users\/stevejobs/),
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
    let sequence = 0;
    const outputOf = async command => {
      const id = ++sequence;
      const begin = `G${id}BEGIN`;
      const end = `G${id}END`;
      const finished = await runInShell(
        `echo G'${id}BEGIN'; ${command}; echo G'${id}END'`,
        new RegExp(`${end}.*\\$\\s*$`)
      );
      const screen = (await xtermText()).replaceAll('\u00a0', ' ');
      if (!finished || !screen.includes(begin)) throw new Error(`Terminal did not finish ${command}\n${screen}`);
      return screen.split(begin).at(-1).split(end)[0].trim();
    };
    diskState.shellStartsAtHome &&=
      (await outputOf('echo "$HOME $USER $LOGNAME"')) === '/Users/stevejobs stevejobs stevejobs';
    const version = await outputOf('git --version');
    await outputOf('mkdir -p ~/Desktop/git-smoke && cd ~/Desktop/git-smoke && echo hello > README.md');
    const init = await outputOf('git init </dev/null');
    const untracked = await outputOf('git status --short');
    const staged = await outputOf('git add README.md && git status --short');
    await outputOf('git commit -m initial');
    const history = await outputOf('git log --oneline');
    const clean = await outputOf('git status --short');
    diskState.gitCommandsWork =
      /^git version /.test(version) &&
      init === 'Initialized empty Git repository in /Users/stevejobs/Desktop/git-smoke/' &&
      /^\?\? README\.md$/.test(untracked) &&
      /^A\s+README\.md$/.test(staged) &&
      /^[a-f0-9]{7,40}\s+initial$/.test(history) &&
      clean === '';
    const redirected = await outputOf('git log --oneline > /tmp/git-log');
    const saved = await outputOf('cat /tmp/git-log');
    const piped = await outputOf(
      `git log --oneline | node -e "process.stdin.on('data', d => console.log(d.toString().slice(0,7)))"`
    );
    const failed = await outputOf('git checkout missing-branch 2>/tmp/git-error && echo unexpected');
    const error = await outputOf('cat /tmp/git-error');
    diskState.gitShellSemantics =
      redirected === '' &&
      saved === history &&
      piped === history.slice(0, 7) &&
      failed === '' &&
      error.includes('missing-branch');
    await outputOf('touch left.txt right.txt');
    const terminal = win('terminal');
    const tabs = terminal.locator('.tm-tab:not(.tm-new-tab)');
    const panels = terminal.locator('.xterm-panel');
    const selectTab = async index => {
      await tabs.nth(index).locator('.tm-tab-title').click();
      await panels.nth(index).waitFor({ state: 'visible' });
      await panels.nth(index).locator('.xterm-helper-textarea').focus();
      await page.waitForFunction(i => {
        const panel = document.querySelectorAll('.win[data-app="terminal"] .xterm-panel')[i];
        return !panel.hidden && panel.contains(document.activeElement);
      }, index);
    };
    const runInTab = async (index, command) => {
      await selectTab(index);
      await page.keyboard.insertText(command);
      await page.keyboard.press('Enter');
    };
    const waitForTabText = async (index, expected) => {
      const rows = panels.nth(index).locator('.xterm-rows');
      try {
        await rows.filter({ hasText: expected }).waitFor({ state: 'attached', timeout: 15_000 });
      } catch (cause) {
        throw new Error(
          `Terminal tab ${index + 1} did not show ${expected}\n${(await panels.locator('.xterm-rows').allTextContents()).join('\n---\n')}`,
          { cause }
        );
      }
    };
    await terminal.getByTitle('New Tab').click();
    await waitForTabText(1, /~\$/);
    await runInTab(1, "cd ~/Desktop/git-smoke && git add right.txt && echo ADDED_'RIGHT'");
    await runInTab(0, "git add left.txt && echo ADDED_'LEFT'");
    await waitForTabText(0, 'ADDED_LEFT');
    await selectTab(1);
    await waitForTabText(1, 'ADDED_RIGHT');
    await tabs.nth(1).locator('.x').click();
    await panels.first().waitFor({ state: 'visible' });
    const sharedIndex = await outputOf('git status --short');
    diskState.gitTabsShareIndex = /^A\s+left\.txt\s*A\s+right\.txt$/.test(sharedIndex);
    const nested = await outputOf('mkdir nested && cd nested && git init');
    diskState.gitCommandsWork &&= nested.endsWith('/Users/stevejobs/Desktop/git-smoke/nested/');
    await closeAll();
    await openTerminal();
    const reopened = await outputOf('cd ~/Desktop/git-smoke && git log --oneline');
    diskState.gitHistorySurvivesReopen = /^[a-f0-9]{7,40}\s+initial$/.test(history) && reopened === history;
    if (
      !diskState.gitCommandsWork ||
      !diskState.gitShellSemantics ||
      !diskState.gitTabsShareIndex ||
      !diskState.gitHistorySurvivesReopen
    )
      console.error({
        version,
        init,
        untracked,
        staged,
        history,
        clean,
        redirected,
        saved,
        piped,
        failed,
        error,
        sharedIndex,
        nested,
        reopened
      });

    /* 普通 git init 使用 .git 指针文件；另建隐藏目录验证分栏展开。 */
    await outputOf('mkdir -p ~/Desktop/git-on-disk/.git && touch ~/Desktop/git-on-disk/.git/HEAD');
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
    const finder = win('finder').last();
    await finder.locator('[data-place="Desktop"]').click();
    await finder.locator('[data-name="git-smoke"]').dblclick();
    await finder.locator('[data-name="README.md"]').waitFor();
    const gitEntry = finder.locator('[role="option"][data-name=".git"]');
    const hiddenByDefault = (await gitEntry.count()) === 0;
    await page.keyboard.press('Meta+Shift+Period');
    await gitEntry.waitFor({ timeout: 5_000 });
    for (const view of ['list', 'gallery', 'column']) {
      await finder.locator(`[data-view="${view}"]`).click();
      await gitEntry.waitFor({ timeout: 5_000 });
    }
    await finder.locator('[data-view="icon"]').click();
    await finder.locator('[data-place="Desktop"]').click();
    await finder.locator('[data-name="git-on-disk"]').dblclick();
    await finder.locator('[data-view="column"]').click();
    await gitEntry.click({ timeout: 5_000 });
    const head = finder.locator('[role="option"][data-name="HEAD"]');
    await head.waitFor({ timeout: 5_000 });
    await page.keyboard.press('Meta+Shift+Period');
    await gitEntry.waitFor({ state: 'detached', timeout: 5_000 });
    await head.waitFor({ state: 'detached', timeout: 5_000 });
    diskState.finderHiddenGitDirectory = hiddenByDefault;

    await finder.locator('[data-view="icon"]').click();
    await finder.locator('[data-place="Desktop"]').click();
    await finder.locator('[data-more]').click();
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
