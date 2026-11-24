/** 近似相等：像素取整与动画收尾会差一两个像素。 */
const near = (a, b, tolerance = 3) => Math.abs(a - b) <= tolerance;

const hasAccountAvatar = locator =>
  locator
    .evaluate(async image => {
      if (!(image instanceof HTMLImageElement)) return false;
      await image.decode();
      return image.currentSrc === new URL('profile/steve-jobs.jpg', document.baseURI).href;
    })
    .catch(() => false);

/** 窗口打开动画结束、几何不再变化后的外框（连续两次相隔 120 毫秒量到同一个结果，最长等 3 秒）。 */
async function settledBox(locator) {
  let previous = await locator.boundingBox();
  for (let attempt = 0; attempt < 25; attempt++) {
    await locator.page().waitForTimeout(120);
    const current = await locator.boundingBox();
    if (previous && current && ['x', 'y', 'width', 'height'].every(key => previous[key] === current[key]))
      return current;
    previous = current;
  }
  return previous;
}

/**
 * 按住 `from` 拖到 (dx, dy) 之外再松手。窗口拖动松手带惯性滑行，最后一步放慢（先停一下再挪一个像素），
 * 松手时指针速度为零，窗口才停在指针到的地方。
 */
async function dragBy(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.move(from.x + dx - Math.sign(dx), from.y + dy - Math.sign(dy));
  await page.mouse.up();
  await page.waitForTimeout(250);
}

/**
 * 外壳交互验收（ADESK-US-107）：开机、锁屏与解锁、睡眠与唤醒、状态栏面板、控制中心、标题栏拖动与缩放、
 * 多窗口的层叠与 ⌘` 循环。快捷键由脚本派发的按键事件触发；真实键盘见 `verify-keyboard.mjs`（只在本机跑）。
 */
