import type { Locator, Page } from '@playwright/test';

const E2E_DB_NAME_STORAGE_KEY = '__aiao_e2e_db_name__';
const E2E_RESET_MARKER = '__aiao_e2e_state_reset__';

/**
 * E2E 共享的解析工具。
 *
 * @remarks
 * spec 里原先散落着 `parseInt(text?.match(/\d+/)?.[0] ?? '0')` ——
 * **选择器没匹配上、文案改了、正则没命中，三种失败全被压成"计数是 0"**，
 * 后续断言于是在一个假数据上继续跑。这里读不出来就直接抛。
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

/** 读取必需的 DOM 属性，缺失时直接给出可定位的错误。 */
export async function readRequiredAttribute(locator: Locator, attribute: string, what: string): Promise<string> {
  const value = await locator.getAttribute(attribute);
  if (value === null) {
    throw new Error(`${what}缺少 ${attribute} 属性`);
  }
  return value;
}

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

/**
 * 读出草稿缓存（`@aiao/rxdb-plugin-workspace`）落在 IndexedDB 里的全部键。
 *
 * @remarks
 * 直接读 IndexedDB 的 `workspace` 对象仓库，不走页面：要断言的是「到底落了什么盘」，
 * 而 demo 的草稿页只显示 `entity === 'Todo'` 的条目，别的实体的草稿在界面上看不见。
 * 每个 Playwright context 的 IndexedDB 互相隔离，所以遍历全部库不会读到别的用例的数据。
 */
export async function readWorkspaceDraftKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const keys: string[] = [];
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        if (!db.objectStoreNames.contains('workspace')) continue;
        const stored = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const request = db.transaction('workspace', 'readonly').objectStore('workspace').getAllKeys();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        keys.push(...stored.map(String));
      } finally {
        db.close();
      }
    }
    return keys;
  });
}

/**
 * 经草稿页的「创建草稿」做一次草稿刷盘，再读出 IndexedDB 里草稿仓库的全部键。
 *
 * @remarks
 * 「创建草稿」`new Todo()` 之后 `await workspace.flush()`：等它的提示出现时，排在它之前的草稿（包括本不该收的那些）
 * 都已经落盘，负断言因此不靠固定等待。新建的这条 Todo 草稿同时是正向对照——它一定在返回的键里。
 * 走侧栏链接做 SPA 导航，不整页刷新：刷新会重开数据库，等于换了一次启动。
 */
export async function flushDraftsAndReadKeys(page: Page): Promise<string[]> {
  await page.locator('a[href="/workspace"]').first().click();
  await page.getByPlaceholder('例如：整理需求清单').fill('刷盘对照草稿');
  await page.getByRole('button', { name: '创建草稿' }).click();
  await page.getByText('已创建未保存草稿：刷盘对照草稿').waitFor({ timeout: 15000 });
  return readWorkspaceDraftKeys(page);
}
