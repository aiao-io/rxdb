import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveProfileAppRoots } from './dashboard-profile-layout.mjs';

const mode = process.argv[2];
assert(['seed', 'logic', 'ui'].includes(mode), '用法：profile-dashboard-activity.mjs seed|logic|ui <输出 JSON>');
const output = resolve(process.argv[3] ?? '/tmp/nexus-dashboard-profile.json');
const workspace = process.cwd();
const fixtureDir = process.env.PROFILE_FIXTURE_DIR ?? '/tmp/nexus-dashboard-fixtures';
const origin = process.env.PROFILE_ORIGIN ?? 'http://127.0.0.1:8315';
const frameworks = process.env.PROFILE_FRAMEWORK ? [process.env.PROFILE_FRAMEWORK] : ['react', 'angular', 'vue'];
const sizes = process.env.PROFILE_SIZE ? [Number(process.env.PROFILE_SIZE)] : [1000, 10000, 100000];
const ports = { react: 8312, angular: 8213, vue: 8314 };
const layout = process.env.PROFILE_LAYOUT ?? 'product';
const appRoots = await resolveProfileAppRoots({
  workspace,
  layout,
  frameworks: mode === 'seed' ? ['react'] : frameworks
});

async function connectScene({ appRoot, size, mode }) {
  const base = `/@fs${appRoot}/`;
  const { createWorkbenchDatabase } = await import(`${base}rxdb/setup_rxdb.ts`);
  const database = createWorkbenchDatabase();
  const adapter = await database.getAdapter('sqlite-wasm');
  if (mode === 'logic') await adapter.restore((await fetch('/__profile_fixture')).body);
  const connectedAt = performance.now();
  await Promise.race([
    database.connect('sqlite-wasm'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('数据库连接超过 30 秒')), 30000))
  ]);
  const connectionMs = performance.now() - connectedAt;
  if (mode === 'seed') {
    const {
      rows: [[branchId]]
    } = await adapter.rawQuery('SELECT id FROM "rxdb$rxdb_branch" LIMIT 1');
    await adapter.rawQuery(
      `WITH RECURSIVE series(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM series WHERE n < ?)
  INSERT INTO "rxdb$rxdb_change" (type,namespace,entity,entityId,patch,branchId,createdAt,transactionId)
  SELECT 'INSERT','assets','AssetCategory',CAST(n AS TEXT),?,?,
  strftime('%Y-%m-%dT%H:%M:%fZ','2026-01-01','+' || (n / 1000.0) || ' seconds'),
  CASE WHEN n % 8 < 6 THEN 'batch-' || CAST((n+2) / 8 AS INTEGER) ELSE NULL END FROM series`,
      [size, JSON.stringify({ name: '测量日志', padding: 'x'.repeat(256) }), branchId]
    );
  }
  const queries = [];
  const transaction = adapter.transaction.bind(adapter);
  adapter.transaction = (fun, ...args) =>
    transaction(
      async executor => {
        const execute = executor.execute.bind(executor);
        executor.execute = async (sql, params) => {
          const start = performance.now();
          const result = await execute(sql, params);
          if (!sql.includes('rxdb$rxdb_change') || !/^\s*(?:SELECT|WITH)/i.test(sql)) return result;
          queries.push({
            ms: performance.now() - start,
            rows: result.results.reduce((n, row) => n + row.rows.length, 0),
            sql,
            result: result.results[0]
          });
          return result;
        };
        return fun(executor);
      },
      ...args
    );
  const { observeDashboardActivities } = await import(`${base}pages/dashboard-activity-source.ts`);
  const model = await import(`${base}pages/dashboard-model.ts`);
  globalThis.dashboardProfile = { database, adapter, queries, observeDashboardActivities, model, base };
  return { connectionMs };
}

async function measureActivities() {
  const scene = globalThis.dashboardProfile;
  const start = performance.now();
  const state = await new Promise((resolve, reject) => {
    const subscription = scene.observeDashboardActivities(scene.database).subscribe({
      next: value => {
        if (value.loading) return;
        resolve(value);
        queueMicrotask(() => subscription.unsubscribe());
      },
      error: reject
    });
  });
  const readyMs = performance.now() - start;
  if (state.error) throw new Error(state.error);
  globalThis.dashboardProfileState = state;
  return {
    readyMs,
    activities: state.activities.map(({ changeId, count, fingerprint }) => ({ changeId, count, fingerprint }))
  };
}

