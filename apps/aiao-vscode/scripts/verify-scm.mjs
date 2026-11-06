import { unzipSync } from 'fflate';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';

const execFile = promisify(execFileCallback);
const url = process.argv.find(value => value.startsWith('--url='))?.slice('--url='.length) ?? 'http://localhost:4320/';
const host = 'vscode';

const output = join(import.meta.dirname, '../benchmarks');
await mkdir(output, { recursive: true });
const reportPath = join(output, `browser-workbench-scm-${host}.json`);
const screenshot = join(output, `browser-workbench-scm-${host}.png`);
const temporary = await mkdtemp(join(tmpdir(), 'aiao-scm-ux-'));
const context = await chromium.launchPersistentContext(join(temporary, 'profile'), {
  headless: true,
  viewport: { width: 1680, height: 1050 }
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
const unexpectedDialogs = [];
const assetRequests = [];
const report = {
  format: 'aiao.browser-workbench.scm',
  version: 1,
  host,
  url,
  status: 'failed',
  checks: [],
  browser: context.browser()?.version(),
  generatedAt: new Date().toISOString()
};
page.on('pageerror', error => errors.push(error.stack ?? error.message));
page.on('dialog', dialog => {
  unexpectedDialogs.push({ type: dialog.type(), message: dialog.message() });
  void dialog.dismiss();
});
page.on('response', response => {
  if (!response.url().endsWith('/git-worker.js')) return;
  assetRequests.push(
    response.body().then(bytes => ({
      url: response.url(),
      status: response.status(),
      sha256: createHash('sha256').update(bytes).digest('hex')
    }))
  );
});

const a = 'src/label.ts';
const b = 'src/main.ts';
const markers = {
  staged: 'scm-staged-one',
  working: 'scm-working-two',
  discarded: 'scm-discard-saved',
  unsaved: 'scm-discard-unsaved',
  other: 'scm-other-draft'
};
let root;
let scm;

async function step(name, operation) {
  process.stdout.write(`SCM UX: ${name}\n`);
  const start = performance.now();
  await operation();
  report.checks.push({ name, milliseconds: performance.now() - start });
}

async function sidebar(kind) {
  const button = root.locator(`[data-action="${kind}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

function editor(path) {
  return root.locator(`[data-editor-path="${path}"]`).getByRole('textbox', { name: '项目源码', exact: true });
}
function dirty(path) {
  return root.locator(`[data-editor-tab-path="${path}"] .wb-dirty-marker`);
}
function row(path, kind) {
  return scm.locator(`[data-scm-group="${kind}"] [data-scm-path="${path}"]`);
}
function fileAction(path, kind, action) {
  return row(path, kind).locator('..').locator(`[data-scm-action="${action}"]`);
}
async function count(kind, value) {
  await expect(scm.locator(`[data-scm-count="${kind}"]`)).toHaveText(String(value), { timeout: 30000 });
}

async function openFile(path) {
  await sidebar('explorer');
  await root
    .locator('.wb-file')
    .and(page.getByTitle(path, { exact: true }))
    .click();
  await expect(editor(path)).toBeVisible();
}

async function source(path) {
  return (await editor(path).locator('.cm-line').allTextContents()).join('\n');
}
async function replace(path, value) {
  await openFile(path);
  await editor(path).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
  await expect(dirty(path)).toBeVisible();
}
async function save(path) {
  await editor(path).focus();
  await page.keyboard.press('ControlOrMeta+s');
  await expect(dirty(path)).toBeHidden({ timeout: 30000 });
}

async function commit(message) {
  await sidebar('git');
  const input = scm.getByRole('textbox', { name: '提交说明', exact: true });
  await input.fill(message);
  await expect(scm.getByRole('button', { name: '提交已暂存内容', exact: true })).toBeEnabled();
  await input.press('ControlOrMeta+Enter');
  await expect(root.locator('[data-slot="history"]')).toContainText(message, { timeout: 30000 });
  await count('staged', 0);
  await expect(input).toHaveValue('');
}

async function diff(path, kind) {
  await sidebar('git');
  await row(path, kind).click();
  const panel = root.locator(`.wb-auxiliary-host[data-auxiliary-id="diff:${kind}:${path}"]`);
  await expect(panel.locator('.wb-diff')).toBeVisible({ timeout: 30000 });
  await expect(panel.locator('.cm-editor')).toHaveCount(2);
  const labels = kind === 'staged' ? ['HEAD', 'index'] : ['index', 'worktree'];
  const sides = labels.map(label => panel.locator(`[aria-label="${label}（只读）"]`));
  for (const side of sides) {
    await expect(side).toBeVisible();
    await expect(side).toHaveAttribute('contenteditable', 'false');
  }
  return { panel, base: sides[0], modified: sides[1] };
}

async function exportedArchive(projectId) {
  return page.evaluate(
    projectId =>
      new Promise((resolveExport, reject) => {
        const worker = new Worker('/browser-workbench-assets/git-worker.js', { type: 'module' });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('独立Git导出超时'));
        }, 30000);
        worker.onmessage = ({ data }) => {
          clearTimeout(timeout);
          worker.terminate();
          if (data.error) reject(new Error(data.error.message));
          else resolveExport(data.result);
        };
        worker.onerror = event => {
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error(event.message));
        };
        worker.postMessage({
          id: 1,
          action: 'export',
          payload: { projectId, vendorBaseUrl: new URL('/browser-workbench-assets/git/', location.href).href }
        });
      }),
    projectId
  );
}

try {
  await page.goto(url);
  root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存', { timeout: 30000 });
  scm = root.locator('[data-slot="scm"]');
  await step('fresh-profile-project-and-initial-index-commit', async () => {
    await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
    await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(`SCM UX ${host}`);
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill('vanilla');
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
    await expect(root.getByRole('combobox', { name: '当前项目' }).locator('option:checked')).toHaveText(
      `SCM UX ${host}`,
      { timeout: 30000 }
    );
    await sidebar('git');
    const button = scm.getByRole('button', { name: '暂存所有更改', exact: true });
    await expect(button).toBeEnabled();
    assert.equal(await button.locator('button').count(), 0);
    await button.click();
    await count('working', 0);
    await expect
      .poll(async () => Number(await scm.locator('[data-scm-count="staged"]').textContent()))
      .toBeGreaterThan(5);
    await commit('scm-ux initial snapshot');
  });

  await openFile(a);
  const originalA = await source(a);
  await openFile(b);
  const originalB = await source(b);
  const stagedA = `${originalA}\nexport const stagedMarker = ${JSON.stringify(markers.staged)};\n`;
  const workingA = `${stagedA}\nexport const workingMarker = ${JSON.stringify(markers.working)};\n`;
  await step('working-diff-index-to-saved-working-file', async () => {
    await replace(a, stagedA);
    await save(a);
    await sidebar('git');
    await count('working', 1);
    const view = await diff(a, 'working');
    await expect(view.base).not.toContainText(markers.staged);
    await expect(view.modified).toContainText(markers.staged);
  });

  await step('per-file-stage-and-exact-staged-versus-working-diffs', async () => {
    await fileAction(a, 'working', 'stage').click();
    await count('staged', 1);
    await count('working', 0);
    await replace(a, workingA);
    await save(a);
    await sidebar('git');
    await count('working', 1);
    await count('staged', 1);
    const stagedView = await diff(a, 'staged');
    await expect(stagedView.base).not.toContainText(markers.staged);
    await expect(stagedView.modified).toContainText(markers.staged);
    await expect(stagedView.modified).not.toContainText(markers.working);
    const workingView = await diff(a, 'working');
    await expect(workingView.base).toContainText(markers.staged);
    await expect(workingView.base).not.toContainText(markers.working);
    await expect(workingView.modified).toContainText(markers.working);
  });

  await step('per-file-unstage-and-index-only-mod-enter-commit-with-other-draft', async () => {
    await fileAction(a, 'staged', 'unstage').click();
    await count('staged', 0);
    await count('working', 1);
    await fileAction(a, 'working', 'stage').click();
    await count('staged', 1);
    await count('working', 0);
    await replace(b, `${originalB}\nconsole.log(${JSON.stringify(markers.other)});\n`);
    await sidebar('git');
    await expect(scm.locator('.wb-scm-hint')).toContainText('未保存');
    await commit('scm-ux index-only with draft');
    await openFile(b);
    await expect(editor(b)).toContainText(markers.other);
    await expect(dirty(b)).toBeVisible();
  });

  await step('save-current-preserves-other-draft-and-confirmed-discard-only-target', async () => {
    await replace(a, `${workingA}\nexport const discarded = ${JSON.stringify(markers.discarded)};\n`);
    await save(a);
    await expect(dirty(b)).toBeVisible();
    await editor(a).focus();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText(`\nexport const unsavedTarget = ${JSON.stringify(markers.unsaved)};\n`);
    await expect(dirty(a)).toBeVisible();
    await sidebar('git');
    await count('working', 1);
    await expect(fileAction(a, 'working', 'stage')).toBeDisabled();
    await expect(fileAction(a, 'working', 'discard')).toBeEnabled();
    await fileAction(a, 'working', 'discard').click();
    await expect(page.getByRole('dialog')).toContainText('未保存的编辑也会被丢弃');
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    await openFile(a);
    await expect(editor(a)).toContainText(markers.unsaved);
    await sidebar('git');
    await fileAction(a, 'working', 'discard').click();
    await page.getByRole('dialog').getByRole('button', { name: '丢弃更改', exact: true }).click();
    await count('working', 0);
    await openFile(a);
    await expect(editor(a)).not.toContainText(markers.discarded);
    await expect(editor(a)).not.toContainText(markers.unsaved);
    await expect(editor(a)).toContainText(markers.working);
    await expect(dirty(a)).toBeHidden();
    await openFile(b);
    await expect(editor(b)).toContainText(markers.other);
    await expect(dirty(b)).toBeVisible();
  });

  await step('untracked-file-delete-requires-explicit-confirmation', async () => {
    const path = 'src/untracked-scm.ts';
    await sidebar('explorer');
    await root.getByRole('button', { name: '新建文件', exact: true }).click();
    await page.getByRole('textbox', { name: '文件路径', exact: true }).fill(path);
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
    await expect(editor(path)).toBeVisible();
    await editor(path).focus();
    await page.keyboard.insertText('export const untracked = 1;\n');
    await save(path);
    await sidebar('git');
    await count('working', 1);
    await fileAction(path, 'working', 'discard').click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(row(path, 'working')).toBeVisible();
    await fileAction(path, 'working', 'discard').click();
    await page.getByRole('dialog').getByRole('button', { name: '删除文件', exact: true }).click();
    await count('working', 0);
    await openFile(b);
    await expect(editor(b)).toContainText(markers.other);
    await expect(dirty(b)).toBeVisible();
  });

  await step('independent-native-git-proves-index-only-history-and-unsaved-draft-not-persisted', async () => {
    const id = await root.getByRole('combobox', { name: '当前项目' }).inputValue();
    const bytes = await exportedArchive(id);
    const files = unzipSync(new Uint8Array(bytes));
    const native = join(temporary, 'repository');
    await mkdir(native);
    for (const [path, contents] of Object.entries(files)) {
      const target = join(native, path);
      if (path.endsWith('/')) {
        await mkdir(target, { recursive: true });
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    await execFile('git', ['-C', native, 'fsck', '--full']);
    const historyCount = (await execFile('git', ['-C', native, 'rev-list', '--count', 'HEAD'])).stdout.trim();
    assert.equal(historyCount, '2');
    const committedA = (await execFile('git', ['-C', native, 'show', `HEAD:${a}`])).stdout;
    const committedB = (await execFile('git', ['-C', native, 'show', `HEAD:${b}`])).stdout;
    assert(committedA.includes(markers.staged) && committedA.includes(markers.working));
    assert(!committedB.includes(markers.other));
    assert(!(await readFile(join(native, b), 'utf8')).includes(markers.other));
    assert(!files['src/untracked-scm.ts']);
    assert.equal((await execFile('git', ['-C', native, 'status', '--porcelain'])).stdout.trim(), '');
    report.git = {
      historyCount: Number(historyCount),
      head: (await execFile('git', ['-C', native, 'rev-parse', 'HEAD'])).stdout.trim(),
      nativeStatus: 'clean',
      otherDraftInEditorOnly: true
    };
  });

  await sidebar('git');
  await expect(root.locator('[data-slot="problem-count"]')).toHaveText('0');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedDialogs, []);
  report.status = 'passed';
  process.stdout.write(`SCM UX verified for ${host}.\n`);
} catch (error) {
  report.error = error.stack ?? String(error);
  report.visibleText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  report.logs = await page
    .locator('.wb-panel-content')
    .allTextContents()
    .catch(() => []);
  throw error;
} finally {
  report.errors = errors;
  report.unexpectedDialogs = unexpectedDialogs;
  report.gitWorkerAssets = await Promise.all(assetRequests);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
  report.screenshot = screenshot;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await context.close();
  await rm(temporary, { recursive: true, force: true });
}
