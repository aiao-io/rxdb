import { expect, test, type BrowserContext } from '@playwright/test';
import { endpoint, pngFixture, profile, prompt, provider } from './local-first.helpers';

async function activate(context: BrowserContext) {
  for (const page of context.pages()) await page.close();
  const next = await context.newPage();
  await next.goto('/create');
  await next.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => next.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  return next;
}
test('实际离线 Worker 更新等待旧页面关闭，切换版本与回退后草稿和原图仍在', async ({ page, context }) => {
  const png = await pngFixture();
  await page.route(endpoint, route => route.fulfill({ json: { data: [{ b64_json: png.toString('base64') }] } }));
  await provider(page);
  await prompt(page, '离线更新前的草稿');
  await page.getByRole('button', { name: '✧ 生成图片', exact: false }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  const id = await profile(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const a = await (await page.request.get('/__build')).json();
  await page.request.post('/__build/b');
  const b = await (await page.request.get('/__build')).json();
  expect(b.version).not.toBe(a.version);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.ready).update();
  });
  await expect
    .poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)))
    .toBe(true);
  expect(
    await page.evaluate(() => document.querySelector('meta[name="local-test-build"]')?.getAttribute('content'))
  ).toBe('a');
  let next = await activate(context);
  await expect(next.locator('[contenteditable=true]')).toContainText('离线更新前的草稿');
  expect(await profile(next)).toBe(id);
  await context.setOffline(true);
  await next.goto('/create');
  expect(await next.locator('meta[name="local-test-build"]').getAttribute('content')).toBe('b');
  await next.goto('/images');
  await expect(next.getByAltText('本机生成作品')).toHaveCount(1);
  await context.setOffline(false);
  await next.request.post('/__build/a');
  await next.evaluate(async () => {
    await (await navigator.serviceWorker.ready).update();
  });
  await expect
    .poll(() => next.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)))
    .toBe(true);
  next = await activate(context);
  await context.setOffline(true);
  await next.goto('/create');
  expect(await next.locator('meta[name="local-test-build"]').getAttribute('content')).toBe('a');
  await expect(next.locator('[contenteditable=true]')).toContainText('离线更新前的草稿');
  await next.goto('/images');
  await expect(next.getByAltText('本机生成作品')).toHaveCount(1);
  expect(await profile(next)).toBe(id);
});
