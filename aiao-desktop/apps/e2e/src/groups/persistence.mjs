/**
 * 持久化（ADESK-US-102）：磁盘、系统设置与内置应用的数据写进本地 SQLite 与 OPFS，刷新后还在；
 * 磁盘工具「抹掉」把磁盘恢复成内置内容。本组自己准备前置数据，不依赖别的检查组先跑。
 */
export const persistence = {
  name: 'persistence',
  description: '持久化：终端写的文件、新建文件夹、备忘录、提醒事项与深色外观刷新后还在；抹掉磁盘恢复内置内容',
  keys: [
    'persistence.fileSurvivesReload',
    'persistence.folderSurvivesReload',
    'persistence.settingsSurviveReload',
    'persistence.noteSurvivesReload',
    'persistence.reminderSurvivesReload',
    'persistence.eraseRestoresDisk'
  ],
  async run(session) {
    const { page } = session;
    const {
      win,
      closeAll,
      launch,
      spotlight,
      appears,
      disappears,
      desktopIcon,
      windowShowsText,
      openTerminal,
      runInShell
    } = session.helpers;
    await session.openDesktop();

    /* 前置数据：终端写一个文件，Finder 新建一个文件夹。 */
    await closeAll();
    await openTerminal();
    await runInShell('echo smoke-from-terminal > ~/Desktop/terminal-note.txt');
    await appears(desktopIcon('terminal-note.txt'));
    await page.locator('#dock .di[data-app="finder"]').click();
    await win('finder').last().locator('[data-place="Desktop"]').click();
    await win('finder').last().locator('[data-more]').click();
    await page.locator('#layer-menu .pop .mi', { hasText: 'New Folder' }).click();
    await appears(desktopIcon('untitled folder'));

    /* 内置应用的数据也在库里：新建一条备忘录、一条提醒事项，刷新后还在。 */
    await closeAll();
    await page.locator('#dock .di[data-app="notes"]').click();
    await win('notes').waitFor();
    await win('notes').locator('[data-new]').click();
    await page.waitForTimeout(300);
    await win('notes').locator('[data-doc]').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' smoke-note-body');
    await page.waitForTimeout(1_000);
    await closeAll();
    await launch('Reminders');
    await win('reminders').waitFor();
    await win('reminders').locator('[data-radd]').click();
    await win('reminders').locator('[data-rnew]').click();
    await page.keyboard.type('smoke-reminder');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await closeAll();

    /* 系统设置也在库里：用聚焦搜索切到深色外观，设置在停手 0.4 秒后写回。 */
    await spotlight('dark mode');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', undefined, { timeout: 3_000 });
    await page.waitForTimeout(1_000);

    /* 刷新后改动还在（数据在本地 SQLite 与 OPFS 里）；磁盘工具抹掉后回到内置内容。 */
    await page.reload({ waitUntil: 'load' });
    await win('finder').waitFor();
    const persistence = {
      fileSurvivesReload: await appears(desktopIcon('terminal-note.txt')),
      folderSurvivesReload: await appears(desktopIcon('untitled folder')),
      settingsSurviveReload: await page
        .waitForFunction(() => document.documentElement.dataset.theme === 'dark', undefined, { timeout: 10_000 })
        .then(
          () => true,
          () => false
        )
    };
    await closeAll();
    await page.locator('#dock .di[data-app="notes"]').click();
    persistence.noteSurvivesReload = await windowShowsText('notes', '[data-items]', 'smoke-note-body');
    await closeAll();
    await launch('Reminders');
    persistence.reminderSurvivesReload = await windowShowsText('reminders', '[data-rlist]', 'smoke-reminder');
    await closeAll();
    await launch('Disk Utility');
    await win('diskutil').waitFor();
    await win('diskutil').locator('[data-duerase]').click();
    await page.locator('.pop [data-e]').click();
    persistence.eraseRestoresDisk =
      (await disappears(desktopIcon('terminal-note.txt'), 30_000)) &&
      (await appears(desktopIcon('prasenx.txt'), 30_000));

    return { persistence };
  }
};
