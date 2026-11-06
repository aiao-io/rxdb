import { expect, test } from '@playwright/test';
import {
  createCategory,
  expectStoredPreferences,
  openPreferences,
  PREFERENCES_STORAGE_KEY,
  resetE2eState,
  storedPreferenceValues
} from './e2e-utils.js';

/**
 * 后台外壳（@aiao/rxdb-admin）在 dev-rxdb-admin 里的验收：
 * 偏好抽屉（外观 / 布局 / 快捷键 / 通用 / 拓展）、页签栏、命令面板、锁屏、多语言。
 * 每个用例一个全新 context，偏好与页签都从默认值起步。
 */
test.describe('后台外壳：偏好抽屉', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('齿轮打开抽屉，五个页签；Esc 关闭', async ({ page }) => {
    await page.goto('/search');
    const drawer = await openPreferences(page);
    await expect(drawer.getByRole('tab')).toHaveText(['外观', '布局', '快捷键', '通用', '拓展']);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('快捷键 Mod+, 打开抽屉', async ({ page }) => {
    await page.goto('/search');
    await page.keyboard.press('ControlOrMeta+,');
    await expect(page.getByTestId('admin-preferences')).toBeVisible();
  });

  test('主题：点击卡片立即生效、刷新保留，重置恢复默认', async ({ page }) => {
    await page.goto('/search');
    const root = page.locator('html');
    const drawer = await openPreferences(page);
    await drawer.getByTestId('pref-theme-dracula').click();
    await expect(root).toHaveAttribute('data-theme', 'dracula');
    await expect(root).toHaveCSS('color-scheme', 'dark');
    await expectStoredPreferences(page, { theme: { name: 'dracula' } });

    await page.reload();
    await expect(root).toHaveAttribute('data-theme', 'dracula');

    const reopened = await openPreferences(page);
    await reopened.getByTestId('pref-reset').click();
    await expect(root).not.toHaveAttribute('data-theme', 'dracula');
    await expectStoredPreferences(page, null);
  });

  test('顶栏主题按钮在 系统 / 亮 / 暗 / 各主题 间循环', async ({ page }) => {
    await page.goto('/search');
    const root = page.locator('html');
    const toggle = page.getByTestId('admin-widget-theme');
    await toggle.click();
    const first = (await root.getAttribute('data-theme')) ?? '';
    await toggle.click();
    await expect(root).not.toHaveAttribute('data-theme', first);
    await expectStoredPreferences(page, { theme: { name: expect.any(String) } });
  });

  test('顶栏全屏按钮进入全屏，外部退出后状态同步回来', async ({ page }) => {
    await page.goto('/search');
    const toggle = page.getByTestId('admin-widget-fullscreen');
    await expect(toggle).toHaveAttribute('aria-label', '全屏');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('aria-label', '退出全屏');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    // 模拟 Esc 之类的浏览器外部退出：按钮状态须经 fullscreenchange 同步回来
    await page.evaluate(() => document.exitFullscreen());
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-label', '全屏');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  });

  test('布局：切到顶栏导航后侧栏消失、顶栏出现水平菜单，刷新保留', async ({ page }) => {
    await page.goto('/search');
    const drawer = await openPreferences(page);
    await drawer.getByTestId('pref-tab-layout').click();
    await drawer.getByTestId('pref-app.layout-header-nav').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('admin-sidebar')).toHaveCount(0);

    const headerMenu = page.getByTestId('admin-header-menu');
    await expect(headerMenu).toBeVisible();
    await headerMenu.getByRole('button', { name: /实体/ }).hover();
    await headerMenu.getByRole('link', { name: '资产分类' }).click();
    await page.waitForURL('**/entities/assets/AssetCategory');

    await page.reload();
    await expect(page.getByTestId('admin-sidebar')).toHaveCount(0);
    await expect(page.getByTestId('admin-header-menu')).toBeVisible();
  });

  test('布局：全屏内容模式没有侧栏与页脚，顶栏保留以便再次打开设置', async ({ page }) => {
    await page.goto('/search');
    const drawer = await openPreferences(page);
    await drawer.getByTestId('pref-tab-layout').click();
    await drawer.getByTestId('pref-footer.enable').check();
    await expect(page.getByTestId('admin-footer')).toBeVisible();
    await drawer.getByTestId('pref-app.layout-full-content').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('admin-sidebar')).toHaveCount(0);
    await expect(page.getByTestId('admin-footer')).toHaveCount(0);
    await expect(page.getByTestId('admin-header')).toBeVisible();
    await expect(page.getByTestId('search-input')).toBeVisible();
    await openPreferences(page);
  });

  test('侧栏折叠为图标轨，悬停临时展开，刷新后保留', async ({ page }) => {
    await page.goto('/search');
    const sidebar = page.getByTestId('admin-sidebar');
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    const expanded = (await sidebar.boundingBox())?.width ?? 0;
    expect(expanded).toBeGreaterThan(200);

    await page.getByTestId('admin-sidebar-toggle').click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await expect.poll(async () => (await sidebar.boundingBox())?.width ?? expanded).toBeLessThan(80);

    await sidebar.hover();
    await expect(sidebar).toHaveAttribute('data-hover-expanded', 'true');
    await page.mouse.move(800, 400);
    await expect(sidebar).toHaveAttribute('data-hover-expanded', 'false');

    await page.reload();
    await expect(page.getByTestId('admin-sidebar')).toHaveAttribute('data-collapsed', 'true');
  });

  test('通用：开启水印后出现水印层，开启页脚后出现页脚', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByTestId('admin-footer')).toHaveCount(0);
    const drawer = await openPreferences(page);
    await drawer.getByTestId('pref-tab-general').click();
    await drawer.getByTestId('pref-app.watermark').check();
    await drawer.getByTestId('pref-app.watermarkContent').fill('内部资料');
    await expect(page.getByTestId('admin-watermark')).toHaveCSS('background-image', /url\("data:image/);

    await drawer.getByTestId('pref-tab-layout').click();
    await drawer.getByTestId('pref-footer.enable').check();
    await expect(page.getByTestId('admin-footer')).toBeVisible();
    await expectStoredPreferences(page, {
      app: { watermark: true, watermarkContent: '内部资料' },
      footer: { enable: true }
    });
  });

  test('导入偏好：粘贴 JSON 应用；非法内容给出错误且不改动', async ({ page }) => {
    await page.goto('/search');
    const root = page.locator('html');
    const drawer = await openPreferences(page);
    await drawer.getByTestId('pref-import').click();
    const text = drawer.getByTestId('pref-import-text');
    await text.fill('not json');
    await drawer.getByTestId('pref-import-apply').click();
    await expect(drawer.getByRole('alert')).toBeVisible();
    await text.fill('[1, 2]');
    await drawer.getByTestId('pref-import-apply').click();
    await expect(drawer.getByRole('alert')).toBeVisible();
    await expect(root).not.toHaveAttribute('data-theme', 'night');

    await text.fill(JSON.stringify({ theme: { name: 'night' } }));
    await drawer.getByTestId('pref-import-apply').click();
    await expect(root).toHaveAttribute('data-theme', 'night');
    await expect(drawer.getByTestId('pref-import-panel')).toHaveCount(0);
  });

  test('拓展：应用注册的「搜索每页条数」出现在拓展页签，并驱动搜索页分页', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    for (let i = 1; i <= 6; i++) {
      await createCategory(page, `扩展分页 ${i}`);
    }
    const drawer = await openPreferences(page);
    await drawer.getByTestId('pref-tab-extension').click();
    const size = drawer.getByTestId('pref-extension.searchPageSize');
    await expect(size).toHaveValue('20');
    await size.fill('5');
    await size.press('Enter');
    await expectStoredPreferences(page, { extension: { searchPageSize: 5 } });
    await page.keyboard.press('Escape');

    await page.getByTestId('search-nav-link').click();
    await page.getByTestId('search-input').fill('扩展分页');
    const results = page.getByTestId('search-result');
    await expect(results).toHaveCount(5);
    await page.getByRole('button', { name: '加载更多', exact: true }).click();
    await expect(results).toHaveCount(6);
  });
});