export const shellInteraction = {
  name: 'shell-interaction',
  description: '外壳交互：开机与登录、锁屏、睡眠、状态栏面板、控制中心、拖动缩放、层叠与 ⌘` 循环',
  keys: [
    'shellInteraction.boot.screenAppears',
    'shellInteraction.boot.progressAdvances',
    'shellInteraction.boot.endsAtLoginScreen',
    'shellInteraction.boot.accountName',
    'shellInteraction.boot.accountAvatar',
    'shellInteraction.boot.loginEntersDesktop',
    'shellInteraction.boot.finderHomeName',
    'shellInteraction.boot.queryParameterSkips',
    'shellInteraction.boot.hashSkips',
    'shellInteraction.lock.shows',
    'shellInteraction.lock.coversDesktop',
    'shellInteraction.lock.unlockRestores',
    'shellInteraction.sleep.shows',
    'shellInteraction.sleep.wakes',
    'shellInteraction.sleep.desktopIntact',
    'shellInteraction.statusPanels.clockOpensNotifications',
    'shellInteraction.statusPanels.wifiMatchesState',
    'shellInteraction.statusPanels.batteryMatchesState',
    'shellInteraction.statusPanels.outsideClickCloses',
    'shellInteraction.controlCentre.opens',
    'shellInteraction.controlCentre.darkModeApplies',
    'shellInteraction.controlCentre.wifiToggleReflected',
    'shellInteraction.controlCentre.settingsSurviveReload',
    'shellInteraction.controlCentre.brightnessBeforeFirstPanel',
    'shellInteraction.account.settingsName',
    'shellInteraction.account.settingsAvatar',
    'shellInteraction.dragResizeZoom.titleBarMoves',
    'shellInteraction.dragResizeZoom.cornerResizes',
    'shellInteraction.dragResizeZoom.keepOnScreen',
    'shellInteraction.dragResizeZoom.greenButtonZooms',
    'shellInteraction.dragResizeZoom.greenButtonRestores',
    'shellInteraction.focusCycle.windowsOverlap',
    'shellInteraction.focusCycle.clickRaisesWindow',
    'shellInteraction.focusCycle.stackFollowsClicks',
    'shellInteraction.focusCycle.cycleRaisesBottom',
    'shellInteraction.shortcutRouting.hideMenuHidesAllWindows',
    'shellInteraction.shortcutRouting.safariCloseTab',
    'shellInteraction.shortcutRouting.lockShortcut'
  ],
  async run(session) {
    const { page, origin } = session;
    const { win, closeAll, shows, appears, disappears } = session.helpers;

    /* AC#1 开机：不带 boot=0 的入口先出开机画面，进度走完到登录界面，点一下进入桌面。 */
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    const boot = {};
    boot.screenAppears = await appears(page.locator('#boot'), 5_000);
    boot.progressAdvances = await page
      .waitForFunction(
        () => {
          const bar = document.querySelector('#boot .bar i');
          return bar instanceof HTMLElement && Number.parseFloat(bar.style.width || '0') > 0;
        },
        undefined,
        { timeout: 5_000 }
      )
      .then(
        () => true,
        () => false
      );
    boot.endsAtLoginScreen = await page
      .waitForFunction(
        () => {
          const lock = document.querySelector('#lock');
          return lock instanceof HTMLElement && !lock.hidden && lock.dataset['on'] === '1';
        },
        undefined,
        { timeout: 15_000 }
      )
      .then(
        () => true,
        () => false
      );
    const login = page.locator('#lock');
    boot.accountName =
      (await login.locator('.lk-name').textContent()) === 'Steve Jobs' &&
      (await login.getByRole('button', { name: 'Log in as Steve Jobs', exact: true }).count()) === 1;
    boot.accountAvatar = await hasAccountAvatar(login.locator('[data-av]'));
    await login.click();
    boot.loginEntersDesktop =
      (await disappears(page.locator('#boot'), 5_000)) && (await appears(win('finder'), 10_000));
    await page.waitForFunction(() => document.querySelector('#lock')?.hasAttribute('hidden'), undefined, {
      timeout: 5_000
    });
    boot.finderHomeName = (await win('finder').getAttribute('aria-label')) === 'Steve Jobs';

    /* 跳过开机的两个入口：?boot=0 与 #noboot 都直接进桌面。 */
    await page.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
    await win('finder').waitFor();
    boot.queryParameterSkips = (await page.locator('#boot').count()) === 0;
    await page.goto(`${origin}/#noboot`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await win('finder').waitFor();
    boot.hashSkips = (await page.locator('#boot').count()) === 0;

    /* AC#2 锁屏：Apple 菜单「Lock Screen」遮住桌面与窗口，点一下解锁，回到原状态。 */
    await page.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
    await win('finder').waitFor();
    const finderBefore = await settledBox(win('finder'));
    const appleItem = async label => {
      await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
      await page.locator('#layer-menu .pop .mi', { hasText: label }).click();
    };
    await appleItem('Lock Screen');
    const lock = {};
    lock.shows = await page
      .waitForFunction(
        () => {
          const node = document.querySelector('#lock');
          return node instanceof HTMLElement && !node.hidden && node.dataset['on'] === '1';
        },
        undefined,
        { timeout: 5_000 }
      )
      .then(
        () => true,
        () => false
      );
    lock.coversDesktop = await page.evaluate(() => {
      const probe = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return Boolean(probe?.closest('#lock'));
    });
    /* 点一下解锁（键盘焦点还在刚点过的菜单项上，回车会再触发一次「锁屏」）。 */
    await page.locator('#lock').click();
    await page.waitForFunction(() => document.querySelector('#lock')?.hasAttribute('hidden'), undefined, {
      timeout: 5_000
    });
    const finderAfter = await win('finder').boundingBox();
    lock.unlockRestores =
      (await win('finder').count()) === 1 &&
      near(finderBefore.x, finderAfter.x, 1) &&
      near(finderBefore.y, finderAfter.y, 1) &&
      near(finderBefore.width, finderAfter.width, 1);

    /* AC#3 睡眠：Apple 菜单「Sleep」出现睡眠画面，自动唤醒后桌面照常。 */
    await appleItem('Sleep');
    const sleep = {};
    sleep.shows = await appears(page.locator('#sleeper'), 3_000);
    sleep.wakes = await disappears(page.locator('#sleeper'), 6_000);
    sleep.desktopIntact = (await win('finder').count()) === 1 && (await page.locator('#menubar').isVisible());

    /* AC#4 状态栏面板：时钟开通知中心，Wi-Fi / 电池面板的内容与系统状态一致，点外面关闭。 */
    const statusPanels = {};
    await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
    statusPanels.clockOpensNotifications = await shows(page.locator('#nc .wgt').first());
    await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
    await disappears(page.locator('#nc'), 3_000);
    await page.locator('#menubar [data-st="wifi"]').dispatchEvent('mousedown');
    const wifiPanel = page.locator('app-wifi-panel');
    await wifiPanel.waitFor({ state: 'visible', timeout: 3_000 });
    const wifiSwitchOn = await wifiPanel.locator('[data-t="wifi"]').evaluate(node => node.classList.contains('on'));
    const knownNetwork = await wifiPanel.locator('[data-net]').first().getAttribute('data-net');
    /* 菜单栏的 Wi-Fi 图标开着是不透明、关着是半透明。 */
    const wifiIconOn = () => page.locator('#menubar [data-st="wifi"]').evaluate(node => node.style.opacity === '1');
    statusPanels.wifiMatchesState = wifiSwitchOn === (await wifiIconOn()) && Boolean(knownNetwork);
    await page.mouse.click(700, 500);
    statusPanels.outsideClickCloses = await disappears(wifiPanel, 3_000);
    const percentInBar = (await page.locator('#mb-battpct').textContent())?.trim();
    await page.locator('#menubar [data-st="batt"]').dispatchEvent('mousedown');
    const batteryPanel = page.locator('app-battery-panel');
    await batteryPanel.waitFor({ state: 'visible', timeout: 3_000 });
    statusPanels.batteryMatchesState = ((await batteryPanel.textContent()) ?? '').includes(
      percentInBar ?? 'no-percent'
    );
    await page.keyboard.press('Escape');
    await disappears(batteryPanel, 3_000);

    /* AC#5 控制中心：打开，切深色外观与 Wi-Fi 开关，刷新后外观仍在。 */
    const controlCentre = {};
    await page.locator('#menubar [data-st="cc"]').dispatchEvent('mousedown');
    const panel = page.locator('app-control-centre');
    controlCentre.opens = await shows(panel);
    const wifiBefore = await wifiIconOn();
    await panel.locator('[data-t="wifi"]').click();
    await page.waitForTimeout(200);
    controlCentre.wifiToggleReflected = (await wifiIconOn()) !== wifiBefore;
    await panel.locator('[data-t="wifi"]').click();
    await panel.getByRole('slider', { name: 'Display' }).press('Home');
    await panel.locator('[data-t="dark"]').click();
    controlCentre.darkModeApplies = await page
      .waitForFunction(() => document.documentElement.dataset['theme'] === 'dark', undefined, { timeout: 3_000 })
      .then(
        () => true,
        () => false
      );
    await page.waitForTimeout(1_000);
    await session.reloadDesktop();
    controlCentre.settingsSurviveReload = await page
      .waitForFunction(() => document.documentElement.dataset['theme'] === 'dark', undefined, { timeout: 10_000 })
      .then(
        () => true,
        () => false
      );

    controlCentre.brightnessBeforeFirstPanel = await page.evaluate(
      () => Number(document.querySelector('#dimmer')?.style.opacity) === 0.585
    );

    await appleItem('System Settings…');
    const accountRow = win('settings').locator('.st-row').first();
    const account = {
      settingsName: (await accountRow.locator('b').textContent()) === 'Steve Jobs',
      settingsAvatar: await hasAccountAvatar(accountRow.locator('.bg'))
    };

    /* AC#6 窗口交互：拖标题栏、拖右下角缩放、拖出屏幕被拉回、绿色按钮缩放与还原。 */
    await closeAll();
    await page.locator('#dock .di[data-app="finder"]').click();
    await win('finder').waitFor();
    await page.waitForTimeout(500);
    const finder = win('finder').last();
    /* 窗口里任意 [data-drag] 元素都能拖动窗口：取第一个，抓它的右上角附近（避开左边的红黄绿按钮）。 */
    const grabPoint = async app => {
      const box = await win(app).last().locator('[data-drag]').first().boundingBox();
      return { x: box.x + box.width - 16, y: box.y + 8 };
    };
    const viewport = page.viewportSize();
    const dragResizeZoom = {};
    const before = await finder.boundingBox();
    const grab = await grabPoint('finder');
    await dragBy(page, grab, 60, 40);
    const moved = await finder.boundingBox();
    dragResizeZoom.titleBarMoves = near(moved.x, before.x + 59) && near(moved.y, before.y + 39);

    const corner = await finder.locator('.rz-se').boundingBox();
    const cornerPoint = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
    await dragBy(page, cornerPoint, 80, 50);
    const resized = await finder.boundingBox();
    dragResizeZoom.cornerResizes =
      near(resized.width, moved.width + 80, 4) && near(resized.height, moved.height + 50, 4);

    const sizeBeforeZoom = await finder.boundingBox();
    await finder.locator('.tl .f').click();
    await page.waitForFunction(
      () => {
        const node = document.querySelector('.win[data-app="finder"]:not(.closing)');
        return node?.classList.contains('zoomed') && Number.parseFloat(node.style.width) === innerWidth;
      },
      undefined,
      { timeout: 5_000 }
    );
    const zoomedBox = await finder.boundingBox();
    dragResizeZoom.greenButtonZooms =
      (await finder.evaluate(node => node.classList.contains('zoomed'))) &&
      zoomedBox.width > sizeBeforeZoom.width &&
      zoomedBox.x >= 0 &&
      zoomedBox.x + zoomedBox.width <= viewport.width + 1;
    await finder.locator('.tl .f').click();
    await page.waitForFunction(
      () => {
        const node = document.querySelector('.win[data-app="finder"]:not(.closing)');
        return node && !node.classList.contains('zoomed');
      },
      undefined,
      { timeout: 5_000 }
    );
    const restoredBox = await finder.boundingBox();
    dragResizeZoom.greenButtonRestores =
      !(await finder.evaluate(node => node.classList.contains('zoomed'))) &&
      near(restoredBox.width, sizeBeforeZoom.width, 3) &&
      near(restoredBox.height, sizeBeforeZoom.height, 3) &&
      near(restoredBox.x, sizeBeforeZoom.x, 3);

    /* 把标题栏拖到屏幕右下角之外：松手后窗口仍有一部分在屏幕内，标题栏够得着。 */
    const grab2 = await grabPoint('finder');
    await dragBy(page, grab2, 1430 - grab2.x, 890 - grab2.y);
    const edge = await finder.boundingBox();
    dragResizeZoom.keepOnScreen =
      edge.x < viewport.width - 60 && edge.y < viewport.height - 30 && edge.x + edge.width > 60 && edge.y >= 0;

    /* AC#7 多窗口：三个窗口互相重叠，依次点击，层叠顺序跟着点击走；⌘` 把最底层的可见窗口提到最前。 */
    await closeAll();
    const focusCycle = {};
    const order = ['finder', 'calculator', 'notes'];
    for (const app of order) {
      await page.locator(`#dock .di[data-app="${app}"]`).click();
      await win(app).waitFor();
      await page.waitForTimeout(350);
    }
    /* 把计算器拖到 Finder 右缘内侧 100 像素：仍与另外两个窗口重叠，但右侧露出一条，不管层叠顺序怎样都点得到。 */
    const finderBox = await win('finder').boundingBox();
    const calculatorBox = await win('calculator').boundingBox();
    await dragBy(page, await grabPoint('calculator'), finderBox.x + finderBox.width - 100 - calculatorBox.x, 0);
    const boxes = Object.fromEntries(await Promise.all(order.map(async app => [app, await win(app).boundingBox()])));
    const overlaps = (a, b) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    focusCycle.windowsOverlap =
      overlaps(boxes.finder, boxes.notes) &&
      overlaps(boxes.finder, boxes.calculator) &&
      overlaps(boxes.notes, boxes.calculator);
    /* 每个窗口各有一块不会被另外两个盖住的地方。 */
    const exposed = {
      finder: { x: boxes.finder.x + 24, y: boxes.finder.y + 300 },
      notes: { x: boxes.notes.x + 500, y: boxes.finder.y + boxes.finder.height + 25 },
      calculator: { x: boxes.calculator.x + boxes.calculator.width - 20, y: boxes.calculator.y + 10 }
    };
    const zOf = app => win(app).evaluate(node => Number(node.style.zIndex || getComputedStyle(node).zIndex));
    const isFront = app => win(app).evaluate(node => node.classList.contains('front'));
    const stack = async () => {
      const entries = await Promise.all(order.map(async app => [app, await zOf(app)]));
      return entries.sort((a, b) => a[1] - b[1]).map(([app]) => app);
    };
    const clickWindow = async app => {
      await page.mouse.click(exposed[app].x, exposed[app].y);
      await page.waitForTimeout(250);
    };
    await clickWindow('finder');
    focusCycle.clickRaisesWindow = await isFront('finder');
    await clickWindow('notes');
    await clickWindow('calculator');
    focusCycle.stackFollowsClicks =
      (await stack()).join() === ['finder', 'notes', 'calculator'].join() && (await isFront('calculator'));
    await page.keyboard.press('Meta+Backquote');
    await page.waitForTimeout(500);
    focusCycle.cycleRaisesBottom = (await isFront('finder')) && (await stack()).at(-1) === 'finder';

    /*
     * 菜单与快捷键分发：应用菜单的 Hide 收起整个应用（不是只最小化前台窗口）；
     * Safari 的 ⌘W 先交给应用的 Close Tab，不关窗口；Apple 菜单的 ⌃⌘Q 锁屏，
     * 不会因为硬编码的 q → quitFront 退出前台应用。
     */
    await closeAll();
    const shortcutRouting = {};

    await page.locator('#dock .di[data-app="finder"]').click();
    await win('finder').waitFor();
    await page.waitForTimeout(350);
    await page.keyboard.press('Meta+N');
    await page.waitForTimeout(450);
    const finders = page.locator('.win[data-app="finder"]:not(.closing)');
    const finderCount = await finders.count();
    await page.locator('#menubar .mb-item.app').click();
    await page.locator('.pop .mi', { hasText: 'Hide Finder' }).click();
    await page.waitForTimeout(900);
    const allFinderWindowsHidden = await finders.evaluateAll(nodes =>
      nodes.every(
        node => node.classList.contains('mini') && getComputedStyle(node).visibility === 'hidden'
      )
    );
    shortcutRouting.hideMenuHidesAllWindows = finderCount === 2 && allFinderWindowsHidden;

    await page.locator('#dock .di[data-app="safari"]').click();
    await win('safari').waitFor();
    await page.waitForTimeout(450);
    await win('safari').locator('.sf-top').click();
    await page.keyboard.press('Meta+T');
    await page.waitForTimeout(250);
    const tabsAfterNew = await win('safari').locator('.sf-tab').count();
    await page.keyboard.press('Meta+W');
    await page.waitForTimeout(400);
    shortcutRouting.safariCloseTab =
      tabsAfterNew === 2 &&
      (await win('safari').locator('.sf-tab').count()) === 0 &&
      (await win('safari').isVisible());

    await page.locator('#dock .di[data-app="calculator"]').click();
    await win('calculator').waitFor();
    await page.waitForTimeout(350);
    await page.keyboard.press('Control+Meta+Q');
    const lockedByShortcut = await appears(page.locator('#lock'), 3_000);
    const calculatorStillOpen = (await win('calculator').count()) === 1;
    await page.locator('#lock').click();
    const unlockedAfterShortcut = await page
      .waitForFunction(() => document.querySelector('#lock')?.hasAttribute('hidden'), undefined, { timeout: 3_000 })
      .then(
        () => true,
        () => false
      );
    shortcutRouting.lockShortcut = lockedByShortcut && calculatorStillOpen && unlockedAfterShortcut;

    return {
      shellInteraction: {
        boot,
        lock,
        sleep,
        statusPanels,
        controlCentre,
        account,
        dragResizeZoom,
        focusCycle,
        shortcutRouting
      }
    };
  }
};
