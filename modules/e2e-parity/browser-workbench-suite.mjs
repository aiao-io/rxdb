import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const fixtures = {
  vanilla: { path: 'src/label.ts', heading: '本地 TypeScript 模板', counter: '次数' },
  react: { path: 'src/main.tsx', heading: '本地 React 模板', counter: '次数' },
  vue: { path: 'src/App.vue', heading: '本地 Vue 模板', counter: '次数' },
  angular: { path: 'src/app.ts', heading: 'Angular workspace', counter: 'Count:' }
};

async function createProject(page, expect, host, template) {
  const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
  await expect(root).toBeVisible({ timeout: 30000 });
  await root.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(`${host}-${template}-fixture`);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill(template);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.getByRole('combobox', { name: '当前项目' }).locator('option:checked')).toHaveText(
    `${host}-${template}-fixture`,
    { timeout: 30000 }
  );
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
  return root;
}

async function runPreview(page, expect, heading, fixture) {
  const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
  await root.locator('[data-action="run"]').click();
  const preview = page.frameLocator('.wb-preview-content iframe');
  await expect(preview.getByRole('heading', { name: heading, exact: true })).toBeVisible({ timeout: 60000 });
  const counter = preview.getByRole('button', { name: `${fixture.counter} 0`, exact: true });
  await expect(counter).toBeVisible();
  await counter.click();
  await expect(preview.getByRole('button', { name: `${fixture.counter} 1`, exact: true })).toBeVisible();
  if (fixture.counter === 'Count:') await expect(preview.getByTestId('parent-count')).toHaveText('Parent: 1');
  await expect(root.locator('[data-slot="problem-count"]')).toHaveText('0');
}

async function replaceHeading(page, expect, root, fixture, marker) {
  await root
    .locator('.wb-file')
    .and(page.getByTitle(fixture.path, { exact: true }))
    .click();
  const editor = root.getByRole('textbox', { name: '项目源码', exact: true });
  await expect(editor).toContainText(fixture.heading);
  const source = (await editor.locator('.cm-line').allTextContents()).join('\n');
  expect(source).toContain(fixture.heading);
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(source.replace(fixture.heading, marker));
  await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');
  await root.locator('[data-action="save"]').click();
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存', { timeout: 30000 });
}

async function commitProject(expect, root, message) {
  await root.getByRole('button', { name: '切换 Git 视图', exact: true }).click();
  await root.getByRole('button', { name: '暂存全部已保存修改', exact: true }).click();
  await expect(root.locator('[data-slot="changes"]')).not.toHaveText('', { timeout: 30000 });
  await root.getByRole('textbox', { name: '提交说明', exact: true }).fill(message);
  await root.getByRole('button', { name: '提交已暂存内容', exact: true }).click();
  await expect(root.locator('[data-slot="history"]')).toContainText(message, { timeout: 30000 });
  await expect(root.locator('[data-slot="changes"]')).toBeEmpty();
}

async function verifyArchive(page, expect, root, fixture, marker, projectId, testInfo) {
  const downloadPromise = page.waitForEvent('download');
  await root.getByRole('button', { name: '导出', exact: true }).click();
  const download = await downloadPromise;
  const archive = testInfo.outputPath(download.suggestedFilename());
  await mkdir(dirname(archive), { recursive: true });
  await download.saveAs(archive);
  const chooserPromise = page.waitForEvent('filechooser');
  await root.getByRole('button', { name: '导入', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(archive);
  await expect
    .poll(() => root.getByRole('combobox', { name: '当前项目' }).inputValue(), { timeout: 30000 })
    .not.toBe(projectId);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
  await runPreview(page, expect, marker, fixture);
  await expect(root.locator('[data-slot="history"]')).toContainText('browser-workbench-e2e');
  await expect(root.getByRole('combobox', { name: '当前项目' }).locator('option')).toHaveCount(3);
  await testInfo.attach('project-archive', { path: archive, contentType: 'application/zip' });
}

/** 受控模板清单；注册位置留在各宿主 spec，保证 Playwright 按文件筛选。 */
export const browserWorkbenchTemplates = Object.keys(fixtures);

async function readGitDiagnostics(page, projectId) {
  return page.evaluate(async id => {
    const base = new URL('/browser-workbench-assets/', location.href);
    const worker = new Worker(new URL('git-worker.js', base), { type: 'module' });
    let sequence = 0;
    const call = action =>
      new Promise((resolve, reject) => {
        const requestId = ++sequence;
        const timer = setTimeout(() => reject(new Error(`诊断 Git ${action} 超时`)), 10000);
        worker.onmessage = ({ data }) => {
          if (data.id !== requestId) return;
          clearTimeout(timer);
          resolve(data);
        };
        worker.onerror = event => {
          clearTimeout(timer);
          reject(new Error(event.message));
        };
        worker.postMessage({
          id: requestId,
          action,
          payload: { projectId: id, vendorBaseUrl: new URL('git/', base).href }
        });
      });
    try {
      return {
        status: await call('status'),
        history: await call('history'),
        ui: document.querySelector('[data-slot="changes"]')?.textContent
      };
    } finally {
      worker.terminate();
    }
  }, projectId);
}

/** 三端宿主执行同一份真实编辑、预览、持久化与 Git 用例。 */
export async function runBrowserWorkbenchCase(page, expect, host, template, testInfo) {
  const fixture = fixtures[template];
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.stack ?? error.message));
  await page.goto('/browser-workbench');
  const root = await createProject(page, expect, host, template);
  const projectId = await root.getByRole('combobox', { name: '当前项目' }).inputValue();
  const marker = `workbench-${host}-${template}-edited`;
  try {
    await runPreview(page, expect, fixture.heading, fixture);
    await replaceHeading(page, expect, root, fixture, marker);
    await runPreview(page, expect, marker, fixture);
    await page.reload();
    await expect(root.getByRole('combobox', { name: '当前项目' })).toHaveValue(projectId, { timeout: 30000 });
    await runPreview(page, expect, marker, fixture);
    const commit = `browser-workbench-e2e ${host}/${template}`;
    await commitProject(expect, root, commit);
    await page.reload();
    await expect(root.getByRole('combobox', { name: '当前项目' })).toHaveValue(projectId, { timeout: 30000 });
    await root.getByRole('button', { name: '切换 Git 视图', exact: true }).click();
    await expect(root.locator('[data-slot="history"]')).toContainText(commit);
    await runPreview(page, expect, marker, fixture);
    if (host === 'react' && template === 'vanilla')
      await verifyArchive(page, expect, root, fixture, marker, projectId, testInfo);
    expect(browserErrors).toEqual([]);
  } catch (error) {
    await testInfo.attach('browser-errors', {
      body: JSON.stringify(browserErrors, null, 2),
      contentType: 'application/json'
    });
    const git = await readGitDiagnostics(page, projectId).catch(cause => ({ error: String(cause) }));
    await testInfo.attach('git-diagnostics', { body: JSON.stringify(git, null, 2), contentType: 'application/json' });
    throw error;
  }
}
