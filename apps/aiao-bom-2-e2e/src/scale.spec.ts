import { expect, test } from '@playwright/test';
import type { ListTable } from '@visactor/vtable';
import os from 'node:os';
const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];

test('50k / 20 列与 100k 末项、宽树预算和性能证据', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('bom-grid').locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '收起详情面板' }).click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const before = (await cdp.send('Performance.getMetrics')).metrics.find(
    metric => metric.name === 'JSHeapUsedSize'
  )!.value;
  await page.getByRole('button', { name: '规模测试', exact: true }).first().click();
  await page.locator('dialog').getByRole('button', { name: '加载测试数据' }).click();
  await expect(page.getByTestId('matched-count')).toHaveText('50,000');
  await expect(page.getByTestId('bom-grid').locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '列配置', exact: true }).click();
  for (const checkbox of await page
    .locator('.column-menu label:not(.catalog-toggle) input[type=checkbox]:enabled')
    .all())
    await checkbox.check();
  await page.getByRole('button', { name: '列配置', exact: true }).click();
  const drawTimes: number[] = [];
  const switchTimes: number[] = [];
  const searchTimes: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await page.getByRole('button', { name: i % 2 ? '结构树' : '平铺', exact: true }).click();
    await page.evaluate(
      () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    switchTimes.push(performance.now() - start);
    drawTimes.push(Number(await page.getByTestId('bom-grid').getAttribute('data-interaction-ms')));
  }
  await page.getByRole('button', { name: '平铺', exact: true }).click();
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('data-row-count', '50000');
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill(`ST-${String(49980 + i).padStart(6, '0')}`);
    await expect(page.getByTestId('bom-grid')).toHaveAttribute(
      'data-query',
      `ST-${String(49980 + i).padStart(6, '0')}`
    );
    await expect(page.getByTestId('matched-count')).toHaveText('1');
    await expect(page.getByTestId('bom-grid')).toHaveAttribute(
      'data-rendered-query',
      `ST-${String(49980 + i).padStart(6, '0')}`
    );
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    searchTimes.push(Math.max(0, performance.now() - start - 180));
  }
  const gridBox = await page.getByTestId('bom-grid').boundingBox();
  if (!gridBox) throw new Error('表格画布未就绪');
  await page.mouse.click(gridBox.x + 170, gridBox.y + 57);
  await expect(page.getByTestId('selected-summary')).toContainText('ST-049999');
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('');
  await expect(page.getByTestId('matched-count')).toHaveText('50,000');
  await page.mouse.move(gridBox.x + 200, gridBox.y + 160);
  const frames = page.evaluate(
    () =>
      new Promise<number[]>(resolve => {
        const values: number[] = [];
        let previous = performance.now();
        const until = previous + 1200;
        const tick = (time: number) => {
          values.push(time - previous);
          previous = time;
          if (time < until) requestAnimationFrame(tick);
          else resolve(values.slice(1));
        };
        requestAnimationFrame(tick);
      })
  );
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 700);
  const frameTimes = await frames;
  const windowRecords = Number(await page.getByTestId('bom-grid').getAttribute('data-window-records'));
  expect(windowRecords).toBeLessThanOrEqual(4000);
  await cdp.send('HeapProfiler.collectGarbage');
  const after = (await cdp.send('Performance.getMetrics')).metrics.find(
    metric => metric.name === 'JSHeapUsedSize'
  )!.value;
  const report = {
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()),
    timestamp: new Date().toISOString(),
    build: 'production',
    browser: await page.evaluate(() => navigator.userAgent),
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    viewport: page.viewportSize(),
    cpu: os.cpus()[0]?.model,
    memoryGiB: os.totalmem() / 1073741824,
    shape: 'balanced',
    occurrences: 50000,
    columns: 20,
    samples: 20,
    debounceMs: 180,
    modeSwitchRenderMs: { p50: percentile(drawTimes, 0.5), p95: percentile(drawTimes, 0.95) },
    modeSwitchMs: { p50: percentile(switchTimes, 0.5), p95: percentile(switchTimes, 0.95) },
    searchAfterDebounceMs: { p50: percentile(searchTimes, 0.5), p95: percentile(searchTimes, 0.95) },
    frames: {
      samples: frameTimes.length,
      p95Ms: percentile(frameTimes, 0.95),
      averageFps: 1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length)
    },
    heapDeltaMiB: before !== null && after !== null ? (after - before) / 1048576 : null,
    windowRecords,
    raw: { drawTimes, switchTimes, searchTimes }
  };
  await import('node:fs/promises').then(fs =>
    fs
      .mkdir('test-output/evidence', { recursive: true })
      .then(() => fs.writeFile('test-output/evidence/50k-performance.json', JSON.stringify(report, null, 2)))
  );
  await info.attach('50k-performance.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(report.searchAfterDebounceMs.p95).toBeLessThanOrEqual(300);
  expect(report.modeSwitchMs.p95).toBeLessThanOrEqual(150);
  expect(report.frames.averageFps).toBeGreaterThanOrEqual(50);
  expect(report.frames.p95Ms).toBeLessThanOrEqual(32);
  if (report.heapDeltaMiB !== null) expect(report.heapDeltaMiB).toBeLessThan(200);
  await page.getByRole('button', { name: '规模测试', exact: true }).first().click();
  await page.locator('dialog select[name=count]').selectOption('100000');
  await page.locator('dialog select[name=shape]').selectOption('wide');
  await page.locator('dialog').getByRole('button', { name: '加载测试数据' }).click();
  await expect(page.getByTestId('matched-count')).toHaveText('100,000');
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('aria-busy', 'false');
  const tableCanvas = page.getByTestId('bom-grid').locator('canvas').first();
  const pageLabel = await tableCanvas.evaluate(canvas => {
    const table = (canvas as HTMLCanvasElement & { __vtable__: ListTable }).__vtable__;
    table.scrollToCell({ col: 1, row: 502 });
    return table.getCellValue(1, 502);
  });
  expect(pageLabel).toContain('加载后续');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  const continuation = await tableCanvas.evaluate(canvas => {
    const table = (canvas as HTMLCanvasElement & { __vtable__: ListTable }).__vtable__;
    const rect = table.getCellRelativeRect(1, 502);
    const bounds = canvas.getBoundingClientRect();
    return { x: bounds.x + rect.left + 100, y: bounds.y + rect.top + 17 };
  });
  await page.mouse.click(continuation.x, continuation.y);
  await expect
    .poll(() =>
      tableCanvas.evaluate(canvas => (canvas as HTMLCanvasElement & { __vtable__: ListTable }).__vtable__.rowCount)
    )
    .toBe(1003);
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('ST-099999');
  await expect(page.getByTestId('matched-count')).toHaveText('1');
  await page.getByRole('button', { name: '平铺', exact: true }).click();
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('data-rendered-mode', 'flat');
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('data-rendered-query', 'ST-099999');
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('aria-busy', 'false');
  const lastBox = await page.getByTestId('bom-grid').boundingBox();
  if (!lastBox) throw new Error('表格画布未就绪');
  await page.mouse.click(lastBox.x + 170, lastBox.y + 57);
  await expect(page.getByTestId('selected-summary')).toContainText('ST-099999');
  await expect(page).toHaveURL(/occurrence=stress%3A99999/);
  expect(errors).toEqual([]);
});
