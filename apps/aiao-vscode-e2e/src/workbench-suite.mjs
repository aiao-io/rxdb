import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const fixtures = {
  vanilla: { path: 'src/label.ts', heading: '本地 TypeScript 模板', counter: '次数' },
  react: { path: 'src/main.tsx', heading: '本地 React 模板', counter: '次数' },
  vue: { path: 'src/App.vue', heading: '本地 Vue 模板', counter: '次数' },
  angular: { path: 'src/app.html', heading: 'Angular workspace', counter: 'Count:' }
};

async function openTitleMenu(root) {
  await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
}

async function openWorkspaceMenu(root) {
  await root.getByRole('button', { name: '工作区', exact: true }).click();
}

async function switchProject(root, projectId) {
  await openWorkspaceMenu(root);
  await root.locator(`[data-menu-id="project:${projectId}"]`).click();
}

async function createProject(page, expect, template) {
  const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
  await expect(root).toBeVisible({ timeout: 30000 });
  await openTitleMenu(root);
  await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(`vscode-${template}-fixture`);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill(template);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.locator('[data-slot="workspace-label"]')).toHaveText(`vscode-${template}-fixture`, {
    timeout: 30000
  });
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
  return root;
}

async function runPreview(page, expect, heading, fixture) {
  const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
  const run = root.locator('[data-action="rerun-preview"]');
  await run.click();
  await expect(run).toBeEnabled({ timeout: 60000 });
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
  await openTitleMenu(root);
  await root.getByRole('menuitem', { name: '保存当前文件', exact: true }).click();
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存', { timeout: 30000 });
}

async function commitProject(expect, root, message) {
  await root.getByRole('button', { name: '切换 Git 视图', exact: true }).click();
  await root.getByRole('button', { name: '暂存所有更改', exact: true }).click();
  await expect(root.locator('[data-scm-count="staged"]')).not.toHaveText('0', { timeout: 30000 });
  await root.getByRole('textbox', { name: '提交说明', exact: true }).fill(message);
  await root.getByRole('button', { name: '提交已暂存内容', exact: true }).click();
  await expect(root.locator('[data-slot="history"]')).toContainText(message, { timeout: 30000 });
  await expect(root.locator('[data-scm-count="staged"]')).toHaveText('0');
  await expect(root.locator('[data-scm-count="working"]')).toHaveText('0');
}

async function verifyArchive(page, expect, root, fixture, marker, projectId, testInfo) {
  await openWorkspaceMenu(root);
  const projectCount = await root.locator('[data-menu-id^="project:"]').count();
  const downloadPromise = page.waitForEvent('download');
  await openTitleMenu(root);
  await root.getByRole('menuitem', { name: '导出项目', exact: true }).click();
  const download = await downloadPromise;
  const archive = testInfo.outputPath(download.suggestedFilename());
  await mkdir(dirname(archive), { recursive: true });
  await download.saveAs(archive);
  const chooserPromise = page.waitForEvent('filechooser');
  await openTitleMenu(root);
  await root.getByRole('menuitem', { name: '导入项目', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(archive);
  await expect
    .poll(() => root.locator('[data-action="workspace"]').getAttribute('data-project-id'), { timeout: 30000 })
    .not.toBe(projectId);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
  await runPreview(page, expect, marker, fixture);
  await expect(root.locator('[data-slot="history"]')).toContainText('browser-workbench-e2e');
  await openWorkspaceMenu(root);
  await expect(root.locator('[data-menu-id^="project:"]')).toHaveCount(projectCount + 1);
  await expect(root.locator(`[data-menu-id="project:${projectId}"]`)).toHaveCount(1);
  await testInfo.attach('project-archive', { path: archive, contentType: 'application/zip' });
}

/** 受控模板清单；注册位置留在宿主 spec，保证 Playwright 按文件筛选。 */
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
        ui: document.querySelector('.wb-scm')?.textContent
      };
    } finally {
      worker.terminate();
    }
  }, projectId);
}

