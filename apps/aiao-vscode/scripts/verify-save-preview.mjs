import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';

const url = process.argv.find(value => value.startsWith('--url='))?.slice('--url='.length) ?? 'http://localhost:4320/';
const functionalOnly = process.argv.includes('--functional-only');
const maximumWarmMs = process.argv.find(value => value.startsWith('--max-warm-ms='))?.slice('--max-warm-ms='.length);
if (maximumWarmMs !== undefined)
  assert(Number.isFinite(Number(maximumWarmMs)) && Number(maximumWarmMs) > 0, '性能预算必须为正数');
const reportDirectory = resolve(import.meta.dirname, '../benchmarks');
const reportPath = resolve(reportDirectory, 'browser-workbench-save-preview-verification.json');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
const workers = [];
const report = {
  format: 'aiao.workbench.save-preview-verification',
  version: 1,
  url,
  browser: browser.version(),
  functionalOnly,
  status: 'failed',
  checks: []
};
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.stack ?? error.message));
page.on('worker', worker => {
  if (worker.url().includes('compiler-worker')) workers.push(worker.url());
});
const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
const preview = page.frameLocator('iframe[title="项目隔离预览"]');
const status = root.locator('[data-slot="save-status"]');
const mainPath = 'src/main.tsx';
const counterPath = 'src/Counter.tsx';

async function openEditor(path) {
  await root
    .locator('.wb-file')
    .and(page.getByTitle(path, { exact: true }))
    .click();
  const editor = root.locator(`[data-editor-path="${path}"]`).getByRole('textbox', { name: '项目源码', exact: true });
  await expect(editor).toBeVisible();
  return editor;
}

async function content(editor) {
  return (await editor.locator('.cm-line').allTextContents()).join('\n');
}

async function replace(editor, value) {
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
}

async function saveCurrent(editor) {
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+s');
}

async function expectHeading(value) {
  await expect(preview.getByRole('heading', { name: value, exact: true })).toBeVisible({ timeout: 30000 });
}

async function installWorkerProbe() {
  await page.addInitScript(() => {
    const NativeWorker = globalThis.Worker;
    const state = { requests: [], historyRequestIds: [], historyReleased: false, saveReleased: false };
    const heldHistory = [];
    globalThis.__aiaoSavePreviewProbe = state;
    state.releaseHistory = () =>
      new Promise(resolveRelease => {
        const deliver = () => {
          if (state.historyReleased) {
            resolveRelease();
            return;
          }
          const remaining = 1800 - (performance.now() - state.historyHeldAt);
          if (remaining > 0) {
            setTimeout(deliver, remaining);
            return;
          }
          state.historyReleased = true;
          state.historyDelayMs = performance.now() - state.historyHeldAt;
          for (const item of heldHistory.splice(0))
            item.worker.dispatchEvent(new MessageEvent('message', { data: item.data }));
          resolveRelease();
        };
        deliver();
      });
    globalThis.Worker = class extends NativeWorker {
      constructor(workerURL, options) {
        super(workerURL, options);
        this.gitWorker = String(workerURL).includes('git-worker');
        if (!this.gitWorker) return;
        this.addEventListener(
          'message',
          event => {
            const id = event.data?.id;
            if (state.historyRequestIds.includes(id) && !state.historyReleased) {
              event.stopImmediatePropagation();
              state.historyHeldAt ??= performance.now();
              heldHistory.push({ worker: this, data: event.data });
            }
            if (state.saveRequestId !== undefined && id === state.saveRequestId && !state.saveReleased) {
              event.stopImmediatePropagation();
              state.saveHeld = true;
              state.releaseSave = () => {
                state.saveReleased = true;
                this.dispatchEvent(new MessageEvent('message', { data: event.data }));
              };
            }
          },
          true
        );
      }
      postMessage(message, ...transfer) {
        if (this.gitWorker && message && typeof message === 'object') {
          const source = message.payload?.files?.find(file => file.path === 'src/main.tsx')?.content;
          state.requests.push({
            id: message.id,
            action: message.action,
            projectId: message.payload?.projectId,
            source
          });
          if (message.action === 'history' && !state.historyReleased) state.historyRequestIds.push(message.id);
          if (message.action === 'save' && state.saveRequestId === undefined) state.saveRequestId = message.id;
        }
        super.postMessage(message, ...transfer);
      }
    };
  });
}

