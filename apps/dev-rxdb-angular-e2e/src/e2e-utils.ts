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