/** aiao-vscode 应用上执行真实编辑、预览、持久化与 Git 用例。 */
export async function runWorkbenchCase(page, expect, template, testInfo) {
  const fixture = fixtures[template];
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.stack ?? error.message));
  await page.goto('/');
  const root = await createProject(page, expect, template);
  const projectId = await root.locator('[data-action="workspace"]').getAttribute('data-project-id');
  const marker = `workbench-${template}-edited`;
  try {
    // 侧栏对齐 VS Code：工作区节头、活动栏切换标题与视图
    await expect(root.locator('[data-tree-section="workspace"]')).toContainText(`vscode-${template}-fixture`);
    await root.getByRole('button', { name: '切换 Git 视图', exact: true }).click();
    await expect(root.locator('[data-slot="side-title"]')).toHaveText('源代码管理');
    await expect(root.locator('[data-scm-group="working"]')).toBeVisible();
    await root.getByRole('button', { name: '切换资源管理器', exact: true }).click();
    await expect(root.locator('[data-slot="side-title"]')).toHaveText('资源管理器');
    await runPreview(page, expect, fixture.heading, fixture);
    await replaceHeading(page, expect, root, fixture, marker);
    // 「打开的编辑器」树节默认关闭，经资源管理器「视图和更多操作」菜单开启（对齐单测 showOpenEditors 步骤）
    await root.locator('.wb-side-actions[data-view="explorer"] [data-action="more-actions"]').click();
    await expect(root.locator('.wb-context-menu [data-menu-id="toggle-open-editors"]')).toBeVisible();
    await root.locator('.wb-context-menu [data-menu-id="toggle-open-editors"]').click();
    await expect(root.locator('[data-tree-section="open-editors"]')).toBeVisible();
    await expect(root.locator('.wb-editor-row').first()).toBeVisible();
    // 资源管理器文件拖放：新建文件与文件夹，保存全部后把文件拖进文件夹
    await root.locator('.wb-tree [data-action="new-file"]').click();
    await root.locator('.wb-inline-input').fill('drag-me.txt');
    await root.locator('.wb-inline-input').press('Enter');
    await root.locator('.wb-tree [data-action="new-folder"]').click();
    await root.locator('.wb-inline-input').fill('assets');
    await root.locator('.wb-inline-input').press('Enter');
    await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');
    await page.keyboard.press('ControlOrMeta+Shift+S');
    await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存', { timeout: 30000 });
    // 新建落点在树焦点所在目录：replaceHeading 后活动文件在 src/ 下（各模板一致），故新文件与文件夹都落在 src/
    // Playwright 的 dragTo 只发鼠标事件，不发 HTML5 拖放事件；用真实 DataTransfer 走一遍完整管线
    // 保存全部后树会异步刷新 Git 装饰（重渲染会短暂清空行），先等源 / 目标行可见再派发
    await expect(root.locator('[data-tree-path="src/drag-me.txt"]')).toBeVisible();
    await expect(root.locator('[data-tree-path="src/assets"]')).toBeVisible();
    await page.evaluate(() => {
      const tree = document.querySelector('.wb-tree');
      const source = tree?.querySelector('button[data-tree-path="src/drag-me.txt"]');
      const target = tree?.querySelector('button[data-tree-path="src/assets"]');
      if (!source || !target) throw new Error('拖放源或目标行缺失');
      const data = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: data }));
    });
    await expect(root.locator('button[data-tree-path="src/assets/drag-me.txt"]')).toBeVisible({ timeout: 30000 });
    await expect(root.locator('button[data-tree-path="src/drag-me.txt"]')).toHaveCount(0);
    await runPreview(page, expect, marker, fixture);
    await page.reload();
    await expect(root.locator('[data-action="workspace"]')).toHaveAttribute('data-project-id', projectId, {
      timeout: 30000
    });
    await runPreview(page, expect, marker, fixture);
    const commit = `browser-workbench-e2e ${template}`;
    await commitProject(expect, root, commit);
    await page.reload();
    await expect(root.locator('[data-action="workspace"]')).toHaveAttribute('data-project-id', projectId, {
      timeout: 30000
    });
    await root.getByRole('button', { name: '切换 Git 视图', exact: true }).click();
    await expect(root.locator('[data-slot="history"]')).toContainText(commit);
    await runPreview(page, expect, marker, fixture);
    if (template === 'vanilla') await verifyArchive(page, expect, root, fixture, marker, projectId, testInfo);
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

