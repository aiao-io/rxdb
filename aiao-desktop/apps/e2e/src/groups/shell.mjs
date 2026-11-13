import { passes } from '../harness/helpers.mjs';

/** 桌面外壳（ADESK-US-101）：结构、菜单栏、窗口最小化与还原、启动台、聚焦搜索与通知中心。 */
export const shell = {
  name: 'shell',
  description: '桌面外壳：结构、Finder 导航、计算器、菜单栏、最小化与还原、启动台、聚焦搜索、通知中心、备忘录',
  keys: [
    'shell.stage',
    'shell.menubar',
    'shell.dock',
    'shell.noRuntimeGlobals',
    'shell.noInlineScripts',
    'shell.noDevtools',
    'finderNavigates',
    'calculatorWorks',
    'appleMenu',
    'appMenu',
    'minimized',
    'restored',
    'launchpadOpens',
    'launchpadCloses',
    'spotlightFinds',
    'notificationsOpen',
    'notificationsClose',
    'notesWorks'
  ],
  async run(session) {
    const { page } = session;
    const { win, closeAll, shows, appears, disappears, spotlight } = session.helpers;
    await session.openDesktop();

    const shellState = await page.evaluate(() => ({
      stage: Boolean(document.querySelector('#stage')),
      menubar: Boolean(document.querySelector('#menubar')),
      dock: document.querySelectorAll('#dock .di').length === 15,
      /* 运行时已全部变成 Angular 组件：不再有全局入口，也不再往页面注入脚本。 */
      noRuntimeGlobals: ['WM', 'APPS', 'Pop', 'SYS', 'Bus', '__aiaoRuntimeBridge', '__aiaoTerminalBridge'].every(
        name => !(name in window)
      ),
      noInlineScripts: [...document.scripts].every(script => script.src !== ''),
      noDevtools: !('__AIAO_RXDB_DEVTOOLS__' in window)
    }));

    /* Finder：双击文件夹进入，标题与路径栏跟着变。 */
    await win('finder').locator('.fitem[data-name="Documents"]').dblclick();
    await page.waitForTimeout(150);
    const finderNavigates = (await win('finder').locator('[data-title]').textContent())?.trim() === 'Documents';

    await closeAll();
    await page.locator('#dock .di[data-app="calculator"]').click();
    await win('calculator').waitFor();
    for (const key of ['ac', 'n1', 'n2', 'add', 'n3', 'eq'])
      await win('calculator').locator(`.ck[data-k="${key}"]`).click();
    await page.waitForTimeout(80);
    const calculatorWorks = (await win('calculator').locator('.calc-out').textContent())?.replace(/\s/g, '') === '15';

    /* 菜单栏：Apple 菜单与前台应用菜单。 */
    await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
    const appleMenu = await shows(page.locator('#layer-menu .pop .mi', { hasText: 'About This Mac' }));
    await page.keyboard.press('Escape');
    const appMenu = (await page.locator('#menubar .mb-item.app').textContent())?.trim() === 'Calculator';

    /* 最小化进 Dock，再从 Dock 还原（等动画结束的状态，不靠固定延时：慢引擎上动画更久）。 */
    await win('calculator').locator('.tl .m').click();
    const minimized = await passes(
      page.waitForFunction(
        () => document.querySelector('.win[data-app="calculator"]:not(.closing)')?.style.visibility === 'hidden',
        undefined,
        { timeout: 5_000 }
      )
    );
    await page.locator('#dock .di[data-app="calculator"]').click();
    const restored = await passes(
      page.waitForFunction(
        () => {
          const node = document.querySelector('.win[data-app="calculator"]:not(.closing)');
          return node instanceof HTMLElement && node.style.visibility === '' && !node.classList.contains('mini');
        },
        undefined,
        { timeout: 5_000 }
      )
    );

    await closeAll();
    await page.locator('#dock .di[data-app="launchpad"]').click();
    await page.waitForSelector('#lpad');
    const launchpadOpens = (await page.locator('#lpad').count()) === 1;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(650);
    const launchpadCloses = (await page.locator('#lpad').count()) === 0;

    await spotlight('calc');
    const spotlightFinds = await shows(page.locator('#spot .r.on', { hasText: 'Calculator' }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
    await page.waitForTimeout(500);
    const notificationsOpen = await shows(page.locator('#nc .wgt').first());
    await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
    const notificationsClose = await disappears(page.locator('#nc'), 5_000);

    await closeAll();
    await page.locator('#dock .di[data-app="notes"]').click();
    await win('notes').waitFor();
    /* 应用按需加载：窗口外框先出现，组件随后才渲染出来，等输入框出现而不是数一次。 */
    const notesWorks = await appears(win('notes').locator('input').first(), 10_000);

    return {
      shell: shellState,
      finderNavigates,
      calculatorWorks,
      appleMenu,
      appMenu,
      minimized,
      restored,
      launchpadOpens,
      launchpadCloses,
      spotlightFinds,
      notificationsOpen,
      notificationsClose,
      notesWorks
    };
  }
};