async function collectNativeProfile() {
  const { queries, model, base } = globalThis.dashboardProfile;
  const activity = queries.findLast(
    query => query.result.columns.includes('changeId') || query.result.columns.includes('id')
  );
  let processingMs;
  if (activity.result.columns.includes('changeId')) {
    const { decodeDashboardActivities } = await import(`${base}pages/dashboard-activity-query.ts`);
    const start = performance.now();
    decodeDashboardActivities({ ...activity.result, rowsAffected: 0 });
    processingMs = performance.now() - start;
  } else {
    const changes = activity.result.rows.map(row => {
      const values = Object.fromEntries(activity.result.columns.map((column, index) => [column, row[index]]));
      return { ...values, createdAt: new Date(values.createdAt) };
    });
    const start = performance.now();
    model.normalizeDashboardChanges(changes);
    processingMs = performance.now() - start;
  }
  const raw = await globalThis.dashboardProfile.adapter.rawQuery(`SELECT id, namespace, entity, type, transactionId,
  createdAt, revertChangeId, redoInvalidatedAt FROM "rxdb$rxdb_change"
  WHERE branchId = 'main' AND namespace = 'assets' AND entity IN ('AssetCategory', 'Asset', 'AssetEvent') ORDER BY id DESC`);
  const changes = raw.rows.map(row => ({
    ...Object.fromEntries(raw.columns.map((column, index) => [column, row[index]])),
    createdAt: new Date(row[raw.columns.indexOf('createdAt')])
  }));
  const aggregationStart = performance.now();
  const reference = model.normalizeDashboardChanges(changes);
  const baselineAggregationMs = performance.now() - aggregationStart;
  const signature = item => ({
    changeId: item.changeId,
    fingerprint: item.fingerprint,
    namespace: item.namespace,
    entity: item.entity,
    type: item.type,
    count: item.count,
    at: item.createdAt.toISOString(),
    reverted: item.reverted,
    redoInvalidated: item.redoInvalidated
  });
  if (
    JSON.stringify(reference.map(signature)) !==
    JSON.stringify(globalThis.dashboardProfileState.activities.map(signature))
  ) {
    throw new Error('SQL 聚合与原始 JS 归一化不一致');
  }
  return { nativeMs: activity.ms, returnedRows: activity.rows, processingMs, baselineAggregationMs };
}

async function measureUi(page, cdp, framework, size, fixture) {
  const address = process.env[`PROFILE_UI_${framework.toUpperCase()}`] ?? `http://127.0.0.1:${ports[framework]}`;
  await page.goto(`${address}/backup`);
  await page.getByTestId('restore-input').setInputFiles(fixture);
  await page.getByTestId('restore-result').filter({ hasText: '恢复成功' }).waitFor({ timeout: 120000 });
  await cdp.send('HeapProfiler.collectGarbage');
  const before = await cdp.send('Runtime.getHeapUsage');
  const start = performance.now();
  await page.getByTestId('dashboard-nav-link').click();
  const items = page.getByTestId('dashboard-activity-item');
  await items.nth(4).waitFor({ timeout: 120000 });
  await page.getByTestId('admin-widget-language').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const readyMs = performance.now() - start;
  const after = await cdp.send('Runtime.getHeapUsage');
  const read = () =>
    items.evaluateAll(elements =>
      elements.map(item => ({
        text: item.textContent,
        time: item.querySelector('time').getAttribute('datetime')
      }))
    );
  const activities = await read();
  await page.reload();
  await items.nth(4).waitFor();
  assert.deepEqual(await read(), activities, `${framework}/${size}: 刷新丢失活动`);
  return {
    readyMs,
    heapDelta: after.usedSize - before.usedSize,
    backingStorageDelta: after.backingStorageSize - before.backingStorageSize,
    activities
  };
}

async function prepareDatabasePage(page, fixture) {
  await page.route('**/sqlite-wasm/wa-sqlite-async.wasm', route =>
    route.fulfill({
      path: resolve(
        workspace,
        'packages/rxdb-adapter-sqlite-wasm/node_modules/@subframe7536/sqlite-wasm/dist/wa-sqlite-async.wasm'
      ),
      contentType: 'application/wasm'
    })
  );
  if (mode === 'logic') await page.route('**/__profile_fixture', route => route.fulfill({ path: fixture }));
  await page.goto(origin);
}

async function downloadFixture(page, fixture) {
  const download = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { adapter, base } = globalThis.dashboardProfile;
    const { collectBackup, downloadBlob } = await import(`${base}backup/backup-ops.ts`);
    const backup = await collectBackup(adapter);
    downloadBlob(backup.blob, 'profile.rxdb-backup');
  });
  await (await download).saveAs(fixture);
  return { fixture };
}

async function measureDatabase(page, cdp, framework, size, fixture) {
  await prepareDatabasePage(page, fixture);
  const connection = await page.evaluate(connectScene, { appRoot: appRoots[framework], size, mode });
  if (mode === 'seed') return { ...connection, ...(await downloadFixture(page, fixture)) };
  await cdp.send('HeapProfiler.collectGarbage');
  const before = await cdp.send('Runtime.getHeapUsage');
  const measurement = await page.evaluate(measureActivities);
  const after = await cdp.send('Runtime.getHeapUsage');
  const native = await page.evaluate(collectNativeProfile);
  return {
    ...connection,
    ...measurement,
    ...native,
    heapDelta: after.usedSize - before.usedSize,
    backingStorageDelta: after.backingStorageSize - before.backingStorageSize
  };
}

async function profileOne(browser, framework, size) {
  const fixture = resolve(fixtureDir, `activity-${size}.rxdb-backup`);
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const measurement =
      mode === 'ui' ?
        await measureUi(page, cdp, framework, size, fixture)
      : await measureDatabase(page, cdp, framework, size, fixture);
    return { framework, size, ...measurement };
  } finally {
    await context.close();
  }
}

const results = [];
await mkdir(fixtureDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const framework of mode === 'seed' ? ['react'] : frameworks) {
    for (const size of sizes) {
      const result = await profileOne(browser, framework, size);
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
  await writeFile(
    output,
    JSON.stringify({ measuredAt: new Date().toISOString(), mode, layout, appRoots, results }, null, 2),
    { mode: 0o600 }
  );
} finally {
  await browser.close();
}