/** 布局按项目保存：拆分编辑器、收起侧栏与底部面板后，切换项目再切回、直接打开根地址都按原样还原。 */
export async function runLayoutCase(page, expect) {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.stack ?? error.message));
  await page.goto('/');
  const root = await createProject(page, expect, 'vanilla');
  const projectId = await root.locator('[data-action="workspace"]').getAttribute('data-project-id');
  for (const path of ['src/main.ts', 'src/label.ts']) {
    await root
      .locator('.wb-file')
      .and(page.getByTitle(path, { exact: true }))
      .dblclick();
    await expect(root.locator(`[data-editor-tab-path="${path}"]`)).toBeVisible();
  }
  await root.getByRole('button', { name: '向右拆分编辑器组', exact: true }).click();
  const editorGroups = root.locator('.dv-groupview').filter({ has: page.locator('[data-editor-tab-path]') });
  await expect(editorGroups).toHaveCount(2);
  const panel = root.locator('.wb-title-actions [data-action="panel"]');
  const sidebar = root.locator('[data-action="toggle-sidebar"]');
  await sidebar.click();
  await expect(panel).toHaveAttribute('aria-pressed', 'false');
  await expect(sidebar).toHaveAttribute('aria-pressed', 'false');
  // 新建第二个项目：切换时第一个项目待写的布局随即落库；第二个项目打开底部面板，布局与第一个不同
  await createProject(page, expect, 'react');
  await panel.click();
  await expect(panel).toHaveAttribute('aria-pressed', 'true');
  await switchProject(root, projectId);
  await expect(editorGroups).toHaveCount(2, { timeout: 30000 });
  await expect(panel).toHaveAttribute('aria-pressed', 'false');
  await expect(sidebar).toHaveAttribute('aria-pressed', 'false');
  // 「已打开」在目录写入最近打开时间之后才记，等它再导航，根地址才会恢复这个项目
  await expect(root.locator('[data-log="output"]')).toContainText('已打开 vscode-vanilla-fixture');
  await page.goto('/');
  await expect(root.locator('[data-action="workspace"]')).toHaveAttribute('data-project-id', projectId, {
    timeout: 30000
  });
  await expect(editorGroups).toHaveCount(2, { timeout: 30000 });
  for (const group of await editorGroups.all()) await expect(group.locator('[data-editor-tab-path]')).toHaveCount(1);
  await expect(panel).toHaveAttribute('aria-pressed', 'false');
  await expect(sidebar).toHaveAttribute('aria-pressed', 'false');
  await expect(root.locator('[data-log="problems"]')).toBeHidden();
  expect(new URL(page.url()).hash).toBe('');
  expect(browserErrors).toEqual([]);
}

export async function runRecoveryCase(page, expect) {
  await page.goto('/');
  const root = await createProject(page, expect, 'vanilla');
  const editor = root.locator('[data-editor-path="src/main.ts"] .cm-content');
  for (let attempt = 0; attempt < 5; attempt++) {
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    const marker = `immediate-refresh-${attempt}`;
    await page.keyboard.insertText(`\n// ${marker}\n`);
    await page.reload();
    await expect(editor).toContainText(marker, { timeout: 30000 });
    await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');
  }
  await root.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await settings.locator('select[name="indent-unit"]').selectOption('    ');
  await settings.getByRole('button', { name: '确定', exact: true }).click();
  await page.reload();
  await expect(root.locator('[data-slot="indent"]')).toHaveText('空格: 4');
  await expect(editor).toContainText('immediate-refresh-4');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+S');
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存在此浏览器');
  await page.reload();
  for (let attempt = 0; attempt < 5; attempt++) await expect(editor).toContainText(`immediate-refresh-${attempt}`);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存在此浏览器');
  await expect(root.locator('[data-slot="indent"]')).toHaveText('空格: 4');
}

