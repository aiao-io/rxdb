/** 升级与持久化验收里用户自己造的数据：Finder 新建的文件夹、一条备忘录、深色外观。 */
export const NOTE_BODY = 'upgrade-note-body';

/**
 * 在桌面里写下用户数据，并等它落库（备忘录停手后写回、设置停手 0.4 秒后写回）。
 *
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof import('./helpers.mjs').createHelpers>} helpers
 */
export async function writeUserData(page, helpers) {
  const { win, closeAll, spotlight, appears, desktopIcon } = helpers;
  await closeAll();
  await page.locator('#dock .di[data-app="finder"]').click();
  await win('finder').last().locator('[data-place="Desktop"]').click();
  await win('finder').last().locator('[data-more]').click();
  await page.locator('#layer-menu .pop .mi', { hasText: 'New Folder' }).click();
  await appears(desktopIcon('untitled folder'));
  await closeAll();
  await page.locator('#dock .di[data-app="notes"]').click();
  await win('notes').waitFor();
  await win('notes').locator('[data-new]').click();
  await page.waitForTimeout(300);
  await win('notes').locator('[data-doc]').click();
  await page.keyboard.press('End');
  await page.keyboard.type(` ${NOTE_BODY}`);
  await page.waitForTimeout(1_000);
  await closeAll();
  await spotlight('dark mode');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', undefined, { timeout: 3_000 });
  await page.waitForTimeout(1_000);
}

/**
 * 读回 {@link writeUserData} 写下的数据：三项都还在才算数据完整。
 *
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof import('./helpers.mjs').createHelpers>} helpers
 */
export async function readUserData(page, helpers) {
  const { closeAll, appears, desktopIcon, windowShowsText } = helpers;
  const folder = await appears(desktopIcon('untitled folder'));
  const dark = await page
    .waitForFunction(() => document.documentElement.dataset.theme === 'dark', undefined, { timeout: 10_000 })
    .then(
      () => true,
      () => false
    );
  await closeAll();
  await page.locator('#dock .di[data-app="notes"]').click();
  const note = await windowShowsText('notes', '[data-items]', NOTE_BODY);
  await closeAll();
  return { folder, dark, note };
}

/** {@link readUserData} 的三项都为 true。 */
export const userDataIntact = data => data.folder && data.dark && data.note;
