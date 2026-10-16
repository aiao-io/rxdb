import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';

/**
 * @fileoverview 只读检出位（US-313）用例的查看器读法：功能用例与 a11y 用例共用。
 *
 * @remarks
 * 实体列表由 VTable 画在 canvas 上，行不是 DOM 节点。VTable 把实例挂在 canvas 的 `__vtable__` 上，
 * 记录从那里读（与 `entity-model.spec.ts` 的 `findActionIcon` 同一个入口）。
 */

/** 查看器左栏里的一个实体条目；`key` 是 `${namespace}:${name}`。 */
export const readOnlyEntity = (page: Page, key: string): Locator =>
  page.locator(`[data-testid="wt-readonly-entity"][data-entity-key="${key}"]`);

/** 查看器右栏表格里已经载入的记录的 `title`。 */
export const readOnlyTitles = (page: Page): Promise<string[]> =>
  page
    .getByTestId('wt-readonly-list')
    .locator('canvas')
    .first()
    .evaluate(el => {
      const table = (el as unknown as { __vtable__?: { records: Array<Record<string, unknown>> } }).__vtable__;
      return (table?.records ?? []).map(record => String(record['title']));
    });

/** 选中查看器里的一个实体，等它的列表载入出标题为 `title` 的那一行。 */
export const browseReadOnly = async (page: Page, key: string, title: string): Promise<void> => {
  await readOnlyEntity(page, key).click();
  await expect.poll(() => readOnlyTitles(page), { timeout: 30000 }).toContain(title);
};
