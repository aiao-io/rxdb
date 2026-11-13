/**
 * 几猫3A大作（ADESK-US-103）：随桌面发布的单文件游戏，在同源 iframe 里运行。无头 Chromium 只有软件 WebGL，
 * 真游戏开着时整页每秒约一帧，所以窗口这一侧用替身页顶替 /saltline.html，最后单独启动一次真游戏。
 */
export const game = {
  name: 'game',
  description: '几猫3A大作：同源 iframe、键盘焦点、激活层、缩放、关闭销毁、聚焦搜索，最后启动一次真游戏',
  standins: ['game'],
  keys: [
    'game.launchpadOpens',
    'game.titleBar',
    'game.sameOriginFrame',
    'game.fullscreenAllowed',
    'game.keyboardOnOpen',
    'game.shieldWhenBehind',
    'game.clickActivates',
    'game.inputReachesGame',
    'game.resizeTracksPointer',
    'game.closeRemovesFrame',
    'game.reopensFresh',
    'game.spotlightLists',
    'game.realGameBoots'
  ],
  async run(session) {
    const { page, game: gameControl } = session;
    const { win, closeAll, launch, spotlight, shows, appears } = session.helpers;
    await session.openDesktop();

    await closeAll();
    const gameUrl = gameControl.url;
    const gameWin = win('saltline');
    const gameElement = gameWin.locator('[data-saltline-frame]');
    const gameFrame = () => page.frames().find(frame => frame.url() === gameUrl);
    const gameState = async () => (await gameFrame()?.evaluate(() => window.standin)) ?? {};
    const gameLoaded = (previous = null) =>
      page
        .waitForFunction(
          id => {
            const standin = document.querySelector('[data-saltline-frame]')?.contentWindow?.standin;
            return Boolean(standin) && standin.id !== id;
          },
          previous,
          { timeout: 10_000 }
        )
        .then(
          () => true,
          () => false
        );
    const game = {};

    await launch('几猫3A大作');
    game.launchpadOpens = (await appears(gameElement)) && (await gameLoaded());
    game.titleBar =
      (await shows(gameWin.locator('.tb .tl'))) &&
      (await gameWin.locator('.tb .title').textContent())?.trim() === '几猫3A大作' &&
      (await page.locator('#menubar .mb-item.app').textContent())?.trim() === '几猫3A大作';
    game.sameOriginFrame = await gameElement.evaluate(
      (frame, url) =>
        frame.src === url &&
        frame.contentWindow?.location.origin === location.origin &&
        !frame.hasAttribute('sandbox') &&
        frame.getAttribute('allow') === 'fullscreen; gamepad',
      gameUrl
    );
    /* 授予的权限在游戏文档里生效（无头 Chromium 不支持指针锁定，那一项在真 Chrome 上验收）。 */
    game.fullscreenAllowed = await gameElement.evaluate(frame => frame.contentDocument?.fullscreenEnabled === true);

    /* 打开即可用键盘：游戏文档加载完就拿到键盘焦点。 */
    const focusedOnOpen = await page
      .waitForFunction(() => document.activeElement?.matches('[data-saltline-frame]'), undefined, { timeout: 3_000 })
      .then(
        () => true,
        () => false
      );
    await page.keyboard.type('wasd');
    game.keyboardOnOpen = focusedOnOpen && (await gameState()).keys === 'wasd';

    /* 后台窗口：盖激活层，点一下只激活窗口、不送进游戏；之后的按键与点击都送到游戏。 */
    await page.locator('#dock .di[data-app="calculator"]').click();
    await win('calculator').waitFor();
    await page.waitForTimeout(300);
    game.shieldWhenBehind = (await gameWin.locator('[data-saltline-shield]').count()) === 1;
    const gameBox = await gameElement.boundingBox();
    await page.mouse.click(gameBox.x + 40, gameBox.y + gameBox.height - 40);
    await page.waitForTimeout(300);
    game.clickActivates =
      (await gameWin.evaluate(node => node.classList.contains('front'))) &&
      (await page.locator('#menubar .mb-item.app').textContent())?.trim() === '几猫3A大作' &&
      (await gameState()).presses === 0;
    await page.keyboard.type('x');
    await page.mouse.click(gameBox.x + 80, gameBox.y + gameBox.height - 80);
    await page.waitForTimeout(200);
    const afterActivate = await gameState();
    game.inputReachesGame = afterActivate.keys === 'wasdx' && afterActivate.presses === 1;

    /* 缩放：按住右下角把手，经过游戏画面往里拖，窗口尺寸跟着指针走。 */
    const beforeGameResize = await gameWin.boundingBox();
    const gameCorner = await gameWin.locator('.rz-se').boundingBox();
    await page.mouse.move(gameCorner.x + gameCorner.width / 2, gameCorner.y + gameCorner.height / 2);
    await page.mouse.down();
    await page.mouse.move(gameCorner.x + gameCorner.width / 2 - 200, gameCorner.y + gameCorner.height / 2 - 150, {
      steps: 12
    });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterGameResize = await gameWin.boundingBox();
    game.resizeTracksPointer =
      Math.abs(beforeGameResize.width - 200 - afterGameResize.width) <= 4 &&
      Math.abs(beforeGameResize.height - 150 - afterGameResize.height) <= 4;

    /* 关闭即销毁游戏文档；再打开是新文档。 */
    const openedGame = afterActivate.id;
    await gameWin.locator('.tl .c').click();
    await page.waitForTimeout(400);
    game.closeRemovesFrame = (await page.locator('[data-saltline-frame]').count()) === 0;
    await launch('几猫3A大作');
    game.reopensFresh = await gameLoaded(openedGame);

    /* 聚焦搜索按名称找得到。游戏拿着键盘焦点时桌面快捷键不生效，先关掉窗口。 */
    await closeAll();
    await spotlight('3A');
    game.spotlightLists = await shows(page.locator('#spot .r', { hasText: '几猫3A大作' }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    /* 真游戏：随桌面发布的入口在桌面的跨源隔离下启动到标题画面，没有启动错误。 */
    gameControl.enabled = false;
    await launch('几猫3A大作');
    const realGame = await page
      .waitForFunction(
        () => {
          const view = document.querySelector('[data-saltline-frame]')?.contentWindow;
          return view?.__ready === true || Boolean(view?.__fatal);
        },
        undefined,
        { timeout: 120_000, polling: 1_000 }
      )
      .then(
        () =>
          gameFrame().evaluate(() => ({
            ready: window.__ready,
            fatal: window.__fatal,
            errors: window.__errors.length,
            isolated: window.crossOriginIsolated,
            screen: document.querySelector('.menu')?.dataset.screen
          })),
        () => ({})
      );
    game.realGameBoots =
      realGame.ready === true &&
      realGame.fatal === null &&
      realGame.errors === 0 &&
      realGame.isolated === true &&
      realGame.screen === 'title';
    await closeAll();
    gameControl.enabled = true;

    return { game };
  }
};
