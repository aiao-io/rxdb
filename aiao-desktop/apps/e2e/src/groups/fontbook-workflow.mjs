import { expect as playwrightExpect } from 'playwright/test';

import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });

export const fontbookWorkflow = {
  name: 'fontbook-workflow',
  description: 'Font Book 本地字体搜索、空结果与详情联动',
  keys: [
    'fontbookWorkflow.initialFamilies',
    'fontbookWorkflow.searchesByFamily',
    'fontbookWorkflow.emptySearch',
    'fontbookWorkflow.clearsSearch',
    'fontbookWorkflow.detailFollowsSelection'
  ],
  async run(session) {
    const { helpers } = session;
    const result = traced('fontbook-workflow');

    await session.openDesktop();
    await helpers.closeAll();
    await helpers.launch('Font Book');

    const window = helpers.win('fontbook');
    await expect(window).toBeVisible();
    await expect(window).not.toHaveClass(/opening/);

    const search = window.getByRole('textbox', { name: 'Search fonts', exact: true });
    const rows = () => window.locator('[data-fi]');
    const title = window.locator('[data-fname]');
    const body = window.locator('[data-fbody]');

    await expect(rows()).toHaveCount(8);
    result.initialFamilies = true;

    await search.fill('JetBrains');
    await expect(rows()).toHaveCount(1);
    await expect(rows().first()).toContainText('JetBrains Mono');
    await expect(title).toHaveText('JetBrains Mono');
    result.searchesByFamily = true;

    await search.fill('missing');
    await expect(rows()).toHaveCount(0);
    await expect(window.locator('[data-font-empty]')).toHaveText('No matching fonts');
    result.emptySearch = true;

    await search.fill('');
    await expect(rows()).toHaveCount(8);
    result.clearsSearch = true;

    await rows().filter({ hasText: 'Georgia' }).click();
    await expect(title).toHaveText('Georgia');
    await expect(body).toContainText('The quick brown fox jumps over the lazy dog');
    result.detailFollowsSelection = true;

    await helpers.closeAll();
    return { fontbookWorkflow: result };
  }
};
