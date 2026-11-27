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

    await expect(rows()).toHaveCount(13);
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
    await expect(rows()).toHaveCount(13);
    result.clearsSearch = true;

    await rows().filter({ hasText: 'General' }).click();
    await expect(title).toHaveText('General');
    result.sectionFollowsSelection = true;

    /* 头像账户详情页（ADESK-US-131）：点头像进 Apple Account 分区，内容信息在上、退出按钮在页尾。 */
    const account = window.locator('[data-account]');
    await account.click();
    await expect(title).toHaveText('Apple Account');
    await expect(window.locator('[data-account-pane]')).toBeVisible();
    await expect(window.locator('[data-account-pane]')).toContainText('Sign-In & Security');
    await expect(window.locator('[data-account-signout]')).toBeVisible();
    result.accountMenu = true;

    /* 键盘路径：焦点在头像行上按 Enter 同样进入账户页。 */
    await rows().filter({ hasText: 'General' }).click();
    await expect(title).toHaveText('General');
    await account.focus();
    await page.keyboard.press('Enter');
    await expect(title).toHaveText('Apple Account');
    result.accountMenuKeyboard = true;

    /* Sign Out… 先要确认：取消不改变任何数据，页面留在原地。 */
    await window.locator('[data-account-signout]').click();
    await expect(window.locator('[data-account-warning]')).toContainText('permanently removed');
    await window.locator('[data-account-cancel]').click();
    await expect(window.locator('[data-account-warning]')).toHaveCount(0);
    result.signOutConfirmCancel = true;

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
    await expect(title).toHaveText('Apple Account');
    await window.locator('[data-account-signout]').click();
    const confirm = window.locator('[data-account-confirm]');
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
