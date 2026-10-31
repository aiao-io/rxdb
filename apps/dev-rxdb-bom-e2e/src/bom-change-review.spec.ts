import { deterministicId } from '@aiao/rxdb-plugin-bom/testing';
import { expect, test, type Download, type Page } from '@playwright/test';
import { SCOOTER_SEED_ROWS, acceptDialog, revealDetails } from './support';

interface ReviewDownload {
  kind: string;
  schemaVersion: number;
  context: {
    rootKey: string;
    plannedQty: string;
    plannedUom: string;
    unit: number;
    configSelection: Record<string, string[]>;
  };
  ecn: { id: string; ecnNo: string; beforeDate: string; afterDate: string };
  beforeAfterCosts: { currency: string; before: string; after: string; delta: string };
  changeRows: { itemNo: string; beforeQty: string; afterQty: string; delta: string }[];
  manifests: { before: unknown; after: unknown };
  confirmedAt: string;
}

const ecnId = deterministicId('ecn:ECN-2026-014');

const prepare = async (page: Page): Promise<void> => {
  await page.goto('/');
  await revealDetails(page.getByTestId('prepare-data'));
  await acceptDialog(page, () => page.getByTestId('prepare-data').click());
  await expect(page.getByTestId('overview-data-status')).toContainText(`已有 ${SCOOTER_SEED_ROWS.item} 项物料`, {
    timeout: 30000
  });
};

const start = async (page: Page): Promise<void> => {
  await page.getByTestId('start-change-review').click();
  await expect(page).toHaveURL(/\/review(?:\?|$)/);
  await expect(page.getByRole('heading', { name: '生产改版核对', exact: true })).toBeVisible();
  await expect(page.getByTestId('review-qty')).toHaveValue('10');
  await expect(page.getByTestId('review-ecn')).toHaveValue(ecnId);
};

const run = async (page: Page): Promise<{ before: string; after: string; delta: string }> => {
  await page.getByTestId('review-run').click();
  await expect(page.getByTestId('review-after-cost')).toHaveAttribute('data-amount', /^-?\d+(?:\.\d+)?$/, {
    timeout: 30000
  });
  await expect(page.getByTestId('review-stale')).toHaveCount(0);
  await expect(page.getByTestId('review-error')).toHaveCount(0);
  const before = await page.getByTestId('review-before-cost').getAttribute('data-amount');
  const after = await page.getByTestId('review-after-cost').getAttribute('data-amount');
  const delta = await page.getByTestId('review-cost-delta').getAttribute('data-amount');
  if (before === null || after === null || delta === null) throw new Error('核对结果缺少完整成本数值');
  expect(Number(delta)).toBeCloseTo(Number(after) - Number(before), 10);
  return { before, after, delta };
};

const complete = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('review-complete')).toBeDisabled();
  await page.getByTestId('review-ack').check();
  await page.getByTestId('review-complete').click();
  await expect(page.getByTestId('review-conclusion')).toBeVisible();
  await expect(page.getByTestId('review-conclusion')).toBeInViewport();
  await expect(page.getByTestId('review-download')).toBeEnabled();
};

const readDownload = async (download: Download): Promise<ReviewDownload> => {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('核对结论没有可读取的下载内容');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as ReviewDownload;
};

const standaloneCost = async (page: Page, reviewUrl: string, date: string): Promise<string> => {
  const url = new URL(reviewUrl);
  url.pathname = '/cost';
  url.searchParams.set('date', date);
  await page.goto(url.toString());
  await page.getByRole('button', { name: '卷算', exact: true }).click();
  const rootAmount = page.locator('.cost-row[data-kind="head"][data-item="SC-100"] [data-amount]').first();
  await expect(rootAmount).toHaveAttribute('data-amount', /^-?\d+(?:\.\d+)?$/, { timeout: 30000 });
  const amount = await rootAmount.getAttribute('data-amount');
  if (amount === null) throw new Error('独立成本卷算缺少整机金额');
  return amount;
};

