import { expect as playwrightExpect } from 'playwright/test';

import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const FOLDER_TABLE = 'desktop$note_folder';
const NOTE_TABLE = 'desktop$note';

export const notesFolders = {
  name: 'notes-folders',
  description: 'Notes 新建文件夹、笔记归属与本地持久化',
  keys: [
    'notesFolders.folderPersists',
    'notesFolders.noteUsesFolder',
    'notesFolders.folderSurvivesReload',
    'notesFolders.duplicateNameIsRejected'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('notes-folders');
    const rows = (statement, bindings) => surgery(session, db => db.shell.rows(statement, bindings));
    const open = async () => {
      await helpers.launch('Notes');
      const window = helpers.win('notes');
      await expect(window).toBeVisible();
      await expect(window.locator('[data-folder="Notes"]')).toBeVisible();
      return window;
    };

    await session.openDesktop();
    await helpers.closeAll();
    let window = await open();
    await window.locator('[data-new-folder]').click();
    const dialog = page.getByRole('dialog', { name: 'New Folder', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-folder-name]').fill('Projects');
    await dialog.locator('[data-folder-create]').click();
    await expect(dialog).toBeHidden();
    await expect(window.locator('[data-folder="Projects"]')).toBeVisible();
    result.folderPersists =
      JSON.stringify(await rows(`SELECT name FROM "${FOLDER_TABLE}" WHERE name = ?`, ['Projects'])) ===
      JSON.stringify([['Projects']]);

    await window.locator('[data-folder="Projects"]').click();
    await window.locator('[data-new]').click();
    await expect(window.locator('[data-id]').filter({ hasText: 'New Note' })).toHaveCount(1);
    result.noteUsesFolder =
      JSON.stringify(await rows(`SELECT folder FROM "${NOTE_TABLE}" WHERE title = ?`, ['New Note'])) ===
      JSON.stringify([['Projects']]);

    await window.locator('[data-new-folder]').click();
    const duplicate = page.getByRole('dialog', { name: 'New Folder', exact: true });
    await duplicate.locator('[data-folder-name]').fill('projects');
    await duplicate.locator('[data-folder-create]').click();
    await expect(duplicate.getByRole('alert')).toHaveText('A folder with that name already exists.');
    result.duplicateNameIsRejected = await duplicate.isVisible();
    await duplicate.locator('[data-folder-cancel]').click();

    await session.reloadDesktop(page, { finder: false });
    window = await open();
    await expect
      .poll(async () => {
        const folders = await rows(`SELECT name FROM "${FOLDER_TABLE}" WHERE name = ?`, ['Projects']);
        return (await window.locator('[data-folder="Projects"]').count()) === 1 && folders.length === 1;
      })
      .toBe(true);
    result.folderSurvivesReload = true;
    await helpers.closeAll();
    return { notesFolders: result };
  }
};
