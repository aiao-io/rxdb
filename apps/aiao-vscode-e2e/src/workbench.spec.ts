import { expect, test } from '@playwright/test';
import {
  browserWorkbenchTemplates,
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
  test('立即刷新恢复草稿，保存后清理未保存状态，偏好跨刷新保留', async ({ page }) => {
    await runRecoveryCase(page, expect);
  });
  test('预览标签按组替换，双击和编辑固定', async ({ page }) => {
    await runPreviewTabsCase(page, expect);
  });
  test('布局按项目保存：切换项目与直接打开都按原样还原', async ({ page }) => {
    await runLayoutCase(page, expect);
  });
});
