import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [framework, port] of [
    ['react', 8312],
    ['angular', 8213],
    ['vue', 8314]
  ]) {
    const trials = [];
    for (let trial = 0; trial < 3; trial++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send('Network.enable');
      await session.send('Network.setCacheDisabled', { cacheDisabled: true });
      const initial = performance.now();
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.getByRole('heading', { name: '开始使用工作台', exact: true }).waitFor();
      const startReadyMs = performance.now() - initial;
      const collect = () =>
        page.evaluate(() =>
          performance.getEntriesByType('resource').map(entry => ({
            path: new URL(entry.name).pathname,
            bytes: entry.encodedBodySize,
            transferBytes: entry.transferSize,
            type: entry.initiatorType
          }))
        );
      const startResources = await collect();
      const dashboardStart = performance.now();
      await page.getByTestId('dashboard-nav-link').click();
      await page.getByTestId('dashboard-connection-status').filter({ hasText: '数据库已连接' }).waitFor();
      await page.getByTestId('dashboard-recent-activity-empty').waitFor();
      trials.push({
        trial,
        startReadyMs,
        dashboardReadyMs: performance.now() - dashboardStart,
        startResources,
        dashboardResources: await collect()
      });
      await context.close();
    }
    results.push({ framework, trials });
    console.log(
      framework,
      trials.map(({ startReadyMs, dashboardReadyMs }) => ({ startReadyMs, dashboardReadyMs }))
    );
  }
  await writeFile(process.argv[2], JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2));
} finally {
  await browser.close();
}
