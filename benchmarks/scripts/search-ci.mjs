#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { aggregateBenchmarkReports } from './search-ci-report.mjs';

const port = Number(process.env.SEARCH_BENCH_PORT ?? 3230);
const baseUrl = `http://127.0.0.1:${port}`;
const runnerUrl = `${baseUrl}/search-ci-runner.html`;
const reportPath = resolve(process.cwd(), 'reports/rxdb-plugin-search-latest.json');
const viteCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const benchmarkAttemptCount = 3;

async function waitForProcessExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return true;
  }

  return await new Promise(resolveProcess => {
    const timer = setTimeout(() => {
      cleanup();
      resolveProcess(false);
    }, timeoutMs);

    const onExit = () => {
      cleanup();
      resolveProcess(true);
    };

    const cleanup = () => {
      clearTimeout(timer);
      childProcess.off('exit', onExit);
      childProcess.off('error', onExit);
    };

    childProcess.once('exit', onExit);
    childProcess.once('error', onExit);
  });
}

async function stopServer(childProcess) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  childProcess.kill('SIGTERM');
  const exitedAfterTerminate = await waitForProcessExit(childProcess, 5_000);
  if (exitedAfterTerminate || childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  childProcess.kill('SIGKILL');
  await waitForProcessExit(childProcess, 5_000);
}

function assertNumber(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`[search-ci] ${label} is not a valid number`);
  }
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(`[search-ci] timed out waiting for benchmark server: ${lastError}`);
}

async function readBenchmarkReport(page) {
  await page.waitForFunction(
    () => Boolean(window.__searchBenchReport) || Boolean(window.__searchBenchError),
    undefined,
    { timeout: 10 * 60 * 1000 }
  );

  const payload = await page.evaluate(() => ({
    report: window.__searchBenchReport ?? null,
    error: window.__searchBenchError ?? null
  }));

  if (payload.error) {
    throw new Error(payload.error);
  }

  return payload.report;
}

function assertBenchmarkReport(report) {
  if (report?.status !== 'completed') {
    throw new Error('[search-ci] benchmark did not complete successfully');
  }
  if (!Array.isArray(report.sections) || report.sections.length < 3) {
    throw new Error('[search-ci] benchmark report is missing required sections');
  }

  assertNumber(report.metrics?.backfillMs, 'metrics.backfillMs');
  assertNumber(report.metrics?.queryP50Ms, 'metrics.queryP50Ms');
  assertNumber(report.metrics?.queryP90Ms, 'metrics.queryP90Ms');
  assertNumber(report.metrics?.insertRequeryP90Ms, 'metrics.insertRequeryP90Ms');
  assertNumber(report.metrics?.batch100RequeryP95Ms, 'metrics.batch100RequeryP95Ms');
  assertNumber(report.thresholds?.insertRequeryP90Ms, 'thresholds.insertRequeryP90Ms');
  assertNumber(report.thresholds?.batch100RequeryP95Ms, 'thresholds.batch100RequeryP95Ms');
}

function formatMetrics(metrics) {
  return (
    `query p50=${metrics.queryP50Ms.toFixed(2)}ms, ` +
    `query p90=${metrics.queryP90Ms.toFixed(2)}ms, ` +
    `insert->query p90=${metrics.insertRequeryP90Ms.toFixed(2)}ms, ` +
    `batch100->query p95=${metrics.batch100RequeryP95Ms.toFixed(2)}ms, ` +
    `backfill=${metrics.backfillMs.toFixed(2)}ms`
  );
}

async function main() {
  const viteServer = spawn(
    viteCommand,
    ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: process.cwd(),
      env: { ...process.env, CI: process.env.CI ?? '1' },
      stdio: 'inherit'
    }
  );

  let browser;

  try {
    await waitForServer(baseUrl);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(0);
    const reports = [];
    for (let attempt = 1; attempt <= benchmarkAttemptCount; attempt++) {
      await page.goto(`${runnerUrl}?attempt=${attempt}`, { waitUntil: 'load' });
      const report = await readBenchmarkReport(page);
      assertBenchmarkReport(report);
      reports.push(report);
      console.log(`[search-ci] attempt ${attempt}/${benchmarkAttemptCount}: ${formatMetrics(report.metrics)}`);
    }

    const report = aggregateBenchmarkReports(reports);

    await mkdir(resolve(process.cwd(), 'reports'), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(`[search-ci] completed (median of ${benchmarkAttemptCount}): ${formatMetrics(report.metrics)}`);
    console.log(`[search-ci] report written to ${reportPath}`);

    const failures = [];
    if (report.metrics.insertRequeryP90Ms > report.thresholds.insertRequeryP90Ms) {
      failures.push(
        `insert->query p90 ${report.metrics.insertRequeryP90Ms.toFixed(2)}ms > ${report.thresholds.insertRequeryP90Ms}ms`
      );
    }
    if (report.metrics.batch100RequeryP95Ms > report.thresholds.batch100RequeryP95Ms) {
      failures.push(
        `batch100->query p95 ${report.metrics.batch100RequeryP95Ms.toFixed(2)}ms > ${report.thresholds.batch100RequeryP95Ms}ms`
      );
    }

    if (failures.length > 0) {
      for (const failure of failures) {
        console.error(`[search-ci] regression: ${failure}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await stopServer(viteServer).catch(() => undefined);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