test.describe('后台外壳：侧栏宽度', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('拖拽手柄与键盘调整宽度，限制在 160–320，刷新后保留', async ({ page }) => {
    await page.goto('/search');
    const resizer = page.getByTestId('admin-sidebar-resizer');
    await expect(resizer).toHaveAttribute('aria-valuenow', '240');

    const box = await resizer.boundingBox();
    expect(box).not.toBeNull();
    const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const y = (box?.y ?? 0) + 200;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 150, y, { steps: 8 });
    await page.mouse.up();
    await expect(resizer).toHaveAttribute('aria-valuenow', '320');
    await expectStoredPreferences(page, { sidebar: { width: 320 } });

    await resizer.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(resizer).toHaveAttribute('aria-valuenow', '288');
    await expect(page.locator('html')).toHaveCSS('--admin-sidebar-width', '288px');

    await page.reload();
    await expect(page.getByTestId('admin-sidebar-resizer')).toHaveAttribute('aria-valuenow', '288');
  });

  test('拖动中侧栏紧跟指针：宽度过渡关闭、偏好不写入，松手后才提交并恢复过渡', async ({ page }) => {
    await page.goto('/search');
    const resizer = page.getByTestId('admin-sidebar-resizer');
    const slot = page.locator('.admin-sidebar-slot');
    await expect(resizer).toHaveAttribute('aria-valuenow', '240');
    await expect(slot).not.toHaveCSS('transition-property', 'none');

    const box = await resizer.boundingBox();
    expect(box).not.toBeNull();
    const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const y = (box?.y ?? 0) + 200;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 4 });

    // 过渡不关，宽度会被 240ms 的动画拖在指针后面；偏好每次移动都写，整个外壳会随之重渲染
    await expect(slot).toHaveCSS('transition-property', 'none');
    await expect(resizer).toHaveAttribute('aria-valuenow', '280');
    await expect.poll(async () => (await slot.boundingBox())?.width).toBe(280);
    // 超过偏好落盘的防抖（150ms）之后，拖动中仍然什么都没写
    // eslint-disable-next-line playwright/no-wait-for-timeout -- 断言的是「一段时间内无事发生」
    await page.waitForTimeout(400);
    expect(await storedPreferenceValues(page)).toBeNull();

    await page.mouse.up();
    await expectStoredPreferences(page, { sidebar: { width: 280 } });
    await expect(slot).not.toHaveCSS('transition-property', 'none');
    await expect.poll(async () => (await slot.boundingBox())?.width).toBe(280);
    await expect(page.locator('html')).toHaveCSS('--admin-sidebar-width', '280px');
  });

  test('菜单撑满侧栏：默认宽度与拖宽之后，菜单宽度都等于侧栏主体扣掉内边距后的可用宽度', async ({ page }) => {
    await page.goto('/search');
    const menu = page.getByTestId('admin-menu');
    // daisyUI 的 .menu 默认 fit-content；admin.css 的 width: 100% 层序更靠前，会输给它，菜单就停在文字宽度、右侧留白
    const shortfall = (): Promise<number> =>
      menu.evaluate(element => {
        const body = element.closest('.admin-sidebar-body') as HTMLElement;
        const style = getComputedStyle(body);
        const available = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return available - element.getBoundingClientRect().width;
      });
    await expect.poll(shortfall).toBeCloseTo(0, 0);

    const resizer = page.getByTestId('admin-sidebar-resizer');
    await resizer.focus();
    for (let step = 0; step < 5; step += 1) await page.keyboard.press('ArrowRight');
    await expect(resizer).toHaveAttribute('aria-valuenow', '320');
    await expect.poll(shortfall).toBeCloseTo(0, 0);
    await expect.poll(async () => (await menu.boundingBox())?.width).toBeGreaterThan(280);
  });

  test('plain 菜单样式：菜单项没有圆角', async ({ page }) => {
    await page.addInitScript(key => {
      window.localStorage.setItem(key, JSON.stringify({ version: 1, values: { navigation: { styleType: 'plain' } } }));
    }, PREFERENCES_STORAGE_KEY);
    await page.goto('/search');
    const menu = page.getByTestId('admin-menu');
    await expect(menu).toHaveAttribute('data-style', 'plain');
    await expect(menu.getByRole('link', { name: '搜索' })).toHaveCSS('border-radius', '0px');
  });

  test('折叠为图标轨：每个图标在轨道里水平居中，菜单项不被侧栏裁掉', async ({ page }) => {
    await page.goto('/search');
    const sidebar = page.getByTestId('admin-sidebar');
    await page.getByTestId('admin-sidebar-toggle').click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await page.mouse.move(800, 400);
    await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 999).toBeLessThan(80);

    const geometry = () =>
      page.getByTestId('admin-menu').evaluate(menu => {
        const body = menu.closest('.admin-sidebar-body') as HTMLElement;
        const bodyBox = body.getBoundingClientRect();
        const center = bodyBox.left + body.clientWidth / 2;
        return {
          iconOffsets: [...menu.querySelectorAll('.admin-menu-icon')].map(icon => {
            const box = icon.getBoundingClientRect();
            return Math.abs(box.left + box.width / 2 - center);
          }),
          // 菜单项左右两侧离侧栏主体边缘的距离，负数表示伸出去被裁掉了
          margins: [...menu.querySelectorAll('li > a')].map(link => {
            const box = link.getBoundingClientRect();
            return Math.min(box.left - bodyBox.left, bodyBox.left + body.clientWidth - box.right);
          })
        };
      });
    // daisyUI 给菜单项 12px 的横向内边距、.menu 又是 fit-content，覆盖失效时图标整体偏右、选中项的高亮被裁掉
    await expect.poll(async () => Math.max(...(await geometry()).iconOffsets)).toBeLessThan(1);
    await expect.poll(async () => Math.min(...(await geometry()).margins)).toBeGreaterThanOrEqual(0);
  });

  test('折叠为图标轨并显示标题：图标在上、标题在下，都不伸出菜单项', async ({ page }) => {
    await page.addInitScript(key => {
      const values = { sidebar: { collapsed: true, collapsedShowTitle: true } };
      window.localStorage.setItem(key, JSON.stringify({ version: 1, values }));
    }, PREFERENCES_STORAGE_KEY);
    await page.goto('/search');
    await page.mouse.move(800, 400);
    await expect(page.getByTestId('admin-sidebar')).toHaveAttribute('data-show-title', 'true');

    // 菜单项是 grid（daisyUI），按 flex 写的 flex-direction: column 不生效，图标和标题会并排挤在一行里
    const rows = () =>
      page.getByTestId('admin-menu').evaluate(menu =>
        [...menu.querySelectorAll('li > a')].map(link => {
          const box = link.getBoundingClientRect();
          const icon = (link.querySelector('.admin-menu-icon') as Element).getBoundingClientRect();
          const label = (link.querySelector('.admin-menu-label') as Element).getBoundingClientRect();
          return {
            stacked: label.top >= icon.bottom - 0.5,
            contained: label.left >= box.left - 0.5 && label.right <= box.right + 0.5
          };
        })
      );
    await expect.poll(async () => (await rows()).length).toBeGreaterThan(0);
    await expect.poll(async () => (await rows()).every(row => row.stacked && row.contained)).toBe(true);
  });
});

