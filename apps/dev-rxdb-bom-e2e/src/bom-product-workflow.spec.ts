import { expect, test, type Download, type Page } from '@playwright/test';

const prepare = async (page: Page): Promise<void> => {
  await page.goto('/');
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('prepare-data').click();
  await expect(page.getByTestId('overview-data-status')).toContainText('已有 41 项物料', { timeout: 30000 });
};

const openPage = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('link', { name, exact: true }).click();
};

const openIntegration = async (page: Page): Promise<void> => {
  const summary = page.locator('summary').filter({ hasText: /^导入与导出$/ });
  const details = summary.locator('..');
  if ((await details.getAttribute('open')) === null) await summary.click();
  await expect(details).toHaveAttribute('open', '');
};

const explode = async (page: Page, quantity: string): Promise<void> => {
  await page.getByRole('button', { name: '展开整机', exact: true }).click();
  await expect(page.locator('section[aria-labelledby="explosion-result-title"]')).toContainText(
    new RegExp(`计划\\s+${quantity}\\s+pcs`),
    { timeout: 30000 }
  );
  await expect(page.getByRole('tree', { name: '物料需求发生项树', exact: true })).toBeVisible();
};

const readDownload = async (download: Download): Promise<string> => {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('结构下载没有可读取的内容');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

const screenshot = async (page: Page, name: string): Promise<void> => {
  const path = `test-results/bom-product-${name}.png`;
  await page.screenshot({ path, animations: 'disabled', fullPage: true });
  await test.info().attach(`bom-product-${name}`, { path, contentType: 'image/png' });
};

const expectUrlConditions = async (page: Page, quantity: string, date: string): Promise<void> => {
  await expect.poll(() => new URL(page.url()).searchParams.get('qty')).toBe(quantity);
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBe(date);
};

test.describe('BOM 连续业务工作流', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await prepare(page);
  });

  test('计划量从 10 改为 20 时旧结果待更新，重新展开后下载保留同一批量', async ({ page }) => {
    await openPage(page, '展开');
    await page.getByTestId('planned-qty').fill('10');
    await explode(page, '10');
    const directScrew = page
      .getByRole('tree', { name: '物料需求发生项树', exact: true })
      .locator('.requirement-row[data-item="M3"][aria-level="2"]');
    await expect(directScrew.locator('.qty')).toHaveText('80 pcs');
    await openIntegration(page);
    await expect(page.getByTestId('export-bom')).toBeEnabled();

    await page.getByTestId('planned-qty').fill('20');
    await expect(page.getByTestId('result-stale')).toContainText('条件已修改');
    await expect(directScrew.locator('.qty')).toHaveText('80 pcs');
    await expect(page.getByTestId('export-bom')).toBeDisabled();
    await explode(page, '20');
    await expect(page.getByTestId('result-stale')).toHaveCount(0);
    await expect(directScrew.locator('.qty')).toHaveText('160 pcs');
    await expect(page.getByTestId('export-bom')).toBeEnabled();

    const downloading = page.waitForEvent('download');
    await page.getByTestId('export-bom').click();
    const download = await downloading;
    const payload = JSON.parse(await readDownload(download)) as {
      manifest: { plannedQty: { value: string; uom: string }; context: { asOfDate: string } };
    };
    expect(payload.manifest.plannedQty).toEqual({ value: '20', uom: 'pcs' });
    expect(payload.manifest.context.asOfDate).toBe('2026-09-22T00:00:00.000Z');
    expect(download.suggestedFilename()).toBe('SC-100-2026-09-22.json');
    await screenshot(page, 'export-desktop');
  });

  test('搜索电池后快捷反查，回到结构及刷新均保留日期和计划量', async ({ page }) => {
    await openPage(page, '展开');
    await page.getByTestId('as-of-date').fill('2026-10-15');
    await page.getByTestId('planned-qty').fill('12');
    await expectUrlConditions(page, '12', '2026-10-15');
    await openPage(page, '概览');
    await page.getByTestId('item-filter').fill('BATT');
    const battery = page.getByTestId('item-inventory-row').filter({ has: page.getByText('BATT', { exact: true }) });
    await expect(battery).toHaveCount(1);
    await expect(battery).toContainText('电池组');
    await battery.getByRole('link', { name: '反查', exact: true }).click();
    await expect(page.getByTestId('where-used-select')).toHaveValue('BATT');
    await expect(page.getByTestId('as-of-date')).toHaveValue('2026-10-15');
    await expectUrlConditions(page, '12', '2026-10-15');
    await page.getByRole('button', { name: '反查 电池组（BATT）', exact: true }).click();
    await expect(page.getByTestId('where-used-line')).toHaveCount(1, { timeout: 30000 });

    await page
      .getByRole('navigation', { name: '连续分析', exact: true })
      .getByRole('link', { name: '结构与用量', exact: true })
      .click();
    await expect(page.getByTestId('planned-qty')).toHaveValue('12');
    await expect(page.getByTestId('as-of-date')).toHaveValue('2026-10-15');
    await expect(page.getByTestId('root-select')).toHaveValue('SC-100');
    await page.reload();
    await expect(page.getByTestId('workspace-data-status')).toContainText('数据已就绪', { timeout: 30000 });
    await expect(page.getByTestId('planned-qty')).toHaveValue('12');
    await expect(page.getByTestId('as-of-date')).toHaveValue('2026-10-15');
    await expect(page.getByTestId('root-select')).toHaveValue('SC-100');
    await expectUrlConditions(page, '12', '2026-10-15');
    expect(new URL(page.url()).searchParams.get('item')).toBe('BATT');
  });

  test('10 台生产引导贯穿结构、成本与反查，退出后保留工作条件', async ({ page }) => {
    await page.getByTestId('start-planning').click();
    await expect(page.getByRole('heading', { name: '整机展开', exact: true })).toBeVisible();
    await expect(page.getByTestId('planned-qty')).toHaveValue('10');
    await expect(page.getByTestId('as-of-date')).toHaveValue('2026-09-22');
    await expect(page.getByTestId('unit-input')).toHaveValue('137');
    await explode(page, '10');
    const journey = page.getByRole('navigation', { name: '业务体验路线', exact: true });
    await journey.getByRole('link', { name: '2. 了解成本来源', exact: true }).click();
    await expect(page.getByTestId('cost-root-select')).toHaveValue('SC-100');
    await expect(page.getByTestId('cost-planned-qty')).toHaveValue('10');
    await expect(page.getByTestId('cost-uom')).toHaveValue('pcs');
    await page.getByRole('button', { name: '卷算', exact: true }).click();
    await expect(page.getByTestId('cost-summary-quantity')).toHaveText('10 pcs', { timeout: 30000 });
    await expectUrlConditions(page, '10', '2026-09-22');
    await journey.getByRole('link', { name: '3. 追踪使用影响', exact: true }).click();
    await expect(page.getByTestId('where-used-select')).toHaveValue('M3');
    await expect(page.getByTestId('as-of-date')).toHaveValue('2026-09-22');
    await expectUrlConditions(page, '10', '2026-09-22');
    await journey.getByRole('link', { name: '1. 看清物料需求', exact: true }).click();
    await expect(page.getByTestId('planned-qty')).toHaveValue('10');
    await expect(page.getByRole('tree', { name: '物料需求发生项树', exact: true })).toBeVisible();
    await screenshot(page, 'guide-desktop');
    await journey.getByRole('button', { name: '退出引导，继续工作', exact: true }).click();
    await expect(journey).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get('guide')).toBe('0');
    await expect(page.getByTestId('planned-qty')).toHaveValue('10');
    await expect(page.getByTestId('as-of-date')).toHaveValue('2026-09-22');
  });

  test('375 像素导航进入当前链接，Tab 循环，Escape 返回打开按钮', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const toggle = page.locator('button[aria-controls="bom-navigation"]');
    await toggle.click();
    const drawer = page.locator('#bom-navigation');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('a[aria-current="page"]')).toBeFocused();
    await expect(page.locator('.workspace')).toHaveAttribute('inert', '');
    const links = drawer.locator('a[href]');
    await links.last().focus();
    await page.keyboard.press('Tab');
    await expect(links.first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(links.last()).toBeFocused();
    await screenshot(page, 'navigation-mobile');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await expect(drawer).toBeHidden();
    await expect(page.locator('.workspace')).not.toHaveAttribute('inert', '');
  });

  test('导入草稿离页刷新后仍在待发布清单，恢复后需明确勾选再发布', async ({ page }) => {
    await openPage(page, '展开');
    await openIntegration(page);
    const parent = {
      itemNo: 'PRODUCT-IMPORT-ROOT',
      revisionNo: 'A',
      bomType: 'ebom',
      orgId: 'org-x',
      alternativeNo: 1
    };
    const records: Record<string, unknown>[] = [
      { kind: 'item', source_ref: 'root', itemNo: parent.itemNo, ext: { rohs: 'yes' } },
      { kind: 'item', source_ref: 'child', itemNo: 'PRODUCT-IMPORT-CHILD', ext: { rohs: 'yes' } },
      { kind: 'revision', source_ref: 'revision', itemNo: parent.itemNo, revisionNo: 'A' },
      { kind: 'header', source_ref: 'header', ...parent, baseQty: '1', baseUom: 'pcs' },
      { kind: 'line', source_ref: 'line', ...parent, lineNo: 10 },
      {
        kind: 'occurrence',
        source_ref: 'occurrence',
        ...parent,
        lineNo: 10,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        childItemNo: 'PRODUCT-IMPORT-CHILD',
        qty: '2',
        uom: 'pcs'
      }
    ];
    await page.getByTestId('import-file').setInputFiles({
      name: 'product-workflow-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(records))
    });
    await page.getByTestId('import-bom').click();
    await expect(page.getByTestId('import-status')).toContainText('导入成功', { timeout: 30000 });
    const draft = page.locator('.draft-list li').filter({ hasText: parent.itemNo });
    await expect(draft).toHaveCount(1);
    await expect(draft).toContainText('修订 A');
    await expect(draft).toContainText(/1\s*行/);
    await openPage(page, '概览');
    await page.reload();
    await expect(page.getByTestId('overview-data-status')).toContainText('数据可用', { timeout: 30000 });
    await openPage(page, '展开');
    await openIntegration(page);
    await expect(draft).toHaveCount(1, { timeout: 30000 });
    await expect(draft.getByTestId('import-draft-select')).not.toBeChecked();
    await expect(page.getByTestId('import-publish')).toBeDisabled();
    await draft.getByTestId('import-draft-select').check();
    await expect(page.getByTestId('import-publish')).toBeEnabled();
    await screenshot(page, 'import-drafts-desktop');
  });

  test('重复 M3 发生项显示各自路径，窄屏看完计算后能返回结构', async ({ page }) => {
    await openPage(page, '展开');
    await explode(page, '1');
    const tree = page.getByRole('tree', { name: '物料需求发生项树', exact: true });
    const direct = tree.locator('.requirement-row[data-item="M3"][aria-level="2"]');
    const throughHarness = tree.locator('.requirement-row[data-item="M3"][aria-level="3"]');
    await expect(tree.locator('.requirement-row[data-item="M3"]')).toHaveCount(2);
    await direct.click();
    const path = page.getByRole('navigation', { name: '所选发生项路径', exact: true });
    await expect(path).toContainText('电动滑板车（SC-100）');
    await expect(path).toContainText('M3 螺钉（M3）');
    await expect(path).not.toContainText('WH-01');
    await expect(page.locator('.step-row[data-step="7. 需求"] .value')).toHaveAttribute('data-value', '8');
    await throughHarness.click();
    await expect(page.locator('bom-step-panel .basis-source')).toContainText('BOM 头', { timeout: 10000 });
    await expect(path).toContainText('线束组件（WH-01）');
    await expect(path).toContainText('M3 螺钉（M3）');
    await expect(direct).toHaveAttribute('aria-selected', 'false');
    await expect(throughHarness).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.step-row[data-step="7. 需求"] .value')).toHaveAttribute('data-value', '4');
    expect(await direct.getAttribute('data-node-key')).not.toBe(await throughHarness.getAttribute('data-node-key'));
    await screenshot(page, 'repeated-material-desktop');

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId('selected-material')).toContainText('M3 螺钉（M3）');
    const back = page.getByRole('button', { name: '返回物料结构', exact: true });
    await expect(back).toBeVisible();
    await back.click();
    await expect(tree).toBeVisible();
    await expect(throughHarness).toBeVisible();
    await expect(throughHarness).toHaveAttribute('aria-selected', 'false');
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    await screenshot(page, 'repeated-material-mobile');
    await throughHarness.click();
    await expect(page.locator('.calculation-panel h2')).toBeFocused();
    await expect(tree).toBeHidden();
    await back.click();
    await expect(tree).toBeVisible();
  });
});
