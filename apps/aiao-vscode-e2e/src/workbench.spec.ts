import { expect, test, type Locator } from '@playwright/test';
import {
  browserWorkbenchTemplates,
  runEditorSwitchCase,
  runLayoutCase,
  runPreviewTabsCase,
  runRecoveryCase,
  runWorkbenchCase
} from './workbench-suite.mjs';

test.describe('浏览器开发工作台：aiao-vscode 应用', () => {
  test.setTimeout(180000);
  for (const template of browserWorkbenchTemplates) {
    test(`${template}：编辑、运行、保存重开与 Git 提交`, async ({ page }, testInfo) => {
      await runWorkbenchCase(page, expect, template, testInfo);
    });
  }
  test('CodeMirror 与 Monaco 切换，格式化撤销、保存与刷新恢复', async ({ page }) => {
    await runEditorSwitchCase(page, expect);
  });
  test('立即刷新恢复草稿，保存后清理未保存状态，偏好跨刷新保留', async ({ page }) => {
    await runRecoveryCase(page, expect);
  });
  test('预览标签按组替换，双击和编辑固定', async ({ page }) => {
    await runPreviewTabsCase(page, expect);
  });
  test('布局按项目保存：切换项目与直接打开都按原样还原', async ({ page }) => {
    await runLayoutCase(page, expect);
  });
  test('视图区块双向拖动，跨项目和刷新后保留归属', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
    const create = async (name: string): Promise<void> => {
      await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
      await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
      await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(name);
      await page.getByRole('dialog').locator('input[name="template"][value="vanilla"]').check();
      await page.getByRole('dialog').getByRole('button', { name: '创建项目', exact: true }).click();
      await expect(root.locator('[data-slot="workspace-label"]')).toHaveText(name, { timeout: 30000 });
      await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
    };
    const drag = async (source: Locator, target: Locator): Promise<void> => {
      const from = await source.boundingBox();
      const to = await target.boundingBox();
      if (!from || !to) throw new Error('视图拖放目标不可见');
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 6, { steps: 4 });
      await page.mouse.move(to.x + to.width / 3, to.y + to.height / 3, { steps: 24 });
      await page.mouse.move(to.x + to.width / 3 + 1, to.y + to.height / 3, { steps: 2 });
      await page.mouse.up();
    };
    await create('视图布局一');
    const first = await root.locator('[data-action="workspace"]').getAttribute('data-project-id');
    await root.locator('.wb-title-actions [data-action="panel"]').click();
    await root.locator('.wb-side-actions[data-view="explorer"] [data-action="more-actions"]').click();
    await root.locator('[data-menu-id="toggle-open-editors"]').click();
    const workspace = root.locator('[data-workbench-view="workspace"]');
    const heading = root.locator('.wb-view-heading[data-view-header="workspace"]');
    const movedTab = root.locator('.wb-dock-tab[data-panel="workspace"]');
    await drag(heading, root.locator('.wb-dock-tab[data-panel="terminal"]'));
    await expect(movedTab).toBeVisible();
    await expect(root.locator('[data-slot="files"] [data-workbench-view="workspace"]')).toHaveCount(0);
    await expect(workspace.locator('[data-tree-path="src/main.ts"]')).toBeVisible();
    await workspace.locator('[data-tree-path="src/label.ts"]').click();
    await expect(root.locator('[data-editor-tab-path="src/label.ts"]')).toBeVisible();
    await create('视图布局二');
    await expect(movedTab).toHaveCount(0);
    await expect(heading).toBeVisible();
    await root.getByRole('button', { name: '工作区', exact: true }).click();
    await root.locator(`[data-menu-id="project:${first}"]`).click();
    await expect(movedTab).toBeVisible();
    await expect(root.locator('[data-log="output"]')).toContainText('已打开 视图布局一');
    await page.reload();
    await expect(movedTab).toBeVisible({ timeout: 30000 });
    await movedTab.click();
    await expect(movedTab.locator('..')).toHaveClass(/dv-active-tab/);
    await expect(workspace.locator('[data-tree-path="src/main.ts"]')).toBeVisible();
    await drag(movedTab, root.locator('.wb-view-heading[data-view-header="open-editors"]'));
    await expect(heading).toBeVisible();
    await expect(movedTab).toHaveCount(0);
    await expect(root.locator('[data-slot="files"] [data-workbench-view="workspace"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('view-containers.png') });
    expect(errors).toEqual([]);
  });
});
