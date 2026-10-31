import { expect, test, type Page } from '@playwright/test';
import { API_BASE_URL } from './env';
import { openDemo, resetDemo, setOffline } from './support';

const GREETING_ID = JSON.stringify(['en', 'http-demo', 'greeting']);
const STATUS_ID = JSON.stringify(['en', 'http-demo', 'status']);

const captureCatalogPulls = (page: Page): string[][] => {
  const calls: string[][] = [];
  page.on('request', request => {
    if (!request.url().endsWith('/messages/by-ids') || request.method() !== 'POST') return;
    const body = request.postDataJSON() as { ids: string[] };
    calls.push(body.ids);
  });
  return calls;
};

test.beforeEach(async ({ request }) => {
  await resetDemo(request, 30000);
});

test('远端单条更新经QueryCache即时渲染、离线重载保留缓存、删除仅清远端表并正确回退', async ({ page, request }) => {
  const pulls = captureCatalogPulls(page);
  await openDemo(page, 'i18n=1');
  await expect(page.getByTestId('i18n-locale')).toHaveText('en');
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Remote greeting v1');
  await expect(page.getByTestId('i18n-message-status')).toHaveText('Remote status v1');
  await expect(page.getByTestId('i18n-source-greeting')).toHaveText('远端目录');
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  pulls.length = 0;

  const update = await request.patch(`${API_BASE_URL}/messages/${encodeURIComponent(GREETING_ID)}`, {
    data: { value: 'Remote greeting v2' }
  });
  expect(update.status()).toBe(200);
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Remote greeting v2', { timeout: 5000 });
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  expect(pulls).toEqual([[GREETING_ID]]);

  await setOffline(request, true);
  await page.reload();
  await expect(page.getByTestId('i18n-locale')).toHaveText('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Remote greeting v2');
  await expect(page.getByTestId('i18n-message-status')).toHaveText('Remote status v1');

  await setOffline(request, false);
  await page.reload();
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Remote greeting v2');
  await page.getByTestId('i18n-local-override').click();
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Local greeting');
  await expect(page.getByTestId('i18n-source-greeting')).toHaveText('本地覆盖');

  const removed = await request.post(`${API_BASE_URL}/messages/delete`, { data: { ids: [GREETING_ID, STATUS_ID] } });
  expect(removed.status()).toBe(200);
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Local greeting');
  await expect(page.getByTestId('i18n-message-status')).toHaveText('Bundle status');
  await expect(page.getByTestId('i18n-source-status')).toHaveText('随包默认');
  await page.getByTestId('i18n-read-local').click();
  await expect(page.getByTestId('i18n-local-count')).toHaveText('1');
  await expect(page.getByTestId('i18n-remote-count')).toHaveText('0');
  await page.reload();
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Local greeting');
  await expect(page.getByTestId('i18n-message-status')).toHaveText('Bundle status');
  await page.getByTestId('i18n-remove-override').click();
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Bundle greeting');
  await setOffline(request, true);
  await page.reload();
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Bundle greeting');
  await expect(page.getByTestId('i18n-message-status')).toHaveText('Bundle status');
  await expect(page.getByTestId('i18n-locale')).toHaveText('en');
  await setOffline(request, false);
  const restored = await request.post(`${API_BASE_URL}/messages`, {
    data: { locale: 'en', namespace: 'http-demo', key: 'greeting', value: 'Remote resumed' }
  });
  expect(restored.status()).toBe(201);
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Remote resumed', { timeout: 5000 });
  const reset = await request.post(`${API_BASE_URL}/__control/reset`, { data: {}, timeout: 30000 });
  expect(reset.status()).toBe(200);
  await expect(page.getByTestId('i18n-message-greeting')).toHaveText('Remote greeting v1');
});
