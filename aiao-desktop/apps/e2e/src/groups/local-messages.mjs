import AxeBuilder from '@axe-core/playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { pressUntil } from '../harness/a11y.mjs';
import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const MESSAGES = 'desktop$chat_message';
const THREADS = 'desktop$chat_thread';

const contrast = element => {
  const style = getComputedStyle(element);
  const luminance = color => {
    const values = color.match(/[\d.]+/g).map(Number);
    if (values.length > 3 && values[3] !== 1) return null;
    const linear = values.slice(0, 3).map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const ink = luminance(style.color);
  const colors = style.backgroundImage.match(/rgba?\([^)]*\)/g) ?? [style.backgroundColor];
  return Math.min(
    ...colors.map(color => {
      const surface = luminance(color);
      if (ink === null || surface === null) return 0;
      return (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05);
    })
  );
};

export const localMessages = {
  name: 'local-messages',
  description: '本地会话范围、独立草稿、真实写入失败与重试、关闭等待及无假通讯',
  keys: [
    'localMessages.localScopeAndDetails',
    'localMessages.readableSelectionAndBubbles',
    'localMessages.draftsStayWithConversation',
    'localMessages.failedWriteKeepsDraft',
    'localMessages.unsavedCloseAndRestartBlocked',
    'localMessages.retryCreatesOneMessage',
    'localMessages.pendingSaveBlocksClose',
    'localMessages.noSyntheticReply',
    'localMessages.createFailureAndRecovery',
    'localMessages.missingConversationKeepsDraft',
    'localMessages.explicitDiscard',
    'localMessages.beforeUnloadGuard',
    'localMessages.persistenceAndKeyboard',
    'localMessages.noViolations'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('local-messages');
    const sql = (statement, bindings) => surgery(session, db => db.shell.execute(statement, bindings));
    const rows = (statement, bindings) => surgery(session, db => db.shell.rows(statement, bindings));
    const win = () => helpers.win('messages');
    const input = () => win().getByRole('textbox', { name: 'Local message draft', exact: true });
    const row = id => win().locator(`[data-cid="${id}"]`);
    const currentId = () => win().locator('.msg-c.on').getAttribute('data-cid');
    const open = async () => {
      await helpers.launch('Messages');
      await expect(input()).toBeEnabled();
      await expect(win().locator('.msg-c.on')).toHaveCount(1);
    };
    await session.openDesktop();
    await helpers.closeAll();
    await open();
    await expect(win()).toContainText('Nothing is sent to other people.');
    await expect(win().getByRole('button', { name: 'Calls unavailable' })).toBeDisabled();
    const details = win().getByRole('button', { name: 'Local conversation details', exact: true });
    await details.focus();
    await details.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Local conversation details', exact: true });
    await expect(dialog).toContainText('No messaging or calling service is connected.');
    await expect(dialog.getByRole('button', { name: 'Close Details' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(details).toBeFocused();
    await win().getByRole('button', { name: 'Local conversation actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'File sending unavailable', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await page.keyboard.press('Escape');
    result.localScopeAndDetails = true;
    const ids = await win()
      .locator('[data-cid]')
      .evaluateAll(elements => elements.map(element => element.dataset.cid));
    const [firstId, secondId] = ids;
    expect(await win().locator('.msg-c.on').evaluate(contrast)).toBeGreaterThanOrEqual(4.5);
    expect(await win().locator('.bub.me').first().evaluate(contrast)).toBeGreaterThanOrEqual(4.5);
    result.readableSelectionAndBubbles = true;
    const initialCount = (await rows(`SELECT count(*) FROM "${MESSAGES}"`))[0][0];
    await input().fill('failed-first 🌏');
    const draftId = await input().getAttribute('data-message-draft-id');
    await row(secondId).click();
    await expect(input()).toHaveValue('');
    await input().fill('second-conversation-draft');
    await row(firstId).click();
    await expect(input()).toHaveValue('failed-first 🌏');
    await win().getByRole('textbox', { name: 'Search conversations' }).fill('second-conversation-draft');
    await expect(win().locator('[data-cid]')).toHaveCount(1);
    await row(secondId).click();
    await expect(input()).toHaveValue('second-conversation-draft');
    await win().getByRole('textbox', { name: 'Search conversations' }).fill('');
    await row(firstId).click();
    result.draftsStayWithConversation = true;
    expect(await page.evaluate(() => globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(
      false
    );
    result.beforeUnloadGuard = true;
    await sql(`CREATE TRIGGER fail_local_message BEFORE INSERT ON "${MESSAGES}"
      WHEN NEW.text LIKE 'failed-%' BEGIN SELECT RAISE(ABORT, 'Message storage unavailable'); END`);
    await input().press('Enter');
    await expect(win().getByRole('alert')).toContainText('Local storage could not complete this change. Try again.');
    await expect(input()).toHaveValue('failed-first 🌏');
    await expect(input()).toHaveAttribute('data-message-draft-id', draftId);
    expect(await rows(`SELECT id FROM "${MESSAGES}" WHERE id = ?`, [draftId])).toEqual([]);
    result.failedWriteKeepsDraft = true;
    const axe = await new AxeBuilder({ page }).include('.win[data-app="messages"]').analyze();
    result.noViolations = axe.violations;
    await page.screenshot({ path: '/tmp/aiao-messages-failure.png' });
    await win().locator('.tl .c').click();
    await expect(win()).not.toHaveClass(/closing/);
    await expect(win().getByRole('alert').filter({ hasText: 'There are unsaved drafts' })).toBeVisible();
    await expect(input()).toHaveValue('failed-first 🌏');
    await page.getByRole('menuitem', { name: 'Apple', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restart…', exact: true }).click();
    /* 重启现在是两步式（macOS 语义）：确认面板里点 Restart 才拆会话。 */
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(win().getByRole('alert').filter({ hasText: 'There are unsaved drafts' })).toBeVisible();
    expect(await rows(`SELECT count(*) FROM "${MESSAGES}"`)).toEqual([[initialCount]]);
    result.unsavedCloseAndRestartBlocked = true;
    await sql('DROP TRIGGER fail_local_message');
    const reached = await pressUntil(page, focus => focus.app === 'messages' && focus.name === 'Retry Local Save');
    expect(reached.found).toBe(true);
    await page.keyboard.press('Enter');
    await expect(input()).toHaveValue('');
    await expect(win().locator('.bub.me').filter({ hasText: 'failed-first 🌏' })).toHaveCount(1);
    expect(await rows(`SELECT thread_id, text FROM "${MESSAGES}" WHERE id = ?`, [draftId])).toEqual([
      [firstId, 'failed-first 🌏']
    ]);
    await row(secondId).click();
    await expect(input()).toHaveValue('second-conversation-draft');
    result.retryCreatesOneMessage = true;
    await page.waitForTimeout(1500);
    expect(await rows(`SELECT count(*) FROM "${MESSAGES}"`)).toEqual([[initialCount + 1]]);
    result.noSyntheticReply = true;
    await page.evaluate(
      () =>
        new Promise(resolve => {
          globalThis.__messageLock = navigator.locks.request(
            'aiao-desktop-data-write',
            () =>
              new Promise(release => {
                globalThis.__releaseMessageLock = release;
                resolve();
              })
          );
        })
    );
    await input().press('Enter');
    await expect(win().getByRole('status')).toHaveText('Saving locally…');
    await expect(input()).toBeDisabled();
    await expect(win().getByRole('button', { name: 'Discard Draft', exact: true })).toBeDisabled();
    await win().locator('.tl .c').click();
    await expect(win().getByRole('button', { name: 'New Conversation', exact: true })).toBeDisabled();
    await expect(win()).not.toHaveClass(/closing/);
    await page.evaluate(() => globalThis.__releaseMessageLock());
    await expect(win()).toHaveCount(0);
    expect(await rows(`SELECT thread_id FROM "${MESSAGES}" WHERE text = ?`, ['second-conversation-draft'])).toEqual([
      [secondId]
    ]);
    result.pendingSaveBlocksClose = true;
    await open();
    expect(await rows(`SELECT count(*) FROM "${MESSAGES}"`)).toEqual([[initialCount + 2]]);
    await session.reloadDesktop(page, { finder: false });
    await open();
    await row(firstId).click();
    await expect(win().locator('.bub.me').filter({ hasText: 'failed-first 🌏' })).toHaveCount(1);
    await row(secondId).click();
    await expect(win().locator('.bub.me').filter({ hasText: 'second-conversation-draft' })).toHaveCount(1);
    result.persistenceAndKeyboard = true;
    await sql(`CREATE TRIGGER fail_conversation_create BEFORE INSERT ON "${THREADS}"
      BEGIN SELECT RAISE(ABORT, 'Cannot create conversation'); END`);
    await win().getByRole('button', { name: 'New Conversation', exact: true }).click();
    await expect(win().getByRole('alert')).toContainText('Local storage could not complete this change');
    expect(await currentId()).toBe(secondId);
    await sql('DROP TRIGGER fail_conversation_create');
    await win().getByRole('button', { name: 'New Conversation', exact: true }).click();
    await expect
      .poll(async () => {
        const id = await currentId();
        return Boolean(id && !ids.includes(id));
      })
      .toBe(true);
    const created = await currentId();
    await expect(win().locator('.bub')).toHaveCount(0);
    expect(await rows(`SELECT id FROM "${MESSAGES}" WHERE thread_id = ?`, [created])).toEqual([]);
    result.createFailureAndRecovery = true;
    await input().fill('orphan draft must remain');
    await sql(`DELETE FROM "${THREADS}" WHERE id = ?`, [created]);
    await input().press('Enter');
    await expect(win().getByRole('alert')).toContainText('conversation is no longer available');
    await expect(input()).toHaveValue('orphan draft must remain');
    await win().locator('.tl .c').click();
    await expect(win()).not.toHaveClass(/closing/);
    await expect(input()).toHaveValue('orphan draft must remain');
    result.missingConversationKeepsDraft = true;
    await win().getByRole('button', { name: 'Discard Draft', exact: true }).click();
    await expect(input()).toHaveValue('');
    await expect(win().getByRole('alert')).toHaveCount(0);
    expect(await rows(`SELECT text FROM "${MESSAGES}" WHERE text = ?`, ['orphan draft must remain'])).toEqual([]);
    result.explicitDiscard = true;
    expect(await page.evaluate(() => globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(
      true
    );
    await helpers.closeAll();
    return { localMessages: result };
  }
};
