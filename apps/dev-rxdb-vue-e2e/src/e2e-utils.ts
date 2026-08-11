import { expect, type Locator, type Page } from '@playwright/test';

/**
 * E2E 共享工具。
 *
 * @remarks
 * P0-2：spec 里原先散落着 `parseInt(text?.match(/\d+/)?.[0] ?? '0')` ——
 * **选择器没匹配上、文案改了、正则没命中，三种失败全被压成"计数是 0"**，
 * 后续断言于是在一个假数据上继续跑，还可能因为 0 恰好满足条件而变绿。
 * 这里读不出来就直接抛，把"读不到"和"读到 0"分开。
 *
 * @module e2e-utils
 */

/**
 * 从一段文案里取出第一个整数。
 *
 * @param text - 元素文本；`null` 表示元素不存在或没有文本
 * @param what - 出错信息里用来指认现场
 * @throws {@link Error} 文本为空或不含数字时
 */
export function readCount(text: string | null, what: string): number {
  const matched = text?.match(/\d+/)?.[0];
  if (matched === undefined) {
    throw new Error(`无法从${what}中读出计数：${JSON.stringify(text)}`);
  }
  return Number(matched);
}

export async function openPage(page: Page, path: string, title: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

async function getRowByTitle(page: Page, testId: string, idAttribute: string, title: string): Promise<Locator> {
  const matchingRow = page.getByTestId(testId).filter({ hasText: title });
  await expect(matchingRow).toBeVisible({ timeout: 15000 });

  const id = await matchingRow.getAttribute(idAttribute);
  if (!id) {
    throw new Error(`行缺少 ${idAttribute}: ${title}`);
  }

  return page.getByTestId(testId).and(page.locator(`[${idAttribute}=${JSON.stringify(id)}]`));
}

export function getMenuRow(page: Page, title: string): Promise<Locator> {
  return getRowByTitle(page, 'menu-row', 'data-menu-id', title);
}

/** 在三种树实现中执行相同的子菜单创建流程。 */
export async function addChildMenu(page: Page, parent: Locator, title: string): Promise<Locator> {
  await parent.hover();
  await parent.getByTestId('menu-add-child').click();
  await expect(page.getByTestId('menu-submit-child')).toBeVisible();
  await page.getByTestId('menu-title-input').fill(title);
  await page.getByTestId('menu-submit-child').click();

  const child = await getMenuRow(page, title);
  await expectMenuParent(child, parent);
  return child;
}

/** 在树行内进入编辑态并返回输入框，避免依赖行的 DOM 父级。 */
export async function editMenuRow(row: Locator): Promise<Locator> {
  await row.hover();
  await row.getByTestId('menu-edit').click();
  return row.getByTestId('menu-edit-input');
}

export async function getMenuDeleteButton(row: Locator): Promise<Locator> {
  await row.hover();
  return row.getByTestId('menu-delete');
}

export async function requireAttribute(locator: Locator, name: string, what: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (!value) {
    throw new Error(`${what}缺少 ${name}`);
  }
  return value;
}

export async function expectMenuParent(child: Locator, parent: Locator): Promise<void> {
  const parentId = await requireAttribute(parent, 'data-menu-id', '父菜单行');
  await expect(child).toHaveAttribute('data-parent-id', parentId);
}

export async function addRootMenu(page: Page, title: string): Promise<Locator> {
  const input = page.getByTestId('menu-title-input');
  await input.fill(title);
  await page.getByTestId('menu-add-root').click();
  const row = await getMenuRow(page, title);
  await expect(input).toHaveValue('');
  return row;
}

export function getFileRow(page: Page, name: string): Promise<Locator> {
  return getRowByTitle(page, 'file-row', 'data-file-id', name);
}

export async function editFileRow(row: Locator): Promise<Locator> {
  await row.hover();
  await row.getByTestId('file-edit').click();
  return row.getByTestId('file-edit-input');
}

export async function addRootFolder(page: Page, name: string): Promise<Locator> {
  const input = page.getByTestId('file-name-input');
  await input.fill(name);
  await page.getByTestId('file-submit').click();
  const row = await getFileRow(page, name);
  await expect(input).toHaveValue('');
  return row;
}
