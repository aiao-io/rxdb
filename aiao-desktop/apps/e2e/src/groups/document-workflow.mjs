import { expect as playwrightExpect } from 'playwright/test';

import { PREFERENCES, surgery } from '../harness/database.mjs';
import { diskText, filePanel, traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });

export const documentWorkflow = {
  name: 'document-workflow',
  description: 'TextEdit 新建保存、另存、关闭取消、批量退出与冲突保护',
  keys: [
    'documentWorkflow.saveBarHasOpaqueBackground',
    'documentWorkflow.newDocumentSaved',
    'documentWorkflow.reopenedBytesMatch',
    'documentWorkflow.savedPathRestored',
    'documentWorkflow.saveAsKeepsOriginal',
    'documentWorkflow.cancelCloseKeepsDraft',
    'documentWorkflow.discardCloses',
    'documentWorkflow.saveOnClose',
    'documentWorkflow.cancelSaveKeepsDraft',
    'documentWorkflow.concurrentConflict',
    'documentWorkflow.conflictCanSaveCopy',
    'documentWorkflow.quitCancellationIsAtomic',
    'documentWorkflow.keyboardDialogFocus',
    'documentWorkflow.beforeUnloadProtectsDraft',
    'documentWorkflow.restartCancellationKeepsSession',
    'documentWorkflow.savedDocumentDoesNotBlockUnload'
  ],
  async run(session) {
    const { page, helpers } = session;
    await session.openDesktop();
    await helpers.closeAll();
    const editor = () => helpers.win('textedit').last();
    const text = () => editor().locator('[data-te-doc]');
    const panel = filePanel(page);
    const prompt = () => page.getByRole('alertdialog', { name: 'Save changes before closing?' });
    const saveOnDesktop = async name => {
      await expect(panel.panel).toBeVisible();
      if (!(await panel.location()).endsWith('Desktop')) {
        await panel.up.click();
        await panel.row('Desktop').dblclick();
      }
      await panel.name.fill(name);
      await panel.confirm.click();
      await expect(panel.panel).toHaveCount(0);
      await expect(editor().getByRole('status')).toContainText('Saved');
    };
    const close = async () => {
      await editor().locator('.tl .c').click();
    };
    const openFile = async name => {
      await helpers.desktopIcon(name).dblclick();
      await expect(editor()).toBeVisible();
      await expect(editor().getByRole('status')).toContainText('Saved');
    };
    const result = traced('document-workflow');
    await helpers.launch('TextEdit');
    result.saveBarHasOpaqueBackground = await editor()
      .getByRole('status')
      .evaluate(element => getComputedStyle(element).backgroundColor.startsWith('rgb('));
    await text().fill('新建文档 🌏\n第二行');
    await editor().getByRole('button', { name: 'Save', exact: true }).click();
    await saveOnDesktop('document-workflow.txt');
    result.savedDocumentDoesNotBlockUnload = await page.evaluate(() =>
      window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
    );
    result.newDocumentSaved = (await diskText(session, 'document-workflow.txt')) === '新建文档 🌏\n第二行';
    const layoutKey = `windows:layout:${await page.evaluate(() => sessionStorage.getItem('aiao-desktop:tab-id'))}`;
    await surgery(session, async db => {
      await expect
        .poll(async () => {
          const rows = await db.shell.rows(`SELECT "value" FROM "${PREFERENCES}" WHERE "key" = ?`, [layoutKey]);
          const layout = rows[0] ? JSON.parse(rows[0][0]) : null;
          return layout?.windows.find(item => item.appId === 'textedit')?.options.nodePath;
        })
        .toEqual(['Users', 'stevejobs', 'Desktop', 'document-workflow.txt']);
    });
    await page.reload({ waitUntil: 'load' });
    await expect(editor()).toBeVisible();
    await expect(editor().getByRole('status')).toContainText('Saved');
    result.savedPathRestored =
      (await editor().getAttribute('aria-label')) === 'document-workflow.txt' &&
      (await text().innerText()) === '新建文档 🌏\n第二行';
    await close();
    await expect(helpers.win('textedit')).toHaveCount(0);
    await openFile('document-workflow.txt');
    result.reopenedBytesMatch = (await text().innerText()) === '新建文档 🌏\n第二行';

    await text().fill('副本内容');
    await editor().getByRole('button', { name: 'Save As…', exact: true }).click();
    await saveOnDesktop('document-copy.txt');
    result.saveAsKeepsOriginal =
      (await diskText(session, 'document-workflow.txt')) === '新建文档 🌏\n第二行' &&
      (await diskText(session, 'document-copy.txt')) === '副本内容';
    await text().fill('keep draft');
    result.beforeUnloadProtectsDraft = !(await page.evaluate(() =>
      window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
    ));
    await page.getByRole('menuitem', { name: 'Apple', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restart…', exact: true }).click();
    await expect(prompt()).toBeVisible();
    await prompt().getByRole('button', { name: 'Cancel', exact: true }).click();
    result.restartCancellationKeepsSession =
      (await page.locator('#boot').count()) === 0 && (await text().innerText()) === 'keep draft';
    await close();
    await expect(prompt()).toBeVisible();
    await prompt().getByRole('button', { name: 'Cancel', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    result.keyboardDialogFocus = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('.document-dialog'))
    );
    await page.keyboard.press('Escape');
    await expect(prompt()).toHaveCount(0);
    result.cancelCloseKeepsDraft = (await text().innerText()) === 'keep draft';
    await close();
    await prompt().getByRole('button', { name: 'Don’t Save', exact: true }).click();
    await expect(helpers.win('textedit')).toHaveCount(0);
    result.discardCloses = (await diskText(session, 'document-copy.txt')) === '副本内容';

    await helpers.launch('TextEdit');
    await text().fill('save on close');
    await close();
    await prompt().getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(panel.panel).toBeVisible();
    await panel.cancel.click();
    await expect(panel.panel).toHaveCount(0);
    result.cancelSaveKeepsDraft = (await text().innerText()) === 'save on close';
    await close();
    await prompt().getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(panel.panel).toBeVisible();
    await panel.up.click();
    await panel.row('Desktop').dblclick();
    await panel.name.fill('document-close.txt');
    await panel.confirm.click();
    await expect(helpers.win('textedit')).toHaveCount(0);
    result.saveOnClose = (await diskText(session, 'document-close.txt')) === 'save on close';

    await openFile('document-workflow.txt');
    const first = helpers.win('textedit').first();
    await text().fill('first writer');
    await openFile('document-workflow.txt');
    const second = helpers.win('textedit').last();
    await second.locator('[data-te-doc]').fill('second writer');
    await first.getByRole('button', { name: 'Save', exact: true, includeHidden: true }).dispatchEvent('click');
    await expect(first.getByRole('status', { includeHidden: true })).toContainText('Saved');
    await second.getByRole('button', { name: 'Save', exact: true, includeHidden: true }).dispatchEvent('click');
    await expect(second.getByRole('alert')).toContainText('changed in another window');
    result.concurrentConflict =
      (await diskText(session, 'document-workflow.txt')) === 'first writer' &&
      (await second.locator('[data-te-doc]').innerText()) === 'second writer';
    await second.getByRole('button', { name: 'Save As…', exact: true }).click();
    await saveOnDesktop('document-conflict.txt');
    result.conflictCanSaveCopy = (await diskText(session, 'document-conflict.txt')) === 'second writer';

    await first.locator('[data-te-doc]').fill('first dirty');
    await second.locator('[data-te-doc]').fill('second dirty');
    await page.getByRole('menuitem', { name: 'TextEdit', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Quit TextEdit', exact: false }).click();
    await expect(prompt()).toBeVisible();
    await prompt().getByRole('button', { name: 'Don’t Save', exact: true }).click();
    await expect(prompt()).toBeVisible();
    await prompt().getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(helpers.win('textedit')).toHaveCount(2);
    result.quitCancellationIsAtomic =
      (await first.locator('[data-te-doc]').innerText()) === 'first dirty' &&
      (await second.locator('[data-te-doc]').innerText()) === 'second dirty';
    return { documentWorkflow: result };
  }
};
