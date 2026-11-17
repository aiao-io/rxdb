import AxeBuilder from '@axe-core/playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { pressUntil } from '../harness/a11y.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });

export async function checkActivityAccessibility(session) {
  const { page, helpers } = session;
  await helpers.closeAll();
  await helpers.launch('Calculator');
  await helpers.win('calculator').waitFor();
  await helpers.launch('Activity Monitor');
  const monitor = helpers.win('activity');
  await expect(monitor.getByRole('table', { name: 'Running desktop windows' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('.win[data-app="activity"]').analyze();
  const show = await pressUntil(page, focus => focus.name === 'Show Calculator');
  expect(show.found).toBe(true);
  await page.keyboard.press('Enter');
  await expect(helpers.win('calculator')).toHaveClass(/front/);
  await helpers.launch('Activity Monitor');
  const close = await pressUntil(page, focus => focus.name === 'Close Calculator');
  expect(close.found).toBe(true);
  await page.keyboard.press('Enter');
  await expect(helpers.win('calculator')).toHaveCount(0);
  const result = { keyboardControls: true, noViolations: axe.violations };
  await helpers.closeAll();
  return result;
}

export const runtimeActivity = {
  name: 'runtime-activity',
  description: '真实运行窗口、装载失败与重试、最小化还原、关闭草稿协商和键盘无障碍',
  standins: ['aiao-code'],
  keys: [
    'runtimeActivity.realWindows',
    'runtimeActivity.hiddenWindowCanBeShown',
    'runtimeActivity.closeKeepsDraftNegotiation',
    'runtimeActivity.loadingAndFailureAreReal',
    'runtimeActivity.retryUpdatesStatus',
    'runtimeActivity.closeRemovesRow',
    'runtimeActivity.reopenHasCurrentState',
    'runtimeActivity.keyboardControls',
    'runtimeActivity.noViolations'
  ],
  async run(session) {
    const { page, helpers, aiaoCode } = session;
    const { win, launch } = helpers;
    await session.openDesktop();
    await helpers.closeAll();
    const result = traced('runtime-activity');
    const monitor = win('activity');
    const row = app => monitor.locator(`[data-activity-app="${app}"]`);
    await launch('Calculator');
    await expect(win('calculator')).toBeVisible();
    await launch('Activity Monitor');
    await expect(monitor.getByRole('table')).toBeVisible();
    const actual = await page.locator('.win:not(.closing)').evaluateAll(windows => windows.map(w => w.id).sort());
    const listed = await monitor
      .locator('[data-activity-id]')
      .evaluateAll(rows => rows.map(r => r.dataset.activityId).sort());
    expect(listed).toEqual(actual);
    await expect(monitor.locator('[data-activity-scope]')).toContainText('usage are not available');
    expect(await monitor.locator('[data-cpuring], [data-graph]').count()).toBe(0);
    result.realWindows = true;

    await row('calculator').getByRole('button', { name: 'Show Calculator' }).click();
    await expect(win('calculator')).toHaveClass(/front/);
    await win('calculator').locator('.tl .m').click();
    await launch('Activity Monitor');
    await expect(row('calculator')).toContainText('Minimized');
    await row('calculator').getByRole('button', { name: 'Show Calculator' }).click();
    await expect(win('calculator')).toHaveClass(/front/);
    await expect(win('calculator')).toBeVisible();
    result.hiddenWindowCanBeShown = true;

    await launch('TextEdit');
    const text = win('textedit').locator('[data-te-doc]');
    await text.fill('Keep this unsaved draft 从监视器关闭');
    await launch('Activity Monitor');
    await row('textedit')
      .getByRole('button', { name: /^Close / })
      .click();
    const prompt = page.getByRole('alertdialog', { name: 'Save changes before closing?' });
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(text).toHaveText('Keep this unsaved draft 从监视器关闭');
    await launch('Activity Monitor');
    await expect(row('textedit')).toHaveCount(1);
    result.closeKeepsDraftNegotiation = true;
    await row('textedit')
      .getByRole('button', { name: /^Close / })
      .click();
    await prompt.getByRole('button', { name: 'Don’t Save', exact: true }).click();
    await launch('Activity Monitor');
    await expect(row('textedit')).toHaveCount(0);
    result.closeRemovesRow = true;

    aiaoCode.mode = 'hold';
    await launch('Aiao Code');
    await expect(win('vscode').locator('[data-webapp-state="loading"]')).toBeVisible();
    await launch('Activity Monitor');
    await expect(row('vscode')).toContainText('Loading');
    await row('vscode').getByRole('button', { name: 'Close Aiao Code' }).click();
    await expect(row('vscode')).toHaveCount(0);
    aiaoCode.mode = 'fail';
    await launch('Aiao Code');
    await expect(win('vscode').locator('[data-webapp-state="failed"]')).toBeVisible();
    await launch('Activity Monitor');
    await expect(row('vscode')).toContainText('Failed');
    await expect(row('vscode').getByRole('alert')).not.toBeEmpty();
    result.loadingAndFailureAreReal = true;
    aiaoCode.mode = 'standard';
    await row('vscode').getByRole('button', { name: 'Show Aiao Code' }).click();
    await win('vscode').getByRole('button', { name: 'Try Again' }).click();
    await expect(win('vscode').locator('[data-webapp-state="ready"]')).toBeVisible();
    await launch('Activity Monitor');
    await expect(row('vscode')).toContainText('Ready');
    await expect(row('vscode').getByRole('alert')).toHaveCount(0);
    result.retryUpdatesStatus = true;
    await monitor.locator('.tl .c').click();
    await expect(monitor).toHaveCount(0);
    await launch('Activity Monitor');
    await expect(row('vscode')).toContainText('Ready');
    result.reopenHasCurrentState = true;
    await expect(monitor).not.toHaveClass(/opening/);
    await page.screenshot({ path: '/tmp/aiao-runtime-activity-ui.png' });
    Object.assign(result, await checkActivityAccessibility(session));
    return { runtimeActivity: result };
  }
};
