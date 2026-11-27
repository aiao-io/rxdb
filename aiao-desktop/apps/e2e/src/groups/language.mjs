import { expect as playwrightExpect } from 'playwright/test';

import { traced } from '../harness/host-calls.mjs';
import { VIEWPORT } from '../harness/session.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });

/** 语言与地区分区：语言列表 + 当前语言标记；返回分区窗口的定位器。 */
const openLanguageRegion = async (win, expect) => {
  await win.locator('[data-sec]').filter({ hasText: 'Language & Region' }).click();
  await expect(win.locator('[data-sttitle]')).toHaveText('Language & Region');
};

/** Launchpad 里搜应用名打开（zh 上下文的 helpers 不能复用，这里按 helpers.launch 同路径复刻）。 */
const launchFromLaunchpad = async (page, name) => {
  await page.locator('#dock .di[data-app="launchpad"]').click();
  await page.waitForFunction(() => document.activeElement?.matches('#lpad:not(.out) [data-lq]'));
  await page.locator('#lpad [data-lq]').fill(name);
  await page.locator('#lpad [data-lq]').press('Enter');
};

/**
 * 界面语言（ADESK-US-132）：默认英文、语言与地区即时切换、中文分区搜索、刷新保持、
 * 第二标签页跟随，以及 zh-CN 设备首启中文（独立上下文、全新库）。
 */
export const language = {
  name: 'language',
  description: '界面语言：默认英文、切换即时生效、刷新保持、跨标签页跟随、zh 设备首启中文',
  keys: [
    'language.englishDefault',
    'language.switchToChinese',
    'language.shellLocalized',
    'language.appNamesLocalized',
    'language.zhSearchBySection',
    'language.reloadKeepsChinese',
    'language.secondTabFollows',
    'language.zhDeviceFirstBoot'
  ],
  async run(session) {
    const { helpers, page } = session;
    const result = traced('language');

    await session.openDesktop();
    await helpers.closeAll();
    await helpers.launch('Settings');
    const win = helpers.win('settings');
    await expect(win).toBeVisible();
    await expect(win).not.toHaveClass(/opening/);

    /* 默认英文：分区名与标题为英文原文案；语言列表两项、英文标记首选。 */
    await openLanguageRegion(win, expect);
    const langRows = win.locator('[data-language-region] [data-lang]');
    await expect(langRows).toHaveCount(2);
    await expect(win.locator('[data-lang="en"] [data-primary]')).toBeVisible();
    result.englishDefault = true;

    /* 切中文：设置界面即时变中文，html lang 跟随，简体中文标记首选。 */
    await win.locator('[data-lang="zh-Hans"]').click();
    await expect(win.locator('[data-sttitle]')).toHaveText('语言与地区');
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('zh-Hans');
    await expect(win.locator('[data-lang="zh-Hans"] [data-primary]')).toBeVisible();
    result.switchToChinese = true;

    /* 外壳走目录（AC8/9）：Apple 菜单与锁屏在 zh 下为中文。 */
    await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
    await expect(page.locator('#layer-menu .pop .mi', { hasText: '关于本机' })).toBeVisible();
    const lockItem = page.locator('#layer-menu .pop .mi', { hasText: '锁定屏幕' });
    await expect(lockItem).toBeVisible();
    await lockItem.click();
    await expect(page.locator('#lock')).toContainText('输入密码');
    await page.locator('#lock').click();
    result.shellLocalized = true;

    /* 应用显示名走目录（AC12）：启动台 zh 下显示中文应用名（网格分页，用搜索定位），聚焦搜索按中文名命中。 */
    await page.locator('#dock .di[data-app="launchpad"]').click();
    const lpad = page.locator('#lpad');
    await expect(lpad.locator('[data-app="finder"] .nm')).toHaveText('访达');
    await lpad.locator('[data-lq]').fill('系统设置');
    await expect(lpad.locator('[data-app="settings"] .nm')).toHaveText('系统设置');
    await page.keyboard.press('Escape');
    await expect(lpad).toHaveClass(/out/);
    await helpers.spotlight('访达');
    await expect(page.locator('#spot')).toContainText('访达');
    await page.keyboard.press('Escape');
    result.appNamesLocalized = true;

    /* 中文分区搜索：搜「网络」命中 Network 分区，空态文案也是中文。 */
    const search = win.getByRole('textbox', { name: '搜索设置', exact: true });
    await search.fill('网络');
    await expect(win.locator('[data-sec]')).toHaveCount(1);
    await expect(win.locator('[data-sec]').first()).toContainText('网络');
    await search.fill('missing');
    await expect(win.locator('[data-settings-empty]')).toHaveText('没有匹配的设置');
    await search.fill('');
    result.zhSearchBySection = true;

    /* 刷新保持中文（devicePreferredLocale 落库）。 */
    await session.reloadDesktop();
    await helpers.launch('Settings');
    const reloadedWin = helpers.win('settings');
    await expect(reloadedWin).toBeVisible();
    await expect(reloadedWin.locator('[data-sec]').filter({ hasText: '语言与地区' })).toHaveCount(1);
    result.reloadKeepsChinese = true;

    /* 第二标签页跟随（同一上下文、同一库，经 RxDBTabsGateway 同步）。 */
    const second = await session.openDesktopPage();
    await second.helpers.closeAll();
    await second.helpers.launch('Settings');
    const secondWin = second.helpers.win('settings');
    await expect(secondWin).toBeVisible();
    await expect(secondWin.locator('[data-sec]').filter({ hasText: '语言与地区' })).toHaveCount(1);
    await second.page.close();
    result.secondTabFollows = true;

    /* zh-CN 设备首启中文：独立上下文（全新库、navigator.language=zh-CN），页面错误同样收集。 */
    const zhContext = await session.browser.newContext({
      viewport: VIEWPORT,
      locale: 'zh-CN',
      serviceWorkers: 'block'
    });
    try {
      await zhContext.route(
        url => url.origin !== session.origin,
        route => route.abort()
      );
      const zhPage = session.observePage(await zhContext.newPage());
      await zhPage.goto(`${session.origin}/?boot=0`, { waitUntil: 'load' });
      await zhPage.locator('.win[data-app="finder"]').waitFor();
      await launchFromLaunchpad(zhPage, 'Settings');
      const zhWin = zhPage.locator('.win[data-app="settings"]');
      await zhWin.waitFor();
      await expect(zhWin.locator('[data-sec]').filter({ hasText: '语言与地区' })).toHaveCount(1);
      await zhWin.locator('[data-sec]').filter({ hasText: '语言与地区' }).click();
      await expect(zhWin.locator('[data-sttitle]')).toHaveText('语言与地区');
      await expect(zhWin.locator('[data-language-region] [data-lang="zh-Hans"] [data-primary]')).toBeVisible();
      result.zhDeviceFirstBoot = true;
    } finally {
      await zhContext.close();
    }

    await helpers.closeAll();
    return { language: result };
  }
};