test.describe('后台外壳：页签栏', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('访问页面生成页签；点击切换、关闭按钮、右键菜单关闭其他', async ({ page }) => {
    await page.goto('/search');
    const tabs = page.getByTestId('admin-tab');
    await expect(tabs).toHaveText(['搜索']);

    const menu = page.getByTestId('admin-menu');
    await menu.getByRole('link', { name: '资产分类' }).click();
    await page.waitForURL('**/entities/assets/AssetCategory');
    await menu.getByRole('link', { name: '备份 / 恢复' }).click();
    await page.waitForURL('**/backup');
    await expect(tabs).toHaveText(['搜索', '资产分类', '备份 / 恢复']);
    await expect(tabs.nth(2).getByRole('link')).toHaveAttribute('aria-current', 'page');

    await tabs.first().getByRole('link').click();
    await page.waitForURL('**/search');
    await expect(tabs.first().getByRole('link')).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: '移除页签：资产分类' }).click();
    await expect(tabs).toHaveText(['搜索', '备份 / 恢复']);

    await tabs.first().click({ button: 'right' });
    await page.getByTestId('admin-tab-menu-closeOthers').click();
    await expect(tabs).toHaveText(['搜索']);
  });

  test('同一会话刷新后页签保留', async ({ page }) => {
    await page.goto('/search');
    await page.getByTestId('admin-menu').getByRole('link', { name: '备份 / 恢复' }).click();
    const tabs = page.getByTestId('admin-tab');
    await expect(tabs).toHaveText(['搜索', '备份 / 恢复']);
    await page.reload();
    await expect(tabs).toHaveText(['搜索', '备份 / 恢复']);
  });

  test('固定页签没有关闭按钮，且不被「关闭其他」带走', async ({ page }) => {
    await page.goto('/search');
    await page.getByTestId('admin-menu').getByRole('link', { name: '备份 / 恢复' }).click();
    const tabs = page.getByTestId('admin-tab');
    await expect(tabs).toHaveCount(2);

    const search = tabs.filter({ hasText: '搜索' });
    await search.click({ button: 'right' });
    await page.getByTestId('admin-tab-menu-pin').click();
    await expect(search).toHaveAttribute('data-pinned', 'true');
    await expect(search.getByTestId('admin-tab-close')).toHaveCount(0);

    const backup = tabs.filter({ hasText: '备份 / 恢复' });
    await backup.click({ button: 'right' });
    await page.getByTestId('admin-tab-menu-closeAll').click();
    await expect(tabs).toHaveText(['搜索']);
  });

  test('右键菜单「刷新」重新挂载当前页内容', async ({ page }) => {
    await page.goto('/search');
    const input = page.getByTestId('search-input');
    await input.fill('临时输入');
    await page.getByTestId('admin-tab').first().click({ button: 'right' });
    await page.getByTestId('admin-tab-menu-reload').click();
    await expect(input).toHaveValue('');
  });
});