async function workerProbe() {
  return page.evaluate(() => {
    const state = globalThis.__aiaoSavePreviewProbe;
    return {
      historyHeld: state.historyHeldAt !== undefined,
      historyReleased: state.historyReleased,
      historyDelayMs: state.historyDelayMs,
      historyRequests: state.historyRequestIds.length,
      saveHeld: state.saveHeld === true,
      saveReleased: state.saveReleased,
      saves: state.requests.filter(request => request.action === 'save')
    };
  });
}

async function verifyInitialReadOnly() {
  await page.waitForFunction(() => globalThis.__aiaoSavePreviewProbe.historyHeldAt !== undefined);
  await expectHeading('Hello React');
  assert.equal((await workerProbe()).historyReleased, false, '初始预览不得等待 Git 历史读取');
  const editor = await openEditor(mainPath);
  const original = await content(editor);
  assert(original.includes('Hello React'));
  await replace(editor, original.replace('Hello React', 'initial-read-only-draft'));
  await expect(status).toContainText('未保存');
  await page.waitForFunction(() => performance.now() - globalThis.__aiaoSavePreviewProbe.historyHeldAt >= 1800);
  assert.equal((await workerProbe()).saves.length, 0, '未按保存的初始草稿不能触发 backend.save');

  await saveCurrent(editor);
  await page.waitForFunction(() => globalThis.__aiaoSavePreviewProbe.saveHeld === true);
  await replace(editor, original.replace('Hello React', 'initial-user-save-latest'));
  await page.evaluate(() => globalThis.__aiaoSavePreviewProbe.releaseHistory());
  await page.evaluate(() => globalThis.__aiaoSavePreviewProbe.releaseSave());
  await expectHeading('initial-user-save-latest');
  await expect(status).toContainText('已保存');
  const observed = await workerProbe();
  assert(observed.historyDelayMs >= 1800);
  assert(
    observed.saves.some(request => request.source?.includes('initial-user-save-latest')),
    '保存期间的新输入必须补存'
  );
  report.initialReadOnly = {
    ...observed,
    mechanism:
      '公开 Worker 请求仍由真实 Git Worker 执行；初始 history 响应持有至少 1.8s，首个 save ACK 在草稿更新后再释放。'
  };
  report.checks.push(
    'initial-preview-does-not-wait-for-history',
    'initial-draft-never-implicitly-saved',
    'history-release-during-save-keeps-latest-preview'
  );
}

async function createProject() {
  await expect(status).toContainText('已保存', { timeout: 30000 });
  await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
  await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('Save preview verification');
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill('react');
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.locator('[data-slot="workspace-label"]')).toHaveText(
    'Save preview verification',
    { timeout: 30000 }
  );
  await expectHeading('本地 React 模板');
}

async function measureAutomatic(editor, original) {
  const samples = [];
  const initialWorkers = workers.length;
  for (let index = 0; index < 6; index++) {
    const heading = `automatic-preview-${index}`;
    await replace(editor, original.replace('本地 React 模板', heading));
    await expect(status).toContainText('未保存');
    const started = performance.now();
    const workerCount = workers.length;
    await saveCurrent(editor);
    await expect(status).toContainText('已保存', { timeout: 30000 });
    const saved = performance.now();
    await expectHeading(heading);
    samples.push({
      index,
      saveMs: saved - started,
      saveToVisibleMs: performance.now() - started,
      compilerWorkersCreated: workers.length - workerCount
    });
  }
  const warm = samples
    .slice(1)
    .map(sample => sample.saveToVisibleMs)
    .sort((left, right) => left - right);
  const timing = {
    scenario:
      '真实 React 工作台；初始预览已就绪；编辑 TSX 后只按 CtrlS，观察新 iframe 标题可见；包括 100ms debounce 和 Playwright 操作/观察开销。',
    samples,
    warmMedianMs: warm[2],
    warmMinMs: warm[0],
    warmMaxMs: warm.at(-1),
    compilerWorkersCreatedDuringSamples: workers.length - initialWorkers
  };
  if (maximumWarmMs !== undefined)
    assert(
      timing.warmMedianMs <= Number(maximumWarmMs),
      `预览中位延迟 ${timing.warmMedianMs}ms 超过预算 ${maximumWarmMs}ms`
    );
  return timing;
}

