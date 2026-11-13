import { readLaunchpadEntries } from '../harness/apps.mjs';

const sorted = names => [...names].sort((a, b) => a.localeCompare(b));

/** 启动台里显示成 Finder、但不在 /Applications 的两项（Finder 本身与「关于本机」）。 */
const NOT_IN_APPLICATIONS = ['finder', 'about'];

/**
 * 应用目录（ADESK-US-205 阶段 A，D-17）：/Applications 是应用清单的投影，每个预装应用一个 `.app` 包；
 * 双击包、聚焦搜索、启动台与 Dock 都启动同一个应用；几猫3A大作与 Aiao Code 也是预装包。
 */
export const applications = {
  name: 'applications',
  description: '应用目录：Applications 与启动台一一对应、各入口启动同一个应用、几猫3A大作与 Aiao Code 的预装包',
  standins: ['aiao-code', 'game'],
  keys: [
    'applications.matchesLaunchpad',
    'applications.hasSaltlineAndAiaoCodePackages',
    'applications.finderPackageOpensApp',
    'applications.spotlightOpensSameApp',
    'applications.launchpadOpensSameApp',
    'applications.dockOpensSameApp',
    'applications.saltlinePackageLoadsGame',
    'applications.aiaoCodePackageShowsFailure',
    'applications.aiaoCodeOnlyRequestsRegisteredOrigin',
    'applications.aiaoCodePackageRetries',
    'applications.reloadKeepsOnePackagePerApp'
  ],
  async run(session) {
    const { page, aiaoCode } = session;
    const { win, closeAll, launch, spotlight, shows, appears } = session.helpers;
    await session.openDesktop();
    const result = {};

    /* 读启动台的全部条目，再读 Finder 里 Applications 的 .app 包：除去 Finder 与关于本机，两边一一对应。 */
    await closeAll();
    await page.locator('#dock .di[data-app="launchpad"]').click();
    await page.waitForFunction(() => document.activeElement?.matches('#lpad [data-lq]'));
    const entries = await readLaunchpadEntries(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#lpad'));

    await page.locator('#dock .di[data-app="finder"]').click();
    const finder = win('finder').last();
    await finder.locator('[data-place="Applications"]').click();
    await finder.locator('.fitem[data-name$=".app"]').first().waitFor();
    const packages = await finder.locator('.fitem').evaluateAll(nodes => nodes.map(node => node.dataset.name));
    const expected = entries.filter(entry => !NOT_IN_APPLICATIONS.includes(entry.id)).map(entry => `${entry.name}.app`);
    result.matchesLaunchpad = JSON.stringify(sorted(packages)) === JSON.stringify(sorted(expected));
    result.hasSaltlineAndAiaoCodePackages = packages.includes('几猫3A大作.app') && packages.includes('Aiao Code.app');

    /* 各入口启动同一个应用：Calculator 从 Finder 的包、聚焦搜索、启动台与 Dock 分别打开。 */
    const opensCalculator = async trigger => {
      await closeAll();
      await trigger();
      return (
        (await shows(win('calculator'))) &&
        (await page.locator('#menubar .mb-item.app').textContent())?.trim() === 'Calculator'
      );
    };
    result.finderPackageOpensApp = await opensCalculator(async () => {
      await page.locator('#dock .di[data-app="finder"]').click();
      const fresh = win('finder').last();
      await fresh.locator('[data-place="Applications"]').click();
      await fresh.locator('.fitem[data-name="Calculator.app"]').dblclick();
    });
    result.spotlightOpensSameApp = await opensCalculator(async () => {
      await spotlight('Calculator');
      await page.keyboard.press('Enter');
    });
    result.launchpadOpensSameApp = await opensCalculator(() => launch('Calculator'));
    result.dockOpensSameApp = await opensCalculator(() => page.locator('#dock .di[data-app="calculator"]').click());

    /* 几猫3A大作的包：双击后窗口加载同源 /saltline.html。 */
    await closeAll();
    await page.locator('#dock .di[data-app="finder"]').click();
    const apps = win('finder').last();
    await apps.locator('[data-place="Applications"]').click();
    await apps.locator('.fitem[data-name="几猫3A大作.app"]').dblclick();
    const gameFrame = win('saltline').locator('[data-saltline-frame]');
    result.saltlinePackageLoadsGame =
      (await appears(gameFrame)) && (await gameFrame.evaluate(frame => frame.src)).endsWith('/saltline.html');

    /* Aiao Code 的包按远程应用运行：网络不通时窗口显示失败原因并可重试；子框架只请求登记的入口。 */
    await closeAll();
    aiaoCode.mode = 'offline';
    const frameRequests = [];
    page.on('request', request => {
      if (request.frame() !== page.mainFrame()) frameRequests.push(request.url());
    });
    await page.locator('#dock .di[data-app="finder"]').click();
    const fresh = win('finder').last();
    await fresh.locator('[data-place="Applications"]').click();
    await fresh.locator('.fitem[data-name="Aiao Code.app"]').dblclick();
    const failed = win('vscode').locator('.webapp[data-webapp-state="failed"]');
    result.aiaoCodePackageShowsFailure =
      (await appears(failed, 15_000)) && (await win('vscode').locator('[data-webapp-retry]').isVisible());
    result.aiaoCodeOnlyRequestsRegisteredOrigin =
      frameRequests.length > 0 && frameRequests.every(url => url.startsWith('https://vscode.aiao.io/'));
    aiaoCode.mode = 'standard';
    await win('vscode').locator('[data-webapp-retry]').click();
    result.aiaoCodePackageRetries = await appears(win('vscode').locator('.webapp[data-webapp-state="ready"]'), 15_000);

    /* 刷新后每个应用仍只有一个包（对账幂等，不重复补写）。刷新会把开着的窗口恢复出来（ADESK-US-104），
     * 先全关掉，刷新后就是一个默认的 Finder，不会有恢复出来的 Aiao Code 窗口盖在它上面。 */
    await closeAll();
    await page.reload({ waitUntil: 'load' });
    await win('finder').waitFor();
    const again = win('finder').last();
    await again.locator('[data-place="Applications"]').click();
    await again.locator('.fitem[data-name$=".app"]').first().waitFor();
    const reloaded = await again.locator('.fitem').evaluateAll(nodes => nodes.map(node => node.dataset.name));
    result.reloadKeepsOnePackagePerApp = JSON.stringify(sorted(reloaded)) === JSON.stringify(sorted(packages));

    return { applications: result };
  }
};
