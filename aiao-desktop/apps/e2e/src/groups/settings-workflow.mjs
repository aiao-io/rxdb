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
    'settingsWorkflow.sectionFollowsSelection'
  ],
  async run(session) {
    const { helpers } = session;
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

    await helpers.closeAll();
    return { settingsWorkflow: result };
  }
};