test.describe('后台外壳：命令面板', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('Mod+K 打开，按页面名搜索，回车跳转并关闭', async ({ page }) => {
    await page.goto('/search');
    await page.keyboard.press('ControlOrMeta+K');
    const palette = page.getByTestId('admin-palette');
    await expect(palette).toBeVisible();
    await page.getByTestId('admin-palette-input').fill('备份');
    await expect(page.getByTestId('admin-palette-option').first()).toContainText('备份 / 恢复');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/backup');
    await expect(palette).toBeHidden();
  });

  test('搜索按钮打开；方向键移动选中项；Esc 关闭', async ({ page }) => {
    await page.goto('/search');
    await page.getByTestId('admin-widget-search').click();
    const options = page.getByTestId('admin-palette-option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('admin-palette')).toBeHidden();
  });

  test('数据记录来源：全文命中的记录进入「数据记录」分组，回车跳到所属实体列表', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '面板检索样本');
    await page.getByTestId('backup-nav-link').click();
    await page.waitForURL('**/backup');

    await page.getByTestId('admin-widget-search').click();
    await page.getByTestId('admin-palette-input').fill('面板检索样本');
    const records = page.getByRole('group', { name: '数据记录' });
    await expect(records.getByTestId('admin-palette-option')).toContainText('面板检索样本');
    await expect(records.getByTestId('admin-palette-option')).toContainText('资产分类');
    await records.getByTestId('admin-palette-option').click();
    await page.waitForURL('**/entities/assets/AssetCategory');
  });
});

