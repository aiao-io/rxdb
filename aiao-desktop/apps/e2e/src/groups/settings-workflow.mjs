import { expect as playwrightExpect } from 'playwright/test';

import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });

export const settingsWorkflow = {
  name: 'settings-workflow',
  description: 'Settings 本地分区搜索、空结果、分区选择与账户退出',
  keys: [
    'settingsWorkflow.initialSections',
    'settingsWorkflow.searchesBySection',
    'settingsWorkflow.emptySearch',
    'settingsWorkflow.clearsSearch',
    'settingsWorkflow.sectionFollowsSelection',
    'settingsWorkflow.accountMenu',
    'settingsWorkflow.accountMenuKeyboard',
    'settingsWorkflow.signOutConfirmCancel',
    'settingsWorkflow.muteSwitchMutesSystem',
    'settingsWorkflow.signOutErasesAndReloads'
  ],
  async run(session) {
    const { helpers, page } = session;
    const result = traced('settings-workflow');

    await session.openDesktop();
    await helpers.closeAll();
    await helpers.launch('Settings');

    const window = helpers.win('settings');
    await expect(window).toBeVisible();
    await expect(window).not.toHaveClass(/opening/);

    const search = window.getByRole('textbox', { name: 'Search settings', exact: true });
    const rows = () => window.locator('[data-sec]');
    const title = window.locator('[data-sttitle]');

    await expect(rows()).toHaveCount(12);
    result.initialSections = true;

    await search.fill('Network');
    await expect(rows()).toHaveCount(1);
    await expect(rows().first()).toContainText('Network');
    await rows().first().click();
    await expect(title).toHaveText('Network');
    result.searchesBySection = true;

    await search.fill('missing');
    await expect(rows()).toHaveCount(0);
    await expect(window.locator('[data-settings-empty]')).toHaveText('No matching settings');
    result.emptySearch = true;

    await search.fill('');
    await expect(rows()).toHaveCount(12);
    result.clearsSearch = true;

    await rows().filter({ hasText: 'General' }).click();
    await expect(title).toHaveText('General');
    result.sectionFollowsSelection = true;

    /* 头像账户菜单（ADESK-US-131）：点开、Esc 收起、键盘路径与确认视图。弹出层浮在窗口上面，是页面级元素。 */
    const account = window.locator('[data-account]');
    const menu = page.locator('[role="dialog"][aria-label="Apple Account"]');
    await account.click();
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Apple Account');
    await expect(menu.getByRole('button', { name: 'Sign Out…', exact: true })).toBeVisible();
    result.accountMenu = true;

    /* Esc 收起；菜单开着时点外面的全屏护罩同样收起。 */
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    /* 键盘路径：焦点在头像行上按 Enter 打开并接管焦点，Esc 关闭后焦点回到头像行。 */
    await account.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-account-signout]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(account).toBeFocused();
    result.accountMenuKeyboard = true;

    /* 重新打开，Sign Out… 先要确认：取消不改变任何数据，菜单留在原地。 */
    await account.click();
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'Sign Out…', exact: true }).click();
    await expect(menu.locator('[data-account-warning]')).toContainText('permanently removed');
    await menu.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(menu.locator('[data-account-warning]')).toHaveCount(0);
    result.signOutConfirmCancel = true;

    /* 收起菜单，再进 Sound 分区。 */
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    /* Mute 开关写回系统的静音状态：菜单栏音量图标跟着变，最后停在静音（后面退出用「数据被清掉」验证）。 */
    await rows().filter({ hasText: 'Sound' }).click();
    await expect(title).toHaveText('Sound');
    const mute = window.locator('[data-k="mute"]');
    const volume = page.locator('[data-st="vol"]');
    await expect(mute).not.toHaveClass(/\bon\b/);
    await mute.click();
    await expect(mute).toHaveClass(/\bon\b/);
    await expect(volume).toHaveAttribute('aria-label', 'Sound, muted');
    await mute.click();
    await expect(mute).not.toHaveClass(/\bon\b/);
    await expect(volume).toHaveAttribute('aria-label', /^Sound, \d+%$/);
    await mute.click();
    await expect(volume).toHaveAttribute('aria-label', 'Sound, muted');
    result.muteSwitchMutesSystem = true;

    /* 退出：确认后抹掉全部本地数据并刷新页面，新的桌面回到默认状态（刚开的静音随数据一起没了）。 */
    await account.click();
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'Sign Out…', exact: true }).click();
    const confirm = menu.getByRole('button', { name: 'Sign Out', exact: true });
    await expect(confirm).toBeVisible();
    const reloaded = page.waitForEvent('domcontentloaded');
    await confirm.click();
    await reloaded;
    await helpers.win('finder').waitFor();
    await expect(page.locator('[data-st="vol"]')).toHaveAttribute('aria-label', /^Sound, \d+%$/);
    result.signOutErasesAndReloads = true;

    await helpers.closeAll();
    return { settingsWorkflow: result };
  }
};