export async function runPreviewTabsCase(page, expect) {
  await page.goto('/');
  const root = await createProject(page, expect, 'vanilla');
  const file = path => root.locator(`.wb-file[data-tree-path="${path}"]`);
  const tab = path => root.locator(`[data-editor-tab-path="${path}"]`);
  await file('src/label.ts').click();
  await expect(tab('src/label.ts')).toHaveClass(/wb-preview-tab/);
  await file('package.json').click();
  await expect(tab('src/label.ts')).toHaveCount(0);
  await expect(tab('package.json')).toHaveClass(/wb-preview-tab/);
  await file('package.json').dblclick();
  await expect(tab('package.json')).not.toHaveClass(/wb-preview-tab/);
  await file('src/label.ts').click();
  await root.getByRole('button', { name: '向右拆分编辑器组', exact: true }).click();
  await tab('package.json').click();
  await file('tsconfig.json').click();
  await expect(tab('src/label.ts')).toBeVisible();
  await expect(tab('tsconfig.json')).toHaveClass(/wb-preview-tab/);
  const editor = root.locator('[data-editor-path="tsconfig.json"] .cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' ');
  await expect(tab('tsconfig.json')).not.toHaveClass(/wb-preview-tab/);
  await file('src/main.ts').click();
  await expect(tab('tsconfig.json')).toBeVisible();
  await expect(tab('src/label.ts')).toBeVisible();
}

/** 两种编辑器的切换、草稿恢复、格式化撤销与保存。 */
export async function runEditorSwitchCase(page, expect) {
  const errors = [];
  const workerResponses = [];
  const editorWorkers = [];
  page.on('worker', worker => {
    if (worker.url().includes('/monaco/')) editorWorkers.push(worker.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (/\/monaco\/(typescript|editor-worker|json|css|html)\.js$/.test(response.url()))
      workerResponses.push(response.status());
  });
  await page.goto('/?workbench-verify');
  const root = await createProject(page, expect, 'vanilla');
  const path = 'src/main.ts';
  const editorHost = root.locator(`[data-editor-path="${path}"]`);
  const source = 'const message="切换😀";\nconsole.log(message);\n';
  const sourceValue = () => page.evaluate(() => window.workbench.session.state.files['src/main.ts']);
  const chooseEditor = async engine => {
    await root.locator('[data-action="settings"]').click();
    const dialog = page.getByRole('dialog', { name: '设置', exact: true });
    await dialog.locator('select[name="editor-engine"]').selectOption(engine);
    await dialog.getByRole('button', { name: '确定', exact: true }).click();
    await expect(editorHost).toHaveAttribute('data-editor-engine', engine);
    await expect(editorHost).not.toHaveAttribute('aria-busy', 'true', { timeout: 30000 });
  };
  const codeMirror = editorHost.locator('.cm-content');
  await codeMirror.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(source);
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ArrowRight');
  const cursorBefore = await root.locator('[data-slot="cursor"]').textContent();
  await chooseEditor('monaco');
  await expect(editorHost.locator('.monaco-editor')).toBeVisible();
  await expect(editorHost.locator('.monaco-editor .overflow-guard')).toHaveCSS('position', 'relative');
  await expect(editorHost.locator('.cm-editor')).toHaveCount(0);
  await expect.poll(sourceValue).toBe(source);
  await expect(root.locator('[data-slot="cursor"]')).toHaveText(cursorBefore);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');

  const monacoInput = editorHost.getByRole('textbox', { name: /项目源码/ });
  const monacoModifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
  await monacoInput.focus();
  await page.keyboard.press(`${monacoModifier}+a`);
  await page.keyboard.insertText(source + '// Monaco 输入\n');
  await expect.poll(sourceValue).toContain('// Monaco 输入');
  await page.keyboard.press('Shift+Alt+f');
  await expect.poll(sourceValue).toContain("const message = '切换😀';");
  await page.keyboard.press(`${monacoModifier}+z`);
  await expect.poll(sourceValue).toContain('const message="切换😀";');
  await page.keyboard.press(`${monacoModifier}+f`);
  await expect(editorHost.locator('.find-widget')).toBeVisible();
  await page.keyboard.press('Escape');

  await chooseEditor('codemirror');
  await expect(codeMirror).toContainText('// Monaco 输入');
  await expect(editorHost.locator('.monaco-editor')).toHaveCount(0);
  await chooseEditor('monaco');
  await page.reload();
  await expect(editorHost.locator('.monaco-editor')).toBeVisible({ timeout: 30000 });
  await expect.poll(sourceValue).toContain('// Monaco 输入');
  await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');
  await monacoInput.focus();
  await page.keyboard.press('ControlOrMeta+s');
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存', { timeout: 30000 });
  await page.reload();
  await expect(editorHost.locator('.monaco-editor')).toBeVisible({ timeout: 30000 });
  await expect.poll(sourceValue).toContain('// Monaco 输入');
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
  await expect.poll(() => editorWorkers.some(url => url.endsWith('/typescript.js'))).toBe(true);
  await expect.poll(() => workerResponses.length).toBeGreaterThan(0);
  expect(workerResponses.every(status => status === 200)).toBe(true);
  expect(errors).toEqual([]);
}
