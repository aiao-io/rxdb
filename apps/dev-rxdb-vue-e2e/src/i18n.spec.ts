import { expect, test, type Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

const DB_NAME_KEY = '__aiao_e2e_db_name__';

async function readDbName(page: Page): Promise<string> {
  const dbName = await page.evaluate(key => sessionStorage.getItem(key) ?? localStorage.getItem(key), DB_NAME_KEY);
  if (dbName === null) throw new Error('e2e 隔离库名缺失');
  return dbName;
}

async function readActionHeader(page: Page): Promise<string> {
  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  return canvas.evaluate(el => {
    interface TableLike {
      columns: Array<{ field?: string; title?: string }>;
    }
    const table = (el as unknown as { __vtable__: TableLike }).__vtable__;
    const column = table.columns.find(column => column.field === 'actions');
    if (typeof column?.title !== 'string') throw new Error('操作列表头缺失');
    return column.title;
  });
}

async function readCreatedAtDisplay(page: Page): Promise<string> {
  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  return canvas.evaluate(el => {
    interface TableLike {
      colCount: number;
      getHeaderField(col: number, row: number): unknown;
      getCellValue(col: number, row: number): unknown;
    }
    const table = (el as unknown as { __vtable__: TableLike }).__vtable__;
    const column = Array.from({ length: table.colCount }, (_, col) => col).find(
      col => table.getHeaderField(col, 0) === 'createdAt'
    );
    if (column === undefined) throw new Error('创建时间列缺失');
    return String(table.getCellValue(column, 1));
  });
}

async function expectedCreatedAtDisplay(page: Page, locale: string): Promise<string> {
  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  return canvas.evaluate((el, locale) => {
    interface TableLike {
      records: Array<{ createdAt?: unknown }>;
    }
    const table = (el as unknown as { __vtable__: TableLike }).__vtable__;
    const value = table.records[0]?.createdAt;
    if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
      throw new Error('创建时间原始值缺失');
    }
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    }).format(date);
  }, locale);
}

async function expectLocale(page: Page, locale: 'zh-Hans' | 'en'): Promise<void> {
  await expect(page.getByTestId('i18n-locale')).toHaveValue(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${locale === 'en' ? 'en' : 'zh'}`));
}

test.describe('客户端国际化', () => {
  test('切换即时更新模型文案与格式化，刷新后保持，第二标签页跟随', async ({ page, context }) => {
    await resetE2eState(page);
    await page.goto('/entities/public/Todo');
    await expect(page.getByTestId('entity-shell')).toBeVisible();
    await expectLocale(page, 'zh-Hans');
    await expect(page.getByRole('button', { name: '+ 新增', exact: true })).toBeVisible();
    const chineseDate = await page.getByTestId('i18n-formatted-date').innerText();
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);

    await page.getByTestId('i18n-locale').selectOption('en');
    await expectLocale(page, 'en');
    await expect(page.getByRole('button', { name: '+ New', exact: true })).toBeVisible();
    await expect.poll(() => page.getByTestId('i18n-formatted-date').innerText()).not.toBe(chineseDate);
    const expectedEnglish = await page.evaluate(() => ({
      date: new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
        new Date('2026-10-28T12:00:00.000Z')
      ),
      number: new Intl.NumberFormat('en').format(12345.67)
    }));
    await expect(page.getByTestId('i18n-formatted-date')).toHaveText(expectedEnglish.date);
    await expect(page.getByTestId('i18n-formatted-number')).toHaveText(expectedEnglish.number);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);

    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Basic information', exact: true })).toBeVisible();
    await page.getByRole('group', { name: 'title', exact: true }).getByRole('textbox').fill('i18n-persisted-row');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Basic information', exact: true })).toHaveCount(0);
    await expect.poll(() => readActionHeader(page)).toBe('Actions');
    await expect.poll(() => readCreatedAtDisplay(page)).toMatch(/\d/);
    const englishColumnDate = await expectedCreatedAtDisplay(page, 'en');
    await expect.poll(() => readCreatedAtDisplay(page)).toBe(englishColumnDate);

    await page.reload();
    await expectLocale(page, 'en');
    await expect(page.getByRole('button', { name: '+ New', exact: true })).toBeVisible();

    const dbName = await readDbName(page);
    const second = await context.newPage();
    await second.addInitScript(
      ({ key, dbName }) => {
        sessionStorage.setItem(key, dbName);
        localStorage.setItem(key, dbName);
      },
      { key: DB_NAME_KEY, dbName }
    );
    await second.goto('/entities/public/Todo');
    await expectLocale(second, 'en');
    await expect(second.getByRole('button', { name: '+ New', exact: true })).toBeVisible();
    await second.getByRole('button', { name: '+ New', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Save', exact: true })).toBeVisible();

    await page.getByTestId('i18n-locale').selectOption('zh-Hans');
    await expectLocale(page, 'zh-Hans');
    await expectLocale(second, 'zh-Hans');
    await expect(second.getByRole('button', { name: '保存', exact: true })).toBeVisible();
    await expect(second.getByRole('tab', { name: '基本信息', exact: true })).toBeVisible();
    await expect.poll(() => readActionHeader(second)).toBe('操作');
    await expect.poll(() => readCreatedAtDisplay(second)).toMatch(/\d/);
    const chineseColumnDate = await expectedCreatedAtDisplay(second, 'zh-Hans');
    await expect.poll(() => readCreatedAtDisplay(second)).toBe(chineseColumnDate);
    await second.close();
  });
});