test.describe('BOM 生产改版核对主线', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await prepare(page);
  });

  test('从 10 台生产任务完成改版核对，下载条件、用量与真实成本一致的结论', async ({ page }) => {
    await page.screenshot({ path: 'test-results/bom-product-task-home.png', animations: 'disabled', fullPage: true });
    await start(page);
    await expect(page.getByTestId('review-download')).toHaveCount(0);
    const costs = await run(page);
    await page.screenshot({
      path: 'test-results/bom-product-change-comparison.png',
      animations: 'disabled',
      fullPage: true
    });
    await expect(page.getByTestId('review-change-row').filter({ hasText: 'FRAME' })).toBeVisible();
    await expect(page.getByTestId('review-change-row').filter({ hasText: 'SEAT' })).toBeVisible();
    await expect(page.getByTestId('review-change-row').filter({ hasText: 'MCU-V2' })).toBeVisible();
    await expect(page.getByTestId('review-change-row').filter({ hasText: 'BMS-V2' })).toBeVisible();
    await complete(page);
    await page.screenshot({
      path: 'test-results/bom-product-review-conclusion.png',
      animations: 'disabled',
      fullPage: true
    });
    const downloading = page.waitForEvent('download');
    await page.getByTestId('review-download').click();
    const download = await downloading;
    const payload = await readDownload(download);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    expect(payload.kind).toBe('bom-change-review');
    expect(payload.schemaVersion).toBe(1);
    expect(payload.context).toMatchObject({
      rootKey: 'SC-100',
      plannedQty: '10',
      plannedUom: 'pcs',
      unit: 137,
      configSelection: { 颜色: ['红'] }
    });
    expect(payload.ecn).toMatchObject({ id: ecnId, ecnNo: 'ECN-2026-014' });
    expect(payload.ecn.beforeDate).toMatch(/^2026-09-30/);
    expect(payload.ecn.afterDate).toMatch(/^2026-10-01/);
    expect(payload.beforeAfterCosts).toEqual({ currency: 'CNY', ...costs });
    expect(payload.changeRows.find(row => row.itemNo === 'FRAME')).toMatchObject({ beforeQty: '10', afterQty: '0' });
    expect(payload.changeRows.find(row => row.itemNo === 'SEAT')).toMatchObject({ beforeQty: '0', afterQty: '10' });
    expect(payload.manifests.before).toBeTruthy();
    expect(payload.manifests.after).toBeTruthy();
    expect(Number.isFinite(Date.parse(payload.confirmedAt))).toBe(true);
    const reviewUrl = page.url();
    expect(await standaloneCost(page, reviewUrl, '2026-09-30')).toBe(costs.before);
    expect(await standaloneCost(page, reviewUrl, '2026-10-01')).toBe(costs.after);
  });

  test('改为 20 台后旧结论失效，必须重算并重新确认；刷新只恢复条件', async ({ page }) => {
    await start(page);
    const first = await run(page);
    await complete(page);
    await page.getByTestId('review-qty').fill('20');
    await expect(page.getByTestId('review-stale')).toBeVisible();
    await expect(page.getByTestId('review-download')).toBeDisabled();
    await expect(page.getByTestId('review-before-cost')).toHaveAttribute('data-amount', first.before);
    const second = await run(page);
    expect(second.before).not.toBe(first.before);
    expect(second.after).not.toBe(first.after);
    await expect(page.getByTestId('review-ack')).not.toBeChecked();
    await expect(page.getByTestId('review-download')).toHaveCount(0);
    await complete(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('qty')).toBe('20');
    await expect.poll(() => new URL(page.url()).searchParams.get('ecn')).toBe(ecnId);
    await page.reload();
    await expect(page.getByTestId('review-qty')).toHaveValue('20');
    await expect(page.getByTestId('review-ecn')).toHaveValue(ecnId);
    await expect(page.getByTestId('review-conclusion')).toHaveCount(0);
    await expect(page.getByTestId('review-download')).toHaveCount(0);
    await run(page);
    await expect(page.getByTestId('review-ack')).not.toBeChecked();
    await expect(page.getByTestId('review-complete')).toBeDisabled();
  });

  test('375 像素宽度完成核对，不产生页面横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await start(page);
    await run(page);
    await complete(page);
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    const path = 'test-results/bom-change-review-mobile.png';
    await page.screenshot({ path, animations: 'disabled', fullPage: true });
    await test.info().attach('bom-change-review-mobile', { path, contentType: 'image/png' });
  });

  test('已加载核对页断网后仍可改变批量并完成真实计算', async ({ page, context }) => {
    await start(page);
    const first = await run(page);
    await context.setOffline(true);
    try {
      await page.getByTestId('review-qty').fill('20');
      const second = await run(page);
      expect(second.before).not.toBe(first.before);
      expect(second.after).not.toBe(first.after);
      await complete(page);
    } finally {
      await context.setOffline(false);
    }
  });

  test('既有数据重开仍可开始核对，查询保留原来的记录统计', async ({ page }) => {
    const statistics = page.getByTestId('row-counts');
    await revealDetails(statistics);
    await expect(statistics).toContainText(`item=${SCOOTER_SEED_ROWS.item}`, { timeout: 30000 });
    const before = await statistics.innerText();
    await page.reload();
    await expect(page.getByTestId('overview-data-status')).toContainText(`已有 ${SCOOTER_SEED_ROWS.item} 项物料`, {
      timeout: 30000
    });
    await start(page);
    await run(page);
    await complete(page);
    await page.goto('/');
    await revealDetails(statistics);
    await expect(statistics).toHaveText(before, { timeout: 30000 });
  });
});
