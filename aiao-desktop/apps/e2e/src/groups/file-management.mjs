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
    'fileManagement.desktopMoveToTrash',
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
    'fileManagement.listVirtualScroll',
    'fileManagement.clipboardCopyPaste',
    'fileManagement.dragCopy',
    'fileManagement.dragMove',
    'fileManagement.columnVirtualScroll',
    'fileManagement.columnWidthDrag',
    'fileManagement.columnActionsUseExactPath',
    'fileManagement.galleryActionsAndDuplicateShortcut',
    'fileManagement.openWithOpensSelectedFile',
    'fileManagement.trashOriginSurvivesReloadAndRename',
    'fileManagement.restoreKeepsCollidingFile',
    'fileManagement.missingOriginRequiresExplicitFolder',
    'fileManagement.legacyTrashCanChooseFolder',
    'fileManagement.trashShortcutMovesItem',
    'fileManagement.emptyTrashRequiresConfirmation',
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
    await desktop.locator('[data-id="file:from-desktop.txt"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to Trash', exact: true }).click();
    await expect(desktop.locator('[data-id="file:from-desktop.txt"]')).toHaveCount(0);
    result.desktopMoveToTrash = true;
    await desktop.locator('[data-id="file:Projects"]').drop({
      files: payload('from-desktop-folder.txt', Buffer.from(text))
    });
    await expect.poll(() => diskText(session, 'from-desktop-folder.txt')).toBe(text);
    await desktop.locator('[data-id="hd"]').drop({ files: payload('rejected.txt', Buffer.from(text)) });
    await expect(desktop.locator('[data-id="file:rejected.txt"]')).toHaveCount(0);
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
    const edit = async command => {
      await page.getByRole('menubar').getByRole('menuitem', { name: 'Edit', exact: true }).click();
      await page.getByRole('menu', { name: 'Edit', exact: true }).getByRole('menuitem', { name: command, exact: true }).click();
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
    await openTrash();
    await expect(item('from-desktop.txt')).toBeVisible();
    await place('Desktop');
    await expect(finder().getByRole('button', { name: /^Import/ })).toHaveCount(0);
    await item('Projects').drop({ files: payload('from-folder.txt', Buffer.from(text)) });
    await item('Projects').dblclick();
    await expect(item('from-desktop-folder.txt')).toBeVisible();
    await expect(item('from-folder.txt')).toBeVisible();
    result.dropsOnDesktopFolder = (await diskText(session, 'from-desktop-folder.txt')) === text;
    result.dropsOnFolder = (await diskText(session, 'from-folder.txt')) === text;

    await finder()
      .locator('[data-place="Downloads"]')
      .drop({ files: payload('from-sidebar.txt', Buffer.from(text)) });
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
    await finder()
      .locator('[data-body]')
      .drop({
        files: [payload('readable.txt', Buffer.from('readable')), payload('unreadable.txt', Buffer.from('unreadable'))]
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
    await importFiles([
      payload('clipboard-source.txt', Buffer.from(text)),
      payload('drag-copy.txt', Buffer.from(text)),
      payload('drag-move.txt', Buffer.from(text))
    ]);
    await expect(item('drag-copy.txt')).toBeVisible();
    await expect(item('drag-move.txt')).toBeVisible();
    await finder().getByRole('button', { name: 'List', exact: true }).click();
    await expect(finder().locator('.fv-list-scroll')).toHaveCount(1);
    result.listVirtualScroll = true;

    await item('clipboard-source.txt').click();
    await edit('Copy');
    await item('nested').dblclick();
    await edit('Paste');
    await expect(item('clipboard-source.txt')).toBeVisible();
    const clipboardCopy = await downloaded('clipboard-source.txt');
    console.error('clipboard copied bytes', JSON.stringify(clipboardCopy.toString()), clipboardCopy.length, Buffer.from(text).length);
    const clipboardCopyKeptBytes = clipboardCopy.equals(Buffer.from(text));
    await item('clipboard-source.txt').focus();
    await edit('Cut');
    await place('Desktop');
    await edit('Paste');
    await expect(item('clipboard-source 2.txt')).toBeVisible();
    await item('nested').dblclick();
    await expect(item('clipboard-source.txt')).toHaveCount(0);
    await place('Desktop');
    result.clipboardCopyPaste = clipboardCopyKeptBytes && (await item('clipboard-source 2.txt').count()) === 1;

    await page.keyboard.down('Alt');
    await item('drag-copy.txt').dragTo(item('nested'));
    await page.keyboard.up('Alt');
    await expect(item('drag-copy.txt')).toBeVisible();
    await item('nested').dblclick();
    await expect(finder().locator('[data-title]')).toHaveText('nested');
    await expect(item('drag-copy.txt')).toBeVisible();
    await place('Desktop');
    result.dragCopy = (await diskText(session, 'drag-copy.txt')) === text;

    await expect(item('drag-move.txt')).toBeVisible();
    await item('drag-move.txt').dragTo(item('nested'));
    await expect(item('drag-move.txt')).toHaveCount(0);
    await item('nested').dblclick();
    await expect(finder().locator('[data-title]')).toHaveText('nested');
    await expect(item('drag-move.txt')).toBeVisible();
    await place('Desktop');
    result.dragMove = true;

    await finder().getByRole('button', { name: 'Columns', exact: true }).click();
    await item('nested copy').click();
    const columnViewports = finder().locator('.fv-col cdk-virtual-scroll-viewport.col');
    await expect(columnViewports).toHaveCount(2);
    result.columnVirtualScroll = true;
    const columnDivider = finder().locator('.finder-column-divider').first();
    const oldColumnWidth = await columnDivider.getAttribute('aria-valuenow');
    const dividerBox = await columnDivider.boundingBox();
    if (!dividerBox) throw new Error('Finder column divider is not measurable');
    await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(dividerBox.x + dividerBox.width / 2 + 40, dividerBox.y + 20);
    await page.mouse.up();
    await expect(columnDivider).not.toHaveAttribute('aria-valuenow', oldColumnWidth);
    result.columnWidthDrag = true;
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

    await importFiles([payload('shortcut-trash.txt', Buffer.from(text))]);
    await item('shortcut-trash.txt').focus();
    await page.keyboard.press('Meta+Backspace');
    await expect(item('shortcut-trash.txt')).toHaveCount(0);
    await openTrash();
    await expect(item('shortcut-trash.txt')).toBeVisible();
    result.trashShortcutMovesItem =
      (await page.locator('#dock .di[data-app="trash"] [data-icon="app-trash-full"]').count()) === 1;

    const emptyTrash = finder().locator('[data-trash-empty]');
    await expect(emptyTrash).toBeEnabled();
    await emptyTrash.click();
    const emptyDialog = page.getByRole('alertdialog');
    await expect(emptyDialog).toBeVisible();
    await emptyDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(emptyDialog).toHaveCount(0);
    const remainsAfterCancel = await item('shortcut-trash.txt').count();
    await emptyTrash.click();
    await emptyDialog.getByRole('button', { name: 'Empty Trash', exact: true }).click();
    await expect(emptyDialog).toHaveCount(0);
    await expect(item('shortcut-trash.txt')).toHaveCount(0);
    await expect(finder().locator('[data-trash-status]')).toHaveText('0 items');
    result.emptyTrashRequiresConfirmation = remainsAfterCancel === 1;

    return { fileManagement: result };
  }
};
