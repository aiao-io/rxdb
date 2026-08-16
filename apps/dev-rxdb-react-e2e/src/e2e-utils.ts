import { expect, type Locator, type Page } from '@playwright/test';

/**
 * E2E 共享的解析工具。
 *
 * @remarks
 * P1-6：spec 里原先散落着 `parseInt(text?.match(/\d+/)?.[0] ?? '0')` ——
 * **选择器没匹配上、文案改了、正则没命中，三种失败全被伪装成"计数是 0"**，
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

export async function openPage(page: Page, path: string, title: string | RegExp): Promise<void> {
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

export async function expectMenuParent(child: Locator, parent: Locator): Promise<void> {
  const parentId = await parent.getAttribute('data-menu-id');
  if (!parentId) {
    throw new Error('父菜单行缺少 data-menu-id');
  }
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

export async function requireAttribute(locator: Locator, name: string, subject: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (!value) {
    throw new Error(`${subject} 缺少 ${name}`);
  }
  return value;
}

export async function addRootFolder(page: Page, name: string): Promise<Locator> {
  const input = page.getByTestId('file-name-input');
  await input.fill(name);
  await page.getByTestId('file-submit').click();
  const row = await getFileRow(page, name);
  await expect(input).toHaveValue('');
  return row;
}

// key 名与 packages/rxdb-test/src/testing/e2e-db-name.ts 里的一致 —— 三端 demo 都用它
// 给每个 Playwright context 分配独立库名。改这里必须同步改那边（以及 angular / vue 的同名文件）。
const E2E_DB_NAME_STORAGE_KEY = '__aiao_e2e_db_name__';
const E2E_RESET_MARKER = '__aiao_e2e_state_reset__';

/**
 * 为当前 Playwright context 建立一次性的数据库隔离边界。
 *
 * init script 只在首次文档加载时移除数据库名；同一测试内的 reload 保留
 * 已生成的名字，因此既不会读取上一个测试的数据，也能验证刷新后的持久化。
 */
export async function resetE2eState(page: Page): Promise<void> {
  await page.addInitScript(
    ({ dbNameStorageKey, resetMarker }) => {
      if (window.sessionStorage.getItem(resetMarker) !== '1') {
        window.localStorage.removeItem(dbNameStorageKey);
        window.sessionStorage.removeItem(dbNameStorageKey);
        window.sessionStorage.setItem(resetMarker, '1');
      }
    },
    { dbNameStorageKey: E2E_DB_NAME_STORAGE_KEY, resetMarker: E2E_RESET_MARKER }
  );
}