test.describe('后台外壳：快捷键', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('关闭总开关后 Mod+K 失效，搜索按钮仍可打开面板', async ({ page }) => {
    await page.goto('/search');
    const drawer = await openPreferences(page);
    await drawer.getByTestId('pref-tab-shortcuts').click();
    await drawer.getByTestId('pref-shortcuts.enable').uncheck();
    await page.keyboard.press('Escape');

    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.getByTestId('admin-palette')).toBeHidden();
    await page.getByTestId('admin-widget-search').click();
    await expect(page.getByTestId('admin-palette')).toBeVisible();
    await expectStoredPreferences(page, { shortcuts: { enable: false } });
  });

  test('单独停用「打开命令面板」后只有它失效', async ({ page }) => {
    await page.goto('/search');
    const drawer = await openPreferences(page);
    await drawer.getByTestId('pref-tab-shortcuts').click();
    await drawer.getByTestId('pref-shortcut-palette').uncheck();
    await page.keyboard.press('Escape');

    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.getByTestId('admin-palette')).toBeHidden();
    await page.keyboard.press('ControlOrMeta+,');
    await expect(page.getByTestId('admin-preferences')).toBeVisible();
  });

  test('Mod+B 折叠 / 展开侧栏', async ({ page }) => {
    await page.goto('/search');
    const sidebar = page.getByTestId('admin-sidebar');
    await page.keyboard.press('ControlOrMeta+B');
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await page.keyboard.press('ControlOrMeta+B');
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
  });
});

