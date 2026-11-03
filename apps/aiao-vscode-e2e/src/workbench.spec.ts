import { expect, test } from '@playwright/test';
import { browserWorkbenchTemplates, runWorkbenchCase } from './workbench-suite.mjs';

test.describe('浏览器开发工作台：aiao-vscode 应用', () => {
  test.setTimeout(180000);
  for (const template of browserWorkbenchTemplates) {
    test(`${template}：编辑、运行、保存重开与 Git 提交`, async ({ page }, testInfo) => {
      await runWorkbenchCase(page, expect, template, testInfo);
    });
  }
});
