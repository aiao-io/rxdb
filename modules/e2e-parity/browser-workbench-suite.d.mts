import type { Expect, Page, TestInfo } from '@playwright/test';

/** 受控模板清单。 */
export declare const browserWorkbenchTemplates: readonly ('vanilla' | 'react' | 'vue' | 'angular')[];

/** 通过 UI 关闭编辑、预览、保存、Git 与归档的组合验收。 */
export declare function runBrowserWorkbenchCase(
  page: Page,
  expect: Expect,
  host: 'angular' | 'react' | 'vue',
  template: (typeof browserWorkbenchTemplates)[number],
  testInfo: TestInfo
): Promise<void>;
