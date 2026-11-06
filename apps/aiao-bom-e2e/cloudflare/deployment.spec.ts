import { expect, test } from '@playwright/test';
import { SCOOTER_SEED_ROWS, acceptDialog, revealDetails } from '../src/support';

const routes = ['/', '/review', '/explosion', '/timeline', '/mapping', '/cost', '/where-used', '/instances'];

test('BOM-US-002 所有入口与深链接返回应用及隔离响应头', async ({ page }) => {
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    const headers = response?.headers();
    expect(headers?.['content-type'], route).toContain('text/html');
    expect(headers?.['cross-origin-opener-policy'], route).toBe('same-origin');
    expect(headers?.['cross-origin-embedder-policy'], route).toBe('require-corp');
    await expect(page.locator('bom-root')).toBeVisible();
  }
});

test('BOM-US-002 SQLite WASM 返回可编译二进制及正确 MIME', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const response = await fetch('/wa-sqlite/wa-sqlite-async.wasm');
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      valid: WebAssembly.validate(await response.arrayBuffer())
    };
  });
  expect(result.status).toBe(200);
  expect(result.contentType).toContain('application/wasm');
  expect(result.valid).toBe(true);
});

test('BOM-US-002 深链接可冷启动并在刷新后保留浏览器隔离', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: '生产改版核对', exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ secure: isSecureContext, isolated: crossOriginIsolated }))).toEqual({
    secure: true,
    isolated: true
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '生产改版核对', exact: true })).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(errors).toEqual([]);
});

test('BOM-US-002 相同部署 origin 重开保留本地样本并完成改版计算', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await revealDetails(page.getByTestId('prepare-data'));
  await acceptDialog(page, () => page.getByTestId('prepare-data').click());
  await expect(page.getByTestId('overview-data-status')).toContainText(`已有 ${SCOOTER_SEED_ROWS.item} 项物料`, {
    timeout: 30000
  });
  await page.reload();
  await expect(page.getByTestId('overview-data-status')).toContainText(`已有 ${SCOOTER_SEED_ROWS.item} 项物料`, {
    timeout: 30000
  });
  await page.getByTestId('start-change-review').click();
  await page.getByTestId('review-run').click();
  await expect(page.getByTestId('review-after-cost')).toHaveAttribute('data-amount', /^-?\d+(?:\.\d+)?$/, {
    timeout: 30000
  });
  expect(errors).toEqual([]);
});
