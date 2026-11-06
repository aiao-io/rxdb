import { expect, test, type Page } from '@playwright/test';
import { createCategory, expectStoredPreferences, openPreferences, resetE2eState } from './e2e-utils.js';

const DB_NAME_KEY = '__aiao_e2e_db_name__';

async function setLocale(page: Page, locale: 'zh-Hans' | 'en'): Promise<void> {
  await page.getByTestId('admin-widget-language').click();
  await page.getByRole('menuitemradio', { name: locale === 'en' ? 'English' : /简体中文/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expectStoredPreferences(page, { app: { locale } });
}

async function shareDatabase(source: Page, target: Page): Promise<void> {
  const dbName = await source.evaluate(key => sessionStorage.getItem(key) ?? localStorage.getItem(key), DB_NAME_KEY);
  if (dbName === null) throw new Error('e2e 隔离库名缺失');
  await target.addInitScript(
    ({ key, dbName }) => {
      sessionStorage.setItem(key, dbName);
      localStorage.setItem(key, dbName);
    },
    { key: DB_NAME_KEY, dbName }
  );
}

async function tableHeaders(page: Page): Promise<string[]> {
  return page
    .getByTestId('entity-shell')
    .locator('canvas')
    .first()
    .evaluate(element => {
      interface TableLike {
        columns: Array<{ title?: string }>;
      }
      return (element as unknown as { __vtable__: TableLike }).__vtable__.columns.map(column => column.title ?? '');
    });
}

async function downloadBackup(page: Page): Promise<string> {
  const downloading = page.waitForEvent('download');
  await page.getByTestId('backup-start').click();
  const download = await downloading;
  const archive = await download.path();
  if (archive === null) throw new Error('备份下载文件缺失');
  return archive;
}

test.describe('工作台完整国际化', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('同一语言切换更新首页、品牌、导航、模型字段和扩展偏好', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '开始使用工作台', exact: true })).toBeVisible();
    const origin = await page.evaluate(() => performance.timeOrigin);
    await setLocale(page, 'en');
    await expect(page.getByRole('heading', { name: 'Get started with your workbench' })).toBeVisible();
    await expect(page).toHaveTitle('Model-driven data workbench');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'A local-first, model-driven RxDB workbench for creating, editing, filtering, backing up and restoring data.'
    );
    await expect(page.getByTestId('admin-header')).toContainText('Workbench');
    await expect(
      page.getByTestId('admin-menu').getByRole('link', { name: 'Asset categories' })
    ).toBeVisible();
    await expect(page.getByTestId('backup-nav-link')).toContainText('Backup / Restore');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);

    const drawer = await openPreferences(page);
    await expect(drawer.getByRole('heading', { name: 'Preferences', exact: true })).toBeVisible();
    await drawer.getByTestId('pref-tab-extension').click();
    await expect(drawer.getByTestId('pref-extension.searchPageSize')).toHaveValue('20');
    await expect(drawer).toContainText('Results per page');
    await expect(drawer).not.toContainText('全文搜索每页条数');
    await page.keyboard.press('Escape');

    await page.getByTestId('admin-menu').getByRole('link', { name: 'Asset categories' }).click();
    await expect(page.getByTestId('entity-empty-state')).toContainText('Asset categories');
    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Basic information', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Category name is required', { exact: true })).toBeVisible();
    await page.getByRole('group', { name: 'Category name' }).getByRole('textbox').fill('办公设备');
    await expect(page.getByRole('group', { name: 'Description', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Basic information', exact: true })).toHaveCount(0);
    await expect
      .poll(() => tableHeaders(page))
      .toEqual(expect.arrayContaining(['Category name', 'Description', 'Actions']));

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('button', { name: 'Add the first condition', exact: true }).click();
    await page.locator('.rxdb-query-rule').first().locator('button[popovertarget]').first().click();
    await expect(page.locator('[role="treeitem"][id$="-item-name"]')).toContainText('Category name');
    await page.locator('[role="treeitem"][id$="-item-name"]').click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await page.getByTestId('search-nav-link').click();
    await page.getByTestId('search-input').fill('办公设备');
    await expect(page.getByTestId('search-result')).toHaveCount(1);
    await expect(page.getByTestId('search-result')).toContainText('Asset categories · Category name');
    await expect(page.getByTestId('search-result')).toContainText('办公设备');

    await page.keyboard.press('ControlOrMeta+k');
    await page.getByTestId('admin-palette-input').fill('办公设备');
    await expect(
      page.getByRole('group', { name: 'Records', exact: true }).getByTestId('admin-palette-option')
    ).toContainText('Asset categories · Category name');
    await page.keyboard.press('Escape');

    await page.getByTestId('admin-menu').getByRole('link', { name: 'Assets' }).click();
    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Category' }).getByRole('combobox')).toContainText(
      '办公设备'
    );
    await expect(page.getByRole('group', { name: 'Status', exact: true }).getByRole('textbox')).toHaveValue('在用');
  });

  test('搜索与既有页签即时翻译，刷新后保留语言', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByTestId('admin-tabbar')).toContainText('搜索');
    await page.getByTestId('backup-nav-link').click();
    await expect(page.getByTestId('admin-tabbar')).toContainText('备份 / 恢复');
    await setLocale(page, 'en');
    await expect(page.getByTestId('admin-tabbar')).toContainText('Search');
    await expect(page.getByTestId('admin-tabbar')).toContainText('Backup / Restore');
    await expect(page.getByTestId('admin-tabbar')).not.toContainText('备份 / 恢复');
    await expect(page.getByRole('heading', { name: 'Backup', exact: true })).toBeVisible();
    await expect(page.getByTestId('restore-input')).toHaveAttribute('aria-label', 'Choose a backup archive');

    await page.getByTestId('search-nav-link').click();
    await expect(page.getByTestId('search-input')).toHaveAttribute(
      'placeholder',
      'Search categories, assets, and maintenance records…'
    );
    await page.getByTestId('search-input').fill('no-such-workbench-record');
    await expect(page.getByTestId('search-results')).toContainText('No matching results');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('search-input')).toHaveAttribute(
      'placeholder',
      'Search categories, assets, and maintenance records…'
    );
    await setLocale(page, 'zh-Hans');
    await expect(page.getByTestId('admin-tabbar')).toContainText('搜索');
    await expect(page.getByTestId('admin-tabbar')).toContainText('备份 / 恢复');
    await expect(page).toHaveTitle('搜索 · 工作台');
    await page.goto('/entities/assets/Unknown');
    await setLocale(page, 'en');
    await expect(page.getByTestId('entity-load-failed')).toContainText('Loading failed');
    await expect(page.getByTestId('entity-load-failed')).toContainText('Entity assets/Unknown was not found.');
  });

  test('跨标签切换更新已打开的表单和标签，保留输入内容', async ({ page, context }) => {
    await page.goto('/entities/assets/AssetCategory');
    await setLocale(page, 'en');
    const second = await context.newPage();
    await shareDatabase(page, second);
    await second.goto('/entities/assets/AssetCategory');
    await expect(second.locator('html')).toHaveAttribute('lang', 'en');
    await second.getByRole('button', { name: '+ New', exact: true }).click();
    await second
      .getByRole('group', { name: 'Category name' })
      .getByRole('textbox')
      .fill('Untranslated user content');

    await setLocale(page, 'zh-Hans');
    await expect(second.locator('html')).toHaveAttribute('lang', 'zh-Hans');
    await expect(second.getByRole('button', { name: '保存', exact: true })).toBeVisible();
    await expect(second.getByRole('tab', { name: '基本信息', exact: true })).toBeVisible();
    await expect(second.getByRole('group', { name: '分类名' }).getByRole('textbox')).toHaveValue(
      'Untranslated user content'
    );
    await expect(second.getByTestId('admin-tabbar')).toContainText('资产分类');
    await second.close();
  });

  test('已有恢复错误在切换语言后重新翻译', async ({ page }) => {
    await page.goto('/backup');
    await setLocale(page, 'en');
    await page.getByTestId('restore-input').setInputFiles({
      name: 'corrupt.rxdb-backup',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('not a workbench backup')
    });
    await expect(page.getByTestId('restore-result').getByRole('alert')).toHaveText(
      'The archive is damaged or is not a valid workbench backup.'
    );
    await setLocale(page, 'zh-Hans');
    await expect(page.getByTestId('restore-result').getByRole('alert')).toContainText('归档文件损坏');
  });

  test('首页切换语言并刷新后仍可向空工作台恢复备份', async ({ page, browser }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '恢复后保留的中文内容');
    await page.goto('/backup');
    const archive = await downloadBackup(page);
    const freshContext = await browser.newContext();
    const fresh = await freshContext.newPage();
    try {
      await resetE2eState(fresh);
      await fresh.goto('/');
      await setLocale(fresh, 'en');
      await fresh.reload();
      await expect(fresh.locator('html')).toHaveAttribute('lang', 'en');
      await fresh.getByRole('link', { name: 'Restore from backup', exact: true }).click();
      await fresh.getByTestId('restore-input').setInputFiles(archive);
      await expect(fresh.getByTestId('restore-result')).toContainText('Restore complete');
      await fresh.getByTestId('admin-menu').getByRole('link', { name: 'Asset categories' }).click();
      await expect(fresh.getByRole('button', { name: '+ New', exact: true })).toBeVisible();
      await expect(fresh.getByTestId('entity-empty-state')).toHaveCount(0);
      await expect.poll(() => tableHeaders(fresh)).toEqual(expect.arrayContaining(['Category name', 'Actions']));
    } finally {
      await freshContext.close();
    }
  });
});
