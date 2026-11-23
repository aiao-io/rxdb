import { expect as playwrightExpect } from 'playwright/test';

import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });

export const settingsWorkflow = {
  name: 'settings-workflow',
  description: 'Settings 本地分区搜索、空结果与分区选择',
  keys: [
    'settingsWorkflow.initialSections',
    'settingsWorkflow.searchesBySection',
    'settingsWorkflow.emptySearch',
    'settingsWorkflow.clearsSearch',
    'settingsWorkflow.sectionFollowsSelection',
    'settingsWorkflow.muteSwitchMutesSystem'
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

    await expect(rows()).toHaveCount(11);
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
    await expect(rows()).toHaveCount(11);
    result.clearsSearch = true;

    await rows().filter({ hasText: 'General' }).click();
    await expect(title).toHaveText('General');
    result.sectionFollowsSelection = true;

    /* Mute 开关写回系统的静音状态：菜单栏音量图标跟着变，再点一次恢复。 */
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
    result.muteSwitchMutesSystem = true;

    await helpers.closeAll();
    return { settingsWorkflow: result };
  }
};
