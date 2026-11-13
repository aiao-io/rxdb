import { prepareOfflineFailure, standinProbe } from '../harness/standin.mjs';

/** 集成应用（ADESK-US-201、ADESK-US-202）：替身应用顶替 vscode.aiao.io，外网照样全部拦截。 */
export const integratedApp = {
  name: 'integrated-app',
  description: '集成应用：Orbit 握手、加载与失败、最小化与还原、后台激活层、缩放、关闭重开、入口一致',
  standins: ['aiao-code'],
  keys: [
    'integratedApp.dockPinned',
    'integratedApp.showsLoading',
    'integratedApp.becomesReady',
    'integratedApp.standardKeepsChrome',
    'integratedApp.standinRendered',
    'integratedApp.crossOriginIsolated',
    'integratedApp.iframePolicy',
    'integratedApp.minimizeHides',
    'integratedApp.restoreShows',
    'integratedApp.restoreKeepsDocument',
    'integratedApp.shieldWhenBehind',
    'integratedApp.clickActivates',
    'integratedApp.keyboardReachesApp',
    'integratedApp.appClickClosesMenu',
    'integratedApp.resizeTracksPointer',
    'integratedApp.closeRemovesFrame',
    'integratedApp.reopensFresh',
    'integratedApp.offlineShowsReason',
    'integratedApp.desktopUnaffected',
    'integratedApp.retryRecovers',
    'integratedApp.appFailureShowsReason',
    'integratedApp.launchpadOpens',
    'integratedApp.spotlightLists',
    'integratedApp.menubarName',
    'integratedApp.appMenuItems',
    'integratedApp.quitCloses'
  ],
  async run(session) {
    const { page, aiaoCode: standinControl } = session;
    const { win, closeAll, launch, spotlight, shows, appears, disappears } = session.helpers;
    const { frame: standinFrame, state: standin } = standinProbe(page);
    await session.openDesktop();

    await closeAll();
    const vscodeWin = win('vscode');
    const webappIn = state => vscodeWin.locator(`.webapp[data-webapp-state="${state}"]`);
    const integratedApp = {
      dockPinned: await page.evaluate(() => {
        const apps = [...document.querySelectorAll('#dock .di')].map(node => node.getAttribute('data-app'));
        return apps.indexOf('vscode') === apps.indexOf('terminal') + 1;
      })
    };

    await page.locator('#dock .di[data-app="vscode"]').click();
    integratedApp.showsLoading = await shows(webappIn('loading'));
    integratedApp.becomesReady = await appears(webappIn('ready'), 15_000);
    /* 应用没有隐藏装饰（标准窗口、不支持透明窗口的旧版本）：就绪后仍是桌面的标题栏。 */
    integratedApp.standardKeepsChrome = await shows(vscodeWin.locator('.tb .tl'));
    const opened = await standin();
    integratedApp.standinRendered = typeof opened.id === 'string';
    integratedApp.crossOriginIsolated = opened.isolated === true;
    integratedApp.iframePolicy = await vscodeWin.evaluate(node => {
      const frame = node.querySelector('aiao-orbit')?.shadowRoot?.querySelector('iframe');
      return (
        frame?.getAttribute('sandbox') === 'allow-scripts allow-same-origin allow-forms allow-downloads' &&
        frame.getAttribute('allow') === 'cross-origin-isolated; clipboard-read; clipboard-write'
      );
    });

    /* 最小化与还原：应用收到隐藏与显示，iframe 不重载，输入还在。 */
    await (await standinFrame()).locator('[data-standin-input]').fill('typed-before-minimize');
    await vscodeWin.locator('.tl .m').click();
    await page.waitForTimeout(700);
    integratedApp.minimizeHides = (await standin()).visibility === 'false';
    await page.locator('#dock .di[data-app="vscode"]').click();
    await page.waitForTimeout(900);
    const restoredApp = await standin();
    integratedApp.restoreShows = restoredApp.visibility === 'false,true';
    integratedApp.restoreKeepsDocument = restoredApp.id === opened.id && restoredApp.text === 'typed-before-minimize';

    /* 后台窗口：盖激活层，点一下提到前台，键盘焦点交给应用。 */
    await page.locator('#dock .di[data-app="calculator"]').click();
    await win('calculator').waitFor();
    await page.waitForTimeout(300);
    integratedApp.shieldWhenBehind = (await vscodeWin.locator('[data-webapp-shield]').count()) === 1;
    const content = await vscodeWin.locator('.webapp').boundingBox();
    await page.mouse.click(content.x + 40, content.y + content.height - 40);
    await page.waitForTimeout(300);
    integratedApp.clickActivates =
      (await vscodeWin.evaluate(node => node.classList.contains('front'))) &&
      (await page.locator('#menubar .mb-item.app').textContent())?.trim() === 'Aiao Code';
    await page.keyboard.type('xyz');
    await page.waitForTimeout(200);
    integratedApp.keyboardReachesApp = (await standin()).text?.endsWith('xyz') === true;

    /* 菜单打开时点进应用：菜单收起。 */
    await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
    const appleMenuOpen = await shows(page.locator('#layer-menu .pop .mi', { hasText: 'About This Mac' }));
    await page.mouse.click(content.x + content.width / 2, content.y + content.height / 2);
    await page.waitForTimeout(400);
    integratedApp.appClickClosesMenu = appleMenuOpen && (await page.locator('#layer-menu .pop').count()) === 0;

    /* 缩放：按住右下角把手，经过应用内容区往里拖，窗口尺寸跟着指针走。 */
    const beforeResize = await vscodeWin.boundingBox();
    const corner = await vscodeWin.locator('.rz-se').boundingBox();
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x + corner.width / 2 - 200, corner.y + corner.height / 2 - 150, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterResize = await vscodeWin.boundingBox();
    integratedApp.resizeTracksPointer =
      Math.abs(beforeResize.width - 200 - afterResize.width) <= 4 &&
      Math.abs(beforeResize.height - 150 - afterResize.height) <= 4;

    /* 关闭释放 iframe；再打开是新文档。 */
    await vscodeWin.locator('.tl .c').click();
    await page.waitForTimeout(400);
    integratedApp.closeRemovesFrame = (await page.locator('aiao-orbit').count()) === 0;
    await page.locator('#dock .di[data-app="vscode"]').click();
    integratedApp.reopensFresh = (await appears(webappIn('ready'), 15_000)) && (await standin()).id !== opened.id;

    /* 离线：入口请求失败，窗口给出原因，桌面照常；恢复后重试即就绪。 */
    await closeAll();
    standinControl.mode = 'offline';
    const offline = await prepareOfflineFailure(session);
    await page.locator('#dock .di[data-app="vscode"]').click();
    await offline.trigger();
    integratedApp.offlineShowsReason =
      (await appears(webappIn('failed'), 10_000)) &&
      ((await vscodeWin.locator('[data-webapp-reason]').textContent()) ?? '').includes(offline.reason);
    await page.locator('#dock .di[data-app="calculator"]').click();
    integratedApp.desktopUnaffected = await shows(win('calculator'));
    await win('calculator').locator('.tl .c').click();
    await page.waitForTimeout(400);
    standinControl.mode = 'standard';
    await vscodeWin.locator('[data-webapp-retry]').click();
    integratedApp.retryRecovers = await appears(webappIn('ready'), 15_000);

    /* 应用自报启动失败：窗口显示应用给出的原因。 */
    await closeAll();
    standinControl.mode = 'fail';
    await page.locator('#dock .di[data-app="vscode"]').click();
    integratedApp.appFailureShowsReason =
      (await appears(webappIn('failed'), 10_000)) &&
      ((await vscodeWin.locator('[data-webapp-reason]').textContent()) ?? '').includes('stand-in failed on purpose');
    standinControl.mode = 'standard';

    /* 入口一致（ADESK-US-201）：启动台与聚焦搜索找得到，菜单栏显示应用名，退出关闭全部窗口。 */
    await closeAll();
    await launch('Aiao Code');
    integratedApp.launchpadOpens = await appears(webappIn('ready'), 15_000);
    await closeAll();
    await spotlight('aiao');
    integratedApp.spotlightLists = await shows(page.locator('#spot .r', { hasText: 'Aiao Code' }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('#dock .di[data-app="vscode"]').click();
    await appears(webappIn('ready'), 15_000);
    const appMenuTitle = page.locator('#menubar .mb-item.app');
    integratedApp.menubarName = (await appMenuTitle.textContent())?.trim() === 'Aiao Code';
    await appMenuTitle.dispatchEvent('mousedown');
    integratedApp.appMenuItems = (
      await Promise.all(
        ['About Aiao Code', 'Hide Aiao Code', 'Quit Aiao Code'].map(label =>
          shows(page.locator('#layer-menu .pop .mi', { hasText: label }))
        )
      )
    ).every(Boolean);
    await page.locator('#layer-menu .pop .mi', { hasText: 'Quit Aiao Code' }).click();
    integratedApp.quitCloses =
      (await disappears(vscodeWin, 3_000)) &&
      (await page
        .waitForFunction(
          () => !document.querySelector('#dock .di[data-app="vscode"]')?.classList.contains('run'),
          undefined,
          { timeout: 3_000 }
        )
        .then(
          () => true,
          () => false
        ));

    return { integratedApp };
  }
};
