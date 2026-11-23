import AxeBuilder from '@axe-core/playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { pressUntil } from '../harness/a11y.mjs';
import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const TABLE = 'desktop$mail_message';

export const localMail = {
  name: 'local-mail',
  description: '本地邮件草稿、面板恢复、真实写失败、并发冲突、副本与搜索',
  keys: [
    'localMail.localScope',
    'localMail.failedSaveKeepsFields',
    'localMail.hiddenAndReplacedPanelKeepsDraft',
    'localMail.closeAndRestartKeepDraft',
    'localMail.retrySavesOneLocalDraft',
    'localMail.pendingSaveBlocksClose',
    'localMail.persistedDraftEditable',
    'localMail.searchAndFlagFailure',
    'localMail.conflictAndCopyRecovery',
    'localMail.deletedDraftRetained',
    'localMail.replyAndForwardContent',
    'localMail.sharedContentDrafts',
    'localMail.finderShareCreatesDraft',
    'localMail.beforeUnloadGuard',
    'localMail.keyboardRecovery',
    'localMail.noViolations'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('local-mail');
    const sql = (statement, bindings) => surgery(session, db => db.shell.execute(statement, bindings));
    const rows = (statement, bindings) => surgery(session, db => db.shell.rows(statement, bindings));
    const win = () => helpers.win('mail');
    const panel = () => page.getByRole('dialog', { name: 'Local mail draft', exact: true });
    const field = name => panel().getByRole('textbox', { name, exact: true });
    const open = async () => {
      await helpers.launch('Mail');
      await expect(win().locator('[data-mread] h2')).toBeVisible();
    };
    const resume = async () => {
      await win().getByRole('button', { name: 'Resume Draft', exact: true }).click();
      await expect(panel()).toBeVisible();
    };
    const choose = async (host, selector, name) => {
      await host.locator(selector).click();
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    await session.openDesktop();
    await helpers.closeAll();
    await open();
    await expect(win()).toContainText('No email service is connected');
    await expect(win().locator('[data-box="Sent"]')).toContainText('Local Sent Archive');
    const sentCount = await rows(`SELECT count(*) FROM "${TABLE}" WHERE mailbox = 'Sent'`);
    result.localScope = true;
    await win().getByRole('button', { name: 'New Mail Draft' }).click();
    await expect(panel()).toBeVisible();
    await field('To').fill('local@example.invalid');
    await field('Subject').fill('failed-mail title');
    await field('Message').fill('Local draft 🌏\nSecond line');
    const id = await panel().getAttribute('data-draft-id');
    await sql(`CREATE TRIGGER fail_mail_create BEFORE INSERT ON "${TABLE}"
      WHEN NEW.subject LIKE 'failed-%' BEGIN SELECT RAISE(ABORT, 'Cannot store local mail'); END`);
    await panel().getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('Local storage could not complete this change');
    await expect(field('To')).toHaveValue('local@example.invalid');
    await expect(field('Subject')).toHaveValue('failed-mail title');
    await expect(field('Message')).toHaveValue('Local draft 🌏\nSecond line');
    expect(await rows(`SELECT id FROM "${TABLE}" WHERE id = ?`, [id])).toEqual([]);
    result.failedSaveKeepsFields = true;
    const axe = await new AxeBuilder({ page }).include('app-mail-compose').analyze();
    result.noViolations = axe.violations;
    await page.screenshot({ path: '/tmp/aiao-mail-failure.png' });
    expect(await page.evaluate(() => globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(
      false
    );
    result.beforeUnloadGuard = true;
    await panel().getByRole('button', { name: 'Hide Draft' }).click();
    await expect(panel()).toHaveCount(0);
    await resume();
    await expect(field('Message')).toHaveValue('Local draft 🌏\nSecond line');
    await field('Subject').press('Escape');
    await expect(panel()).toHaveCount(0);
    await win().getByRole('button', { name: 'New Mail Draft' }).click();
    await expect(panel().getByRole('alert').filter({ hasText: 'Finish the current draft' })).toBeVisible();
    await expect(field('Subject')).toHaveValue('failed-mail title');
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(panel()).toHaveCount(0);
    await resume();
    await expect(panel()).toHaveAttribute('data-draft-id', id);
    result.hiddenAndReplacedPanelKeepsDraft = true;
    await panel().getByRole('button', { name: 'Hide Draft' }).click();
    await win().locator('.tl .c').click();
    await expect(panel().getByRole('alert').filter({ hasText: 'There is an unsaved mail draft' })).toBeVisible();
    await expect(win()).not.toHaveClass(/closing/);
    await panel().getByRole('button', { name: 'Hide Draft' }).click();
    await page.getByRole('menuitem', { name: 'Apple', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restart…', exact: true }).click();
    await expect(panel().getByRole('alert').filter({ hasText: 'There is an unsaved mail draft' })).toBeVisible();
    await expect(field('Message')).toHaveValue('Local draft 🌏\nSecond line');
    result.closeAndRestartKeepDraft = true;
    await sql('DROP TRIGGER fail_mail_create');
    const reached = await pressUntil(page, focus => focus.name === 'Retry Save Draft');
    expect(reached.found).toBe(true);
    await page.keyboard.press('Enter');
    await expect(panel()).toHaveCount(0);
    expect(await rows(`SELECT mailbox, recipient, subject, body FROM "${TABLE}" WHERE id = ?`, [id])).toEqual([
      ['Drafts', 'local@example.invalid', 'failed-mail title', 'Local draft 🌏\nSecond line']
    ]);
    expect(await rows(`SELECT count(*) FROM "${TABLE}" WHERE mailbox = 'Sent'`)).toEqual(sentCount);
    result.retrySavesOneLocalDraft = true;
    result.keyboardRecovery = true;
    await win().locator('[data-box="Drafts"]').click();
    await expect(win().locator(`[data-mail-id="${id}"]`)).toHaveCount(1);
    await win().getByRole('button', { name: 'Edit Draft', exact: true }).click();
    await expect(field('Message')).toHaveValue('Local draft 🌏\nSecond line');
    await field('Message').fill('Edited saved draft\nPreserved newline');
    await page.evaluate(
      () =>
        new Promise(resolve => {
          globalThis.__mailLock = navigator.locks.request(
            'aiao-desktop-data-write',
            () =>
              new Promise(release => {
                globalThis.__releaseMailLock = release;
                resolve();
              })
          );
        })
    );
    await panel().getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(panel().getByRole('status')).toHaveText('Saving draft…');
    await expect(field('Message')).toBeDisabled();
    await expect(panel().getByRole('button', { name: 'Discard Changes', exact: true })).toBeDisabled();
    await panel().getByRole('button', { name: 'Hide Draft' }).click();
    await win().locator('.tl .c').click();
    await expect(win()).not.toHaveClass(/closing/);
    await page.evaluate(() => globalThis.__releaseMailLock());
    await expect(win()).toHaveCount(0);
    expect(await rows(`SELECT body FROM "${TABLE}" WHERE id = ?`, [id])).toEqual([
      ['Edited saved draft\nPreserved newline']
    ]);
    result.pendingSaveBlocksClose = true;
    await session.reloadDesktop(page, { finder: false });
    await open();
    await win().locator('[data-box="Drafts"]').click();
    await expect(win().locator('[data-mread] p').first()).toHaveText('Edited saved draft\nPreserved newline');
    await win().getByRole('button', { name: 'Edit Draft', exact: true }).click();
    await expect(field('To')).toHaveValue('local@example.invalid');
    await expect(field('Message')).toHaveValue('Edited saved draft\nPreserved newline');
    await panel().getByRole('button', { name: 'Hide Draft' }).click();
    result.persistedDraftEditable = true;
    for (const query of ['LOCAL@EXAMPLE', 'FAILED-MAIL', 'preserved newline']) {
      await win().getByRole('textbox', { name: 'Search mail', exact: true }).fill(query);
      await expect(win().locator(`[data-mail-id="${id}"]`)).toHaveCount(1);
    }
    await win().getByRole('textbox', { name: 'Search mail', exact: true }).fill('not found');
    await expect(win().locator('[data-mail-id]')).toHaveCount(0);
    await win().getByRole('textbox', { name: 'Search mail', exact: true }).fill('');
    await sql(`CREATE TRIGGER fail_mail_flag BEFORE UPDATE ON "${TABLE}"
      BEGIN SELECT RAISE(ABORT, 'Cannot change mail'); END`);
    await win().getByRole('button', { name: 'Flag', exact: true }).click();
    await expect(win().getByRole('alert')).toContainText('Local storage could not complete this change');
    await expect(win().getByRole('button', { name: 'Flag', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await sql('DROP TRIGGER fail_mail_flag');
    await win().getByRole('button', { name: 'Flag', exact: true }).click();
    await expect(win().getByRole('button', { name: 'Flag', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(win().getByRole('alert')).toHaveCount(0);
    result.searchAndFlagFailure = true;

    await win().getByRole('button', { name: 'Edit Draft', exact: true }).click();
    await field('Message').fill('Local conflict body');
    const second = await session.openDesktopPage({ waitForFinder: false });
    await second.helpers.restored();
    await second.helpers.closeAll();
    await second.helpers.launch('Mail');
    const remote = second.helpers.win('mail');
    await remote.locator('[data-box="Drafts"]').click();
    await remote.getByRole('button', { name: 'Edit Draft', exact: true }).click();
    const remotePanel = second.page.getByRole('dialog', { name: 'Local mail draft', exact: true });
    await remotePanel.getByRole('textbox', { name: 'Message', exact: true }).fill('Remote saved body');
    await remotePanel.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(remotePanel).toHaveCount(0);
    await panel().getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('changed in another window');
    expect(await rows(`SELECT body FROM "${TABLE}" WHERE id = ?`, [id])).toEqual([['Remote saved body']]);
    await sql(`CREATE TRIGGER fail_mail_copy BEFORE INSERT ON "${TABLE}"
      BEGIN SELECT RAISE(ABORT, 'Cannot save copy'); END`);
    await panel().getByRole('button', { name: 'Save a Copy', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('Local storage could not complete this change');
    await expect(field('Message')).toHaveValue('Local conflict body');
    const copyId = await panel().getAttribute('data-draft-id');
    expect(copyId).not.toBe(id);
    await sql('DROP TRIGGER fail_mail_copy');
    await panel().getByRole('button', { name: 'Retry Save Draft', exact: true }).click();
    await expect(panel()).toHaveCount(0);
    expect(await rows(`SELECT id FROM "${TABLE}" WHERE body = ?`, ['Local conflict body'])).toEqual([[copyId]]);
    expect(await rows(`SELECT body FROM "${TABLE}" WHERE id = ?`, [id])).toEqual([['Remote saved body']]);
    result.conflictAndCopyRecovery = true;
    await second.helpers.closeAll();
    await second.page.close();
    await win().locator(`[data-mail-id="${copyId}"]`).click();
    await win().getByRole('button', { name: 'Edit Draft', exact: true }).click();
    await field('Message').fill('Deleted draft preserved');
    await sql(`DELETE FROM "${TABLE}" WHERE id = ?`, [copyId]);
    await panel().getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('no longer available');
    await expect(field('Message')).toHaveValue('Deleted draft preserved');
    await panel().getByRole('button', { name: 'Discard Changes', exact: true }).click();
    await expect(panel()).toHaveCount(0);
    expect(await rows(`SELECT body FROM "${TABLE}" WHERE id = ?`, [copyId])).toEqual([]);
    result.deletedDraftRetained = true;
    await win().locator('[data-box="Inbox"]').click();
    await expect(win().locator('[data-box="Inbox"]')).toHaveAttribute('aria-pressed', 'true');
    const sourceBody = (await win().locator('[data-mread] p').first().innerText()).trim();
    const sourceTitle = await win().locator('[data-mread] h2').innerText();
    await choose(win(), '[data-mshare]', 'Reply');
    await expect(field('Subject')).toHaveValue(`Re: ${sourceTitle}`);
    expect(await field('Message').inputValue()).toContain(sourceBody);
    await panel().getByRole('button', { name: 'Discard Changes', exact: true }).click();
    await choose(win(), '[data-mshare]', 'Forward');
    await expect(field('Subject')).toHaveValue(`Fwd: ${sourceTitle}`);
    expect(await field('Message').inputValue()).toContain(sourceBody);
    await panel().getByRole('button', { name: 'Discard Changes', exact: true }).click();
    result.replyAndForwardContent = true;
    await helpers.closeAll();
    const imageName = 'Screenshot 2026-07-27 at 4.34.11 PM.png';
    await helpers.desktopIcon(imageName).dblclick();
    const preview = helpers.win('preview');
    await expect(preview.locator('[data-pv-image]')).toBeVisible();
    await choose(preview, '[data-pvshare]', 'Mail Draft');
    await expect(field('Subject')).toHaveValue(imageName);
    expect(await field('Message').inputValue()).toContain(imageName);
    await panel().getByRole('button', { name: 'Discard Changes', exact: true }).click();
    await helpers.closeAll();
    await helpers.launch('Photos');
    const photos = helpers.win('photos');
    await photos.locator('[data-pi]').first().dblclick();
    await expect(photos.locator('.stage img')).toBeVisible();
    const url = await photos.locator('.stage img').getAttribute('src');
    await choose(photos, '[data-pshare]', 'Mail Draft');
    expect((await field('Message').inputValue()).replace(/\/\d+px-/, '/')).toBe(url.replace(/\/\d+px-/, '/'));
    await panel().getByRole('button', { name: 'Discard Changes', exact: true }).click();

    await helpers.closeAll();
    await helpers.launch('Finder');
    const finder = helpers.win('finder');
    await finder.locator('[data-place="Desktop"]').click();
    const sharedFile = finder.locator('[role="option"][data-name="Screenshot 2026-07-27 at 4.34.11 PM.png"]');
    await sharedFile.click();
    await finder.locator('[data-share]').click();
    await expect(field('Subject')).toHaveValue('Share Screenshot 2026-07-27 at 4.34.11 PM.png');
    const finderBody = await field('Message').inputValue();
    expect(finderBody).toContain('Screenshot 2026-07-27 at 4.34.11 PM.png');
    expect(finderBody).toContain('/Users/stevejobs/Desktop/');
    await panel().getByRole('button', { name: 'Discard Changes', exact: true }).click();
    result.sharedContentDrafts = true;
    result.finderShareCreatesDraft = true;
    expect(await page.evaluate(() => globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(
      true
    );
    await helpers.closeAll();
    return { localMail: result };
  }
};
