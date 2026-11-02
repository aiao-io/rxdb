import { expect, test } from '@playwright/test';
import {
  browserWorkbenchTemplates,
  runBrowserWorkbenchCase
} from '../../../modules/e2e-parity/browser-workbench-suite.mjs';

test.describe('浏览器开发工作台：react 宿主', () => {
  test.setTimeout(180000);
  for (const template of browserWorkbenchTemplates) {
    test(`${template}：编辑、运行、保存重开与 Git 提交`, async ({ page }, testInfo) => {
      await runBrowserWorkbenchCase(page, expect, 'react', template, testInfo);
    });
  }
});
