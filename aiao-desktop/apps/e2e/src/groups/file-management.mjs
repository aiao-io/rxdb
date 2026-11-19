import { readFile } from 'node:fs/promises';
import { expect as playwrightExpect } from 'playwright/test';

import { surgery } from '../harness/database.mjs';
import { diskText, traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const text = '文件往返 🌏\nsecond line';
const binary = Buffer.from([0, 255, 128, 1, 0, 42]);
const payload = (name, buffer) => ({ name, mimeType: 'application/octet-stream', buffer });

export const fileManagement = {
  name: 'file-management',
  description: 'Finder 改名、复制、导入下载、打开方式、持久废纸篓恢复与键盘路径',
  keys: [
    'fileManagement.dropsOnDesktop',
    'fileManagement.dropsOnDesktopFolder',
    'fileManagement.dropsOnFolder',
    'fileManagement.dropsOnSidebar',
    'fileManagement.dropsOnVisibleColumn',
    'fileManagement.rejectsReadOnlyDrops',
    'fileManagement.importPreservesBytes',
    'fileManagement.importKeepsExistingNames',
    'fileManagement.readFailureKeepsBatchAndExistingData',
    'fileManagement.renameValidatesAndPreservesContent',
    'fileManagement.renameCancellationAndKeyboardFocus',
    'fileManagement.duplicateIsIndependent',
    'fileManagement.folderCopyKeepsNestedAndEmptyEntries',
    'fileManagement.columnActionsUseExactPath',
    'fileManagement.galleryActionsAndDuplicateShortcut',
    'fileManagement.openWithOpensSelectedFile',
    'fileManagement.trashOriginSurvivesReloadAndRename',
    'fileManagement.restoreKeepsCollidingFile',
    'fileManagement.missingOriginRequiresExplicitFolder',
    'fileManagement.legacyTrashCanChooseFolder',
    'fileManagement.otherTabSeesChanges'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('file-management');
    await session.openDesktop();
    await helpers.closeAll();
    const desktop = page.locator('#desktop');
    await desktop.drop({ files: payload('from-desktop.txt', Buffer.from(text)) }, { timeout: 5_000 });
    await expect(desktop.locator('[data-id="file:from-desktop.txt"]')).toBeVisible();
    result.dropsOnDesktop = (await diskText(session, 'from-desktop.txt')) === text;
    await desktop.locator('[data-id="file:Projects"]').drop({
      files: payload('from-desktop-folder.txt', Buffer.from(text))
    });
    await expect(page.locator('#toast')).toContainText('Imported 1 file');
    await helpers.launch('Finder');
    const finder = () => page.locator('.win.front[data-app="finder"]:not(.closing)');
    const item = name => finder().locator(`[role="option"][data-name=${JSON.stringify(name)}]`);
    const place = async name => {
      await finder()
        .locator(`[data-place=${JSON.stringify(name)}]`)
        .click();
    };
    const menu = async (name, command, keyboard = false) => {
      await expect(item(name)).toBeVisible();
      if (keyboard) {
        await item(name).focus();
        await page.keyboard.press('Shift+F10');
      } else await item(name).click({ button: 'right' });
      await page.getByRole('menuitem', { name: command, exact: true }).click();
    };
    const dialog = () => page.locator('app-file-operation-dialog [role="dialog"]');
    const rename = async (from, to) => {
      await menu(from, 'Rename…', true);
      await dialog().getByRole('textbox', { name: 'New name' }).fill(to);
      await dialog().getByRole('button', { name: 'Rename', exact: true }).click();
      await expect(dialog()).toHaveCount(0);
      await expect(item(to)).toBeVisible();
    };
    const importFiles = async files => {
      await finder().locator('[data-body]').drop({ files });
      await expect(item(files[0].name)).toBeVisible();
    };
    const downloaded = async name => {
      const event = page.waitForEvent('download');
      await menu(name, 'Download File');
      const download = await event;
      expect(download.suggestedFilename()).toBe(name);
      return readFile(await download.path());
    };
    const trash = async name => {
      await menu(name, 'Move to Trash');
      await expect(item(name)).toHaveCount(0);
    };
    const openTrash = async () => {
      if ((await finder().locator('[data-title]').textContent()) === 'Trash') return;
      const previous = await finder().getAttribute('id');
      await page.locator('#dock .di[data-app="trash"]').click();
      await expect(finder()).not.toHaveAttribute('id', previous);
      await expect(finder().locator('[data-title]')).toHaveText('Trash');
    };
    await place('Desktop');
    await expect(finder().getByRole('button', { name: /^Import/ })).toHaveCount(0);
    await expect(item('from-desktop.txt')).toBeVisible();
    await item('Projects').drop({ files: payload('from-folder.txt', Buffer.from(text)) });
    await item('Projects').dblclick();
    await expect(item('from-desktop-folder.txt')).toBeVisible();
    await expect(item('from-folder.txt')).toBeVisible();
    result.dropsOnDesktopFolder = (await diskText(session, 'from-desktop-folder.txt')) === text;
    result.dropsOnFolder = (await diskText(session, 'from-folder.txt')) === text;

    await finder().locator('[data-place="Downloads"]').drop({ files: payload('from-sidebar.txt', Buffer.from(text)) });
    await expect(finder().locator('[data-title]')).toHaveText('Projects');
    await place('Downloads');
    await expect(item('from-sidebar.txt')).toBeVisible();
    result.dropsOnSidebar = (await diskText(session, 'from-sidebar.txt')) === text;

    await place('Macintosh HD');
    await item('System').drop({ files: payload('rejected.txt', Buffer.from(text)) });
    await expect(item('rejected.txt')).toHaveCount(0);
    await item('System').dblclick();
    await expect(item('rejected.txt')).toHaveCount(0);
    result.rejectsReadOnlyDrops = (await diskText(session, 'rejected.txt')) === undefined;

    await place('Desktop');
    await importFiles([
      payload('roundtrip.txt', Buffer.from(text)),
      payload('binary.bin', binary),
      payload('empty.dat', Buffer.alloc(0))
    ]);
    result.importPreservesBytes =
      (await downloaded('roundtrip.txt')).equals(Buffer.from(text)) &&
      (await downloaded('binary.bin')).equals(binary) &&
      (await downloaded('empty.dat')).length === 0;
    await importFiles([payload('roundtrip.txt', Buffer.from('other'))]);
    await expect(item('roundtrip 2.txt')).toBeVisible();
    result.importKeepsExistingNames =
      (await diskText(session, 'roundtrip.txt')) === text && (await diskText(session, 'roundtrip 2.txt')) === 'other';

    await page.evaluate(() => {
      window.__originalFileReader = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        return this.name === 'unreadable.txt' ?
            Promise.reject(new Error('Unable to read test file'))
          : window.__originalFileReader.call(this);
      };
    });
    await finder().locator('[data-body]').drop({
      files: [
        payload('readable.txt', Buffer.from('readable')),
        payload('unreadable.txt', Buffer.from('unreadable'))
      ]
    });
    await expect(page.locator('#toast')).toContainText('Unable to read test file');
    await page.evaluate(() => {
      File.prototype.arrayBuffer = window.__originalFileReader;
      delete window.__originalFileReader;
    });
    result.readFailureKeepsBatchAndExistingData =
      (await item('readable.txt').count()) === 0 &&
      (await item('unreadable.txt').count()) === 0 &&
      (await diskText(session, 'roundtrip.txt')) === text;

    const second = await session.openDesktopPage();
    await second.helpers.closeAll();
    await second.helpers.launch('Finder');
    await second.helpers.win('finder').last().locator('[data-place="Desktop"]').click();
    await page.bringToFront();
    await menu('roundtrip.txt', 'Rename…', true);
    await dialog().getByRole('textbox', { name: 'New name' }).fill('bad/name');
    await dialog().getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(dialog().getByRole('alert')).toContainText('name');
    await dialog().getByRole('textbox', { name: 'New name' }).fill('renamed.txt');
    await dialog().getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(item('renamed.txt')).toBeVisible();
    result.renameValidatesAndPreservesContent =
      (await item('roundtrip.txt').count()) === 0 && (await diskText(session, 'renamed.txt')) === text;
    await expect(second.helpers.win('finder').locator('[data-name="renamed.txt"]')).toBeVisible();
    result.otherTabSeesChanges = true;
    await second.page.close();
    await menu('renamed.txt', 'Rename…', true);
    await expect(dialog().getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('app-file-operation-dialog')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog()).toHaveCount(0);
    result.renameCancellationAndKeyboardFocus =
      (await item('renamed.txt').count()) === 1 &&
      (await item('renamed.txt').evaluate(node => node === document.activeElement));
    await menu('renamed.txt', 'Duplicate');
    await expect(item('renamed copy.txt')).toBeVisible();
    await menu('renamed.txt', 'Open With…');
    await dialog().getByRole('button', { name: 'Open', exact: true }).click();
    await expect(helpers.win('textedit').locator('[data-te-doc]')).toHaveText(text);
    result.openWithOpensSelectedFile = true;
    await helpers.win('textedit').locator('[data-te-doc]').fill('edited original');
    await helpers.win('textedit').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(helpers.win('textedit').getByRole('status')).toContainText('Saved');
    await helpers.win('textedit').locator('.tl .c').click();
    result.duplicateIsIndependent = (await diskText(session, 'renamed copy.txt')) === text;

    await finder().locator('[data-more]').click();
    await page.getByRole('menuitem', { name: /New Folder/ }).click();
    await rename('untitled folder', 'nested');
    await item('nested').dblclick();
    await importFiles([
      payload('child.txt', Buffer.from(text)),
      payload('empty', Buffer.alloc(0)),
      payload('bytes.bin', binary)
    ]);
    await finder().locator('[data-more]').click();
    await page.getByRole('menuitem', { name: /New Folder/ }).click();
    await place('Desktop');
    await menu('nested', 'Duplicate');
    await item('nested copy').dblclick();
    const nestedBytes = (await downloaded('bytes.bin')).equals(binary) && (await downloaded('empty')).length === 0;
    await item('untitled folder').dblclick();
    await expect(finder().locator('[data-title]')).toHaveText('untitled folder');
    await expect(finder().getByRole('option')).toHaveCount(0);
    result.folderCopyKeepsNestedAndEmptyEntries = nestedBytes && (await finder().getByRole('option').count()) === 0;
    await place('Desktop');
    await finder().getByRole('button', { name: 'Columns', exact: true }).click();
    await item('nested copy').click();
    const column = finder().getByRole('listbox', { name: 'nested copy', exact: true });
    await column.drop({ files: payload('from-column.txt', Buffer.from(text)) });
    await expect(column.locator('[data-name="from-column.txt"]')).toBeVisible();
    result.dropsOnVisibleColumn = (await diskText(session, 'from-column.txt')) === text;
    await rename('child.txt', 'column-child.txt');
    result.columnActionsUseExactPath = (await downloaded('column-child.txt')).equals(Buffer.from(text));
    await place('Desktop');
    await finder().getByRole('button', { name: 'Gallery', exact: true }).click();
    await item('renamed.txt').focus();
    await page.keyboard.press('Meta+d');
    await expect(item('renamed copy 2.txt')).toBeVisible();
    await menu('renamed copy 2.txt', 'Rename…');
    await dialog().getByRole('textbox').fill('gallery-copy.txt');
    await dialog().getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(dialog()).toHaveCount(0);
    await expect(item('gallery-copy.txt')).toBeVisible();
    result.galleryActionsAndDuplicateShortcut = (await diskText(session, 'gallery-copy.txt')) === 'edited original';
    await finder().getByRole('button', { name: 'Icons', exact: true }).click();
    await trash('renamed.txt');
    await openTrash();
    await rename('renamed.txt', 'trash-renamed.txt');
    await page.reload({ waitUntil: 'load' });
    await helpers.restored();
    await openTrash();
    await menu('trash-renamed.txt', 'Put Back');
    await expect(item('trash-renamed.txt')).toHaveCount(0);
    await place('Desktop');
    result.trashOriginSurvivesReloadAndRename = (await downloaded('renamed.txt')).equals(
      Buffer.from('edited original')
    );
    await trash('renamed.txt');
    await importFiles([payload('renamed.txt', Buffer.from('collision'))]);
    await openTrash();
    await menu('renamed.txt', 'Put Back');
    await expect(item('renamed.txt')).toHaveCount(0);
    await place('Desktop');
    result.restoreKeepsCollidingFile =
      (await diskText(session, 'renamed.txt')) === 'collision' &&
      (await diskText(session, 'renamed 2.txt')) === 'edited original';

    await item('nested').dblclick();
    await trash('child.txt');
    await place('Desktop');
    await rename('nested', 'moved-parent');
    await openTrash();
    await menu('child.txt', 'Put Back');
    await expect(
      page.locator('[role="status"]').filter({ hasText: 'destination folder no longer exists' })
    ).toBeVisible();
    await menu('child.txt', 'Restore to Folder…', true);
    await expect(dialog().getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog()).toHaveCount(0);
    await expect(item('child.txt')).toBeVisible();
    await menu('child.txt', 'Restore to Folder…');
    await dialog()
      .getByRole('combobox', { name: 'Destination folder' })
      .selectOption(JSON.stringify(['Users', 'prasenjit', 'Desktop']));
    await dialog().getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(dialog()).toHaveCount(0);
    result.missingOriginRequiresExplicitFolder = (await diskText(session, 'child.txt')) === text;

    await place('Desktop');
    await trash('binary.bin');
    await surgery(session, db =>
      db.shell.execute('UPDATE "desktop$desktop_file" SET "original_path" = NULL WHERE "name" = ?', ['binary.bin'])
    );
    await openTrash();
    await menu('binary.bin', 'Restore to Folder…');
    await dialog().getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(dialog()).toHaveCount(0);
    await place('Desktop');
    result.legacyTrashCanChooseFolder = (await downloaded('binary.bin')).equals(binary);
    return { fileManagement: result };
  }
};