async function verifyFunctional(editor, original) {
  const counter = await openEditor(counterPath);
  const counterOriginal = await content(counter);
  const draftCounter = counterOriginal.replace(/>次数\s*\{/, '>未保存 Counter {');
  assert.notEqual(draftCounter, counterOriginal, 'fixture 必须包含计数器按钮');
  await replace(counter, draftCounter);
  await openEditor(mainPath);
  await replace(editor, original.replace('本地 React 模板', 'scoped-save-current'));
  await saveCurrent(editor);
  await expectHeading('scoped-save-current');
  await expect(preview.getByRole('button', { name: '次数 0', exact: true })).toBeVisible();
  await expect(preview.getByRole('button', { name: '未保存 Counter 0', exact: true })).toHaveCount(0);
  await expect(status).toContainText('另有 1 个文件未保存');
  await expect(root.getByRole('tab', { name: 'Counter.tsx •', exact: true })).toBeVisible();
  await expect(root.getByRole('tab', { name: 'main.tsx', exact: true })).toBeVisible();
  report.checks.push('current-save-keeps-other-dirty-buffer-off-disk-and-preview');

  await editor.focus();
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await expect(preview.getByRole('button', { name: '未保存 Counter 0', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(status).not.toContainText('未保存');
  report.checks.push('workbench-save-all-shortcut-persists-all-buffers');

  await replace(editor, original.replace('本地 React 模板', 'rapid-preview-first'));
  await saveCurrent(editor);
  await replace(editor, original.replace('本地 React 模板', 'rapid-preview-latest'));
  await saveCurrent(editor);
  await expectHeading('rapid-preview-latest');
  await expect(status).toContainText('已保存');
  report.checks.push('rapid-save-keeps-latest-input-and-preview');

  const previous = await page.locator('iframe[title="项目隔离预览"]').elementHandle();
  assert(previous);
  await expect(root.locator('[data-slot="problem-count"]')).toHaveText('0');
  await replace(editor, 'import { createRoot } from "react-dom/client";\ncreateRoot(\n');
  await saveCurrent(editor);
  await expect(root.locator('[data-slot="problem-count"]')).not.toHaveText('0', { timeout: 30000 });
  await expectHeading('rapid-preview-latest');
  assert(await previous.evaluate(element => element.isConnected), '编译失败不得销毁成功预览');
  await expect(root.locator('.wb-preview-version')).toContainText('有未保存或更新的代码');
  report.checks.push('syntax-error-keeps-successful-preview-and-marks-it-stale');

  await replace(editor, original.replace('本地 React 模板', 'recovered-preview'));
  await saveCurrent(editor);
  await expectHeading('recovered-preview');
  await expect(preview.getByRole('button', { name: '未保存 Counter 0', exact: true })).toBeVisible();
  report.checks.push('next-save-recovers-after-compile-error');
}

try {
  await mkdir(reportDirectory, { recursive: true });
  await installWorkerProbe();
  await page.goto(url);
  await verifyInitialReadOnly();
  await createProject();
  const editor = await openEditor(mainPath);
  const original = await content(editor);
  assert(original.includes('本地 React 模板'));
  if (!functionalOnly) report.timing = await measureAutomatic(editor, original);
  await verifyFunctional(editor, original);
  assert.deepEqual(errors, []);
  report.pageErrors = errors;
  report.workerProbe = await workerProbe().catch(error => ({ error: String(error) }));
  report.status = 'passed';
  console.log(JSON.stringify(report));
} catch (cause) {
  report.error = cause.stack ?? String(cause);
  report.pageErrors = errors;
  report.workerProbe = await workerProbe().catch(error => ({ error: String(error) }));
  report.logs = await page
    .locator('.wb-panel-content')
    .allTextContents()
    .catch(() => []);
  console.error(JSON.stringify(report));
  await page
    .screenshot({ path: resolve(reportDirectory, 'browser-workbench-save-preview-failure.png'), fullPage: true })
    .catch(() => undefined);
  throw cause;
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