test.describe('后台外壳：锁屏', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('首次要求设置密码；再次锁定后错误密码被拒、正确密码解锁；刷新与 Esc 都不能绕过', async ({ page }) => {
    await page.goto('/search');
    const lock = page.getByTestId('admin-lock');
    const input = page.getByTestId('admin-lock-input');
    const submit = page.getByTestId('admin-lock-submit');

    await page.keyboard.press('Alt+L');
    await expect(lock).toBeVisible();
    await expect(lock).toContainText('首次使用，请先设置锁屏密码');
    await input.fill('s3cret-pass');
    await submit.click();
    await expect(lock).toBeHidden();

    await page.getByTestId('admin-widget-lock').click();
    await expect(lock).toBeVisible();
    await expect(lock).toContainText('输入密码解锁');
    await page.keyboard.press('Escape');
    await expect(lock).toBeVisible();
    await input.fill('wrong');
    await submit.click();
    await expect(page.getByTestId('admin-lock-error')).toHaveText('密码不正确');

    await page.reload();
    await expect(lock).toBeVisible();
    await input.fill('s3cret-pass');
    await submit.click();
    await expect(lock).toBeHidden();
  });

  test('忘记密码：确认重置后解锁，下次锁屏重新要求设置密码', async ({ page }) => {
    await page.goto('/search');
    const lock = page.getByTestId('admin-lock');
    await page.getByTestId('admin-widget-lock').click();
    await page.getByTestId('admin-lock-input').fill('first-pass');
    await page.getByTestId('admin-lock-submit').click();
    await expect(lock).toBeHidden();

    await page.getByTestId('admin-widget-lock').click();
    await page.getByTestId('admin-lock-forgot').click();
    await page.getByTestId('admin-lock-reset-apply').click();
    await expect(lock).toBeHidden();

    await page.getByTestId('admin-widget-lock').click();
    await expect(lock).toContainText('首次使用，请先设置锁屏密码');
  });
});

test.describe('后台外壳：多语言', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('切换到 English 后外壳文案随之切换，刷新保留', async ({ page }) => {
    await page.goto('/search');
    await page.getByTestId('admin-widget-language').click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const drawer = await openPreferences(page);
    await expect(drawer.getByRole('heading', { name: 'Preferences' })).toBeVisible();
    await expect(drawer.getByRole('tab')).toHaveText(['Appearance', 'Layout', 'Shortcuts', 'General', 'Extensions']);
    await page.keyboard.press('Escape');

    await page.reload();
    await page.getByTestId('admin-widget-preferences').click();
    await expect(page.getByTestId('admin-preferences').getByRole('heading', { name: 'Preferences' })).toBeVisible();
  });
});
