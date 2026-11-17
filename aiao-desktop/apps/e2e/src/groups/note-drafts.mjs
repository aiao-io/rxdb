import AxeBuilder from '@axe-core/playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { pressUntil } from '../harness/a11y.mjs';
import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const TABLE = 'desktop$note';

export const noteDrafts = {
  name: 'note-drafts',
  description: '备忘录真实保存失败、导航保护、在途输入、跨页冲突与副本恢复',
  keys: [
    'noteDrafts.failedWriteKeepsContent',
    'noteDrafts.failedNavigationAndClose',
    'noteDrafts.retryAndPersistence',
    'noteDrafts.pendingWriteSavesNewestBeforeClose',
    'noteDrafts.createFailureAndRecovery',
    'noteDrafts.deleteFailureAndRecovery',
    'noteDrafts.crossWindowConflict',
    'noteDrafts.copyFailureAndRecovery',
    'noteDrafts.deletedNoteAndDiscard',
    'noteDrafts.beforeUnloadGuard',
    'noteDrafts.keyboardRecovery',
    'noteDrafts.noViolations'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('note-drafts');
    const sql = (statement, bindings) => surgery(session, db => db.shell.execute(statement, bindings));
    const rows = (statement, bindings) => surgery(session, db => db.shell.rows(statement, bindings));
    const win = () => helpers.win('notes');
    const doc = () => win().getByRole('textbox', { name: 'Note content', exact: true });
    const selectedId = () => win().locator('.nt-i.on').getAttribute('data-id');
    const open = async () => {
      await helpers.launch('Notes');
      await expect(doc()).toBeEditable();
      await expect(win().locator('.nt-i.on')).toHaveCount(1);
    };
    const newNote = () => win().locator('[data-new]').click();
    const menu = async label => {
      await page.getByRole('menuitem', { name: 'File', exact: true }).click();
      await page.getByRole('menuitem', { name: label, exact: true }).click();
    };
    await session.openDesktop();
    await helpers.closeAll();
    await open();
    const initialId = await selectedId();
    await sql(`CREATE TRIGGER fail_note_edit BEFORE UPDATE ON "${TABLE}"
      WHEN NEW.title LIKE 'failed-%' BEGIN SELECT RAISE(ABORT, 'Note storage unavailable'); END`);
    await doc().fill('failed-note 🌏');
    await doc().press('End');
    await doc().press('ControlOrMeta+b');
    await page.keyboard.type(' bold');
    await doc().press('ControlOrMeta+b');
    const failedBody = await doc().innerHTML();
    await expect(win().getByRole('alert')).toContainText('Local storage could not complete this change. Try again.');
    expect(await doc().innerHTML()).toBe(failedBody);
    await expect(win().getByRole('status')).toHaveText('Unsaved changes');
    expect(await rows(`SELECT body FROM "${TABLE}" WHERE id = ?`, [initialId])).not.toEqual([[failedBody]]);
    result.failedWriteKeepsContent = true;
    expect(await page.evaluate(() => globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false);
    result.beforeUnloadGuard = true;
    await win().locator('.nt-i:not(.on)').first().click();
    await expect(win().getByRole('alert')).toBeVisible();
    expect(await selectedId()).toBe(initialId);
    expect(await doc().innerHTML()).toBe(failedBody);
    await win().locator('[data-folder="Recently Deleted"]').click();
    await expect(win().locator('[data-folder="Notes"]')).toHaveAttribute('aria-pressed', 'true');
    await win().getByRole('textbox', { name: 'Search notes' }).fill('cannot-navigate');
    await expect(win().getByRole('textbox', { name: 'Search notes' })).toHaveValue('');
    await newNote();
    await expect(win().getByRole('alert')).toBeVisible();
    expect(await selectedId()).toBe(initialId);
    await win().locator('.tl .c').click();
    await expect(win().getByRole('alert')).toBeVisible();
    await expect(win()).not.toHaveClass(/closing/);
    await page.getByRole('menuitem', { name: 'Apple', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restart…', exact: true }).click();
    await expect(win().getByRole('alert')).toBeVisible();
    expect(await doc().innerHTML()).toBe(failedBody);
    result.failedNavigationAndClose = true;
    const axe = await new AxeBuilder({ page }).include('.win[data-app="notes"]').analyze();
    result.noViolations = axe.violations;
    await page.screenshot({ path: '/tmp/aiao-note-failure.png' });
    await sql('DROP TRIGGER fail_note_edit');
    const reached = await pressUntil(page, focus => focus.app === 'notes' && focus.name === 'Retry Save');
    expect(reached.found).toBe(true);
    await page.keyboard.press('Enter');
    await expect(win().getByRole('status')).toHaveText('Saved');
    expect(await rows(`SELECT body FROM "${TABLE}" WHERE id = ?`, [initialId])).toEqual([[failedBody]]);
    result.keyboardRecovery = true;
    await session.reloadDesktop(page, { finder: false });
    await open();
    await win().locator(`[data-id="${initialId}"]`).click();
    await expect(doc()).toHaveJSProperty('innerHTML', failedBody);
    result.retryAndPersistence = true;

    await page.evaluate(() => new Promise(resolve => {
      globalThis.__noteLock = navigator.locks.request('aiao-desktop-data-write', () => new Promise(release => {
        globalThis.__releaseNoteLock = release;
        resolve();
      }));
    }));
    await doc().fill('pending-note first');
    await expect(win().getByRole('status')).toHaveText('Saving…');
    await doc().fill('pending-note newest');
    await win().locator('.tl .c').click();
    await expect(doc()).toHaveAttribute('contenteditable', 'false');
    await expect(win()).not.toHaveClass(/closing/);
    await page.evaluate(() => globalThis.__releaseNoteLock());
    await expect(win()).toHaveCount(0);
    expect(await rows(`SELECT title FROM "${TABLE}" WHERE id = ?`, [initialId])).toEqual([['pending-note newest']]);
    result.pendingWriteSavesNewestBeforeClose = true;
    await open();
    const beforeCreate = await selectedId();
    await sql(`CREATE TRIGGER fail_note_create BEFORE INSERT ON "${TABLE}"
      BEGIN SELECT RAISE(ABORT, 'Cannot create note'); END`);
    await newNote();
    await expect(win().getByRole('alert')).toContainText('Local storage could not complete this change');
    expect(await selectedId()).toBe(beforeCreate);
    await sql('DROP TRIGGER fail_note_create');
    await newNote();
    await expect.poll(selectedId).not.toBe(beforeCreate);
    const createdId = await selectedId();
    await expect(doc()).toContainText('New Note');
    result.createFailureAndRecovery = true;
    await sql(`CREATE TRIGGER fail_note_delete BEFORE UPDATE ON "${TABLE}"
      WHEN NEW.folder = 'Recently Deleted' BEGIN SELECT RAISE(ABORT, 'Cannot delete note'); END`);
    await menu('Delete Note');
    await expect(win().getByRole('alert')).toContainText('Local storage could not complete this change');
    expect(await selectedId()).toBe(createdId);
    expect(await rows(`SELECT folder FROM "${TABLE}" WHERE id = ?`, [createdId])).toEqual([['Notes']]);
    await sql('DROP TRIGGER fail_note_delete');
    await menu('Delete Note');
    await expect(win().locator(`[data-id="${createdId}"]`)).toHaveCount(0);
    expect(await rows(`SELECT folder FROM "${TABLE}" WHERE id = ?`, [createdId])).toEqual([['Recently Deleted']]);
    result.deleteFailureAndRecovery = true;

    await win().locator(`[data-id="${initialId}"]`).click();
    const second = await session.openDesktopPage({ waitForFinder: false });
    await second.helpers.restored();
    await second.helpers.closeAll();
    await second.helpers.launch('Notes');
    const secondWin = second.helpers.win('notes');
    await secondWin.locator(`[data-id="${initialId}"]`).click();
    await secondWin.getByRole('textbox', { name: 'Note content', exact: true }).fill('remote-note');
    await expect(secondWin.getByRole('status')).toHaveText('Saved');
    await expect(secondWin.locator(`[data-id="${initialId}"]`)).toContainText('remote-note');
    await doc().fill('local-note preserves draft');
    await expect(win().getByRole('alert')).toContainText('changed in another window');
    expect(await rows(`SELECT title FROM "${TABLE}" WHERE id = ?`, [initialId])).toEqual([['remote-note']]);
    await expect(doc()).toHaveText('local-note preserves draft');
    result.crossWindowConflict = true;
    await sql(`CREATE TRIGGER fail_note_copy BEFORE INSERT ON "${TABLE}"
      BEGIN SELECT RAISE(ABORT, 'Cannot save note copy'); END`);
    await win().getByRole('button', { name: 'Save a Copy', exact: true }).click();
    await expect(win().getByRole('alert')).toContainText('Local storage could not complete this change');
    await expect(doc()).toHaveText('local-note preserves draft');
    await sql('DROP TRIGGER fail_note_copy');
    await win().getByRole('button', { name: 'Save a Copy', exact: true }).click();
    await expect(win().getByRole('status')).toHaveText('Saved');
    await expect.poll(selectedId).not.toBe(initialId);
    const copyId = await selectedId();
    expect(await rows(`SELECT id FROM "${TABLE}" WHERE title = ?`, ['local-note preserves draft'])).toEqual([[copyId]]);
    expect(await rows(`SELECT title FROM "${TABLE}" WHERE id = ?`, [initialId])).toEqual([['remote-note']]);
    result.copyFailureAndRecovery = true;
    await second.helpers.closeAll();
    await second.page.close();
    await sql(`DELETE FROM "${TABLE}" WHERE id = ?`, [copyId]);
    await doc().fill('deleted-note local draft');
    await expect(win().getByRole('alert')).toContainText('no longer available');
    await expect(doc()).toHaveText('deleted-note local draft');
    await win().getByRole('button', { name: 'Discard Changes', exact: true }).click();
    await expect(win().getByRole('status')).toHaveText('Saved');
    await expect(doc()).not.toHaveText('deleted-note local draft');
    await expect(win().getByRole('alert')).toHaveCount(0);
    expect(await rows(`SELECT id FROM "${TABLE}" WHERE id = ?`, [copyId])).toEqual([]);
    result.deletedNoteAndDiscard = true;
    expect(await page.evaluate(() => globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
    await helpers.closeAll();
    return { noteDrafts: result };
  }
};
