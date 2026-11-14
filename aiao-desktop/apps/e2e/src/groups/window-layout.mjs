import { openPages } from '../fixtures/multi-page.mjs';
import { componentScripts, scriptNameOf, scriptsDeclaring } from '../harness/chunks.mjs';
import { PREFERENCES, surgery } from '../harness/database.mjs';
import { createHelpers } from '../harness/helpers.mjs';

/*
 * 会话标识与布局行的约定。e2e 不 import web 的源码（D-02），所以这里重复写一遍；
 * 约定变了这些检查项会失败，正好把两边拴在一起：
 *   - 标签页的会话标识存在 sessionStorage 的 `aiao-desktop:tab-id`；
 *   - 布局存成系统偏好 `windows:layout:<会话标识>`，值是 { version: 1, updatedAt, windows: [...] }，窗口按层叠从后到前。
 */
const TAB_ID_KEY = 'aiao-desktop:tab-id';
const LAYOUT_PREFIX = 'windows:layout:';
const DAY = 24 * 60 * 60 * 1000;

/** 近似相等：像素取整与动画收尾会差一两个像素。 */
const near = (a, b, tolerance = 3) => Math.abs(a - b) <= tolerance;
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));

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

/** 窗口里任意 [data-drag] 元素都能拖动窗口：取第一个，抓它的右上角附近（避开左边的红黄绿按钮）。 */
async function grabPoint(windowLocator) {
  const box = await windowLocator.locator('[data-drag]').first().boundingBox();
  return { x: box.x + box.width - 16, y: box.y + 8 };
}

/** 抓右下角的缩放把手，往外拖。 */
async function resizeBy(page, windowLocator, dx, dy) {
  const corner = await windowLocator.locator('.rz-se').boundingBox();
  await dragBy(page, { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 }, dx, dy);
}

/** 窗口当前的几何：整数，与布局里记的同源（offset 系列）。最小化（隐藏）的窗口也读得到。 */
const boxOf = windowLocator =>
  windowLocator.evaluate(node => ({
    left: node.offsetLeft,
    top: node.offsetTop,
    width: node.offsetWidth,
    height: node.offsetHeight
  }));

const sameBox = (a, b, tolerance = 2) =>
  ['left', 'top', 'width', 'height'].every(key => near(a[key], b[key], tolerance));

/** 页面上全部没在关闭的窗口，按层叠从后到前；`visible` 为假就是最小化收进 Dock 的。 */
const stackOf = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('.win:not(.closing)')]
      .map(node => ({
        app: node.dataset['app'],
        z: Number(node.style.zIndex || 0),
        front: node.classList.contains('front'),
        zoomed: node.classList.contains('zoomed'),
        visible: getComputedStyle(node).visibility !== 'hidden'
      }))
      .sort((a, b) => a.z - b.z)
  );

const titleOf = windowLocator => windowLocator.locator('[data-title]').first().textContent();

/** 像用户那样点一个窗口：在窗口内找一个没被别的窗口盖住的点，真的点一下（窗口互相重叠时不能点正中间）。 */
async function clickWindow(page, windowLocator) {
  const box = await windowLocator.boundingBox();
  const candidates = [
    [0.5, 0.5],
    [0.5, 0.8],
    [0.2, 0.7],
    [0.8, 0.7],
    [0.2, 0.9],
    [0.8, 0.9]
  ].map(([fx, fy]) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy }));
  for (const point of candidates) {
    const mine = await windowLocator.evaluate(
      (node, at) => document.elementFromPoint(at.x, at.y)?.closest('.win') === node,
      point
    );
    if (mine) {
      await page.mouse.click(point.x, point.y);
      return;
    }
  }
  throw new Error('窗口被完全盖住，点不到');
}

/**
 * 记录页面上所有显示过的提示（`#toast` 变成可见时的文字）。提示只显示约 2 秒，而恢复发生在桌面启动的早段，
 * 等页面加载完再去看就错过了，所以在页面脚本运行之前就装上观察。要在导航（或刷新）之前调用。
 */
function recordToasts(page) {
  return page.addInitScript(() => {
    window['__toasts'] = [];
    const watch = () => {
      const toast = document.querySelector('#toast');
      if (!toast) return false;
      const record = () => {
        if (toast.classList.contains('on')) window['__toasts'].push(toast.textContent?.trim() ?? '');
      };
      new MutationObserver(record).observe(toast, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        characterData: true,
        subtree: true
      });
      /* 元素出现时可能已经带着 on（提示在首次渲染前就设好了）：观察装上之前的那一次也要记。 */
      record();
      return true;
    };
    if (!watch())
      new MutationObserver((_, observer) => {
        if (watch()) observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
  });
}

/** 等页面上显示过包含 `text` 的提示。 */
const toastShown = (page, text, timeout = 15_000) =>
  page
    .waitForFunction(needle => window['__toasts']?.some(shown => shown.includes(needle)) ?? false, text, { timeout })
    .then(
      () => true,
      () => false
    );

/** 库里全部窗口布局行：键 → 解析后的值。 */
const readLayouts = async db =>
  Object.fromEntries(
    (
      await db.shell.rows(
        `SELECT "key", "value" FROM "${PREFERENCES}" WHERE "key" LIKE '${LAYOUT_PREFIX}%' ORDER BY "key"`
      )
    ).map(([key, value]) => [key, JSON.parse(value)])
  );

/** 本页面（标签页）的布局行的键。 */
const layoutKeyOf = async page =>
  `${LAYOUT_PREFIX}${await page.evaluate(key => sessionStorage.getItem(key), TAB_ID_KEY)}`;

const appsIn = layout => layout.windows.map(item => item.appId);

/**
 * 等本页面的布局写进库里并通过 `accept`（写回有 0.4 秒防抖，刷新前要等它落库）。
 * 返回通过的布局；超时返回 null。
 */
async function savedLayout(session, page, accept, timeout = 15_000) {
  const key = await layoutKeyOf(page);
  return surgery(session, async db => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const layout = (await readLayouts(db))[key];
      if (layout && accept(layout)) return layout;
      if (Date.now() > deadline) return null;
      await pause(250);
    }
  });
}

/** 直接改库里某个键的布局（造“应用下线”、过期的遗留行这类界面造不出来的状态）。 */
const writeLayout = (session, key, value) =>
  surgery(session, db =>
    db.shell.execute(`UPDATE "${PREFERENCES}" SET "value" = ? WHERE "key" = ?`, [JSON.stringify(value), key])
  );

/** 手工拼一条窗口记录。 */
const record = (appId, name, overrides = {}) => ({
  appId,
  name,
  box: { left: 220, top: 120, width: 300, height: 380 },
  minimized: false,
  zoomed: false,
  options: {},
  ...overrides
});

/**
 * 窗口布局的持久化与恢复（ADESK-US-104）：每个标签页把自己的窗口布局存进系统偏好，刷新后据此恢复。
 * 对正式构建、中途刷新、外网拦截；Aiao Code 用替身应用（standard 与 transparent 各验一次），几猫3A大作用替身页
 * （启动阶段是否请求 `saltline.html` 看网络记录）；终端的虚拟机是否启动用 DOM 证据（占位还在、没有 `.xterm`）；
 * 启动阶段有没有装载应用内容，用构建里的组件 chunk 反查网络记录。每个场景用自己的标签页（独立的会话标识），互不影响。
 * 线上的 Aiao Code 组合在 `verify-aiao-code` 里补，不在这里。
 */
export const windowLayout = {
  name: 'window-layout',
  description:
    '窗口布局：刷新后恢复位置大小、最小化与缩放、Finder 路径、前台与层叠；重型应用延后；按标签页分开；清理遗留行',
  standins: ['aiao-code', 'game'],
  timeout: 600_000,
  keys: [
    'windowLayout.restoresPositionAndSize',
    'windowLayout.restoresMinimizedState',
    'windowLayout.finderKeepsPath',
    'windowLayout.layoutRowShape',
    'windowLayout.restoresTwoFinders',
    'windowLayout.twoFindersKeepTheirPaths',
    'windowLayout.zoomedWindowRestoresZoomed',
    'windowLayout.zoomedWindowUnzoomsToSavedBox',
    'windowLayout.integratedStandardRestoresGeometry',
    'windowLayout.integratedStandardHandshakesAgain',
    'windowLayout.integratedTransparentRestoresGeometry',
    'windowLayout.integratedTransparentHandshakesAgain',
    'windowLayout.integratedTransparentHidesDesktopChrome',
    'windowLayout.closedWindowStaysClosed',
    'windowLayout.otherWindowsRestoredAfterClose',
    'windowLayout.retiredAppSkipped',
    'windowLayout.retiredAppNotice',
    'windowLayout.retiredAppOthersRestored',
    'windowLayout.retiredWindowDroppedFromLayout',
    'windowLayout.onlyRetiredOpensDefaultFinder',
    'windowLayout.restoreRunsBehindBootScreen',
    'windowLayout.noticeWaitsForUnlockedDesktop',
    'windowLayout.farWindowWasSaved',
    'windowLayout.restoredWindowPulledOnScreen',
    'windowLayout.heavyWindowsRestoreAsFrames',
    'windowLayout.heavyWindowsShowIdlePlaceholder',
    'windowLayout.heavyFrontWindowStaysFront',
    'windowLayout.startupBootsNoVirtualMachine',
    'windowLayout.startupRequestsNoHeavyChunks',
    'windowLayout.startupRequestsNoSaltlineEntry',
    'windowLayout.firstClickStartsTerminal',
    'windowLayout.firstClickStartsGame',
    'windowLayout.idlePlaceholderIsFocusableButton',
    'windowLayout.idlePlaceholderStartsFromKeyboard',
    'windowLayout.tabAKeepsOnlyItsWindows',
    'windowLayout.tabBKeepsOnlyItsWindows',
    'windowLayout.layoutsStoredPerTab',
    'windowLayout.reloadDoesNotOverwriteOtherTab',
    'windowLayout.newTabStartsFromEmptyDesktop',
    'windowLayout.noExtraDefaultFinder',
    'windowLayout.frontWindowStaysFront',
    'windowLayout.stackOrderPreserved',
    'windowLayout.minimizedFrameOnlyAtStartup',
    'windowLayout.minimizedPayloadNotRequestedAtStartup',
    'windowLayout.dockRestoreShowsWindow',
    'windowLayout.dockRestoreLoadsPayloadFirstTime',
    'windowLayout.staleRowsPruned',
    'windowLayout.recentRowsKept',
    'windowLayout.blockedStorageNotice',
    'windowLayout.blockedStorageStillOpensFinder',
    'windowLayout.blockedStorageWritesNothing'
  ],
  async run(session) {
    const { origin, distRoot } = session;
    const result = {};

    /* 网络记录：上下文级别，iframe 与工作线程的请求也在里面。 */
    const requests = [];
    session.context.on('request', request => requests.push(request.url()));
    const components = componentScripts(distRoot);
    const chunkOf = selector => scriptsDeclaring(components, selector);
    const scriptsSince = start =>
      new Set(
        requests
          .slice(start)
          .map(url => scriptNameOf(url, origin))
          .filter(Boolean)
      );
    /** 自 `start` 起下载过应用 `selector` 的组件 chunk。构建里应该恰有一个这样的 chunk，否则直接报错，免得“没下载”成了空话。 */
    const loadedSince = (start, selector) => {
      const chunks = chunkOf(selector);
      if (chunks.length !== 1) throw new Error(`构建里应该恰有一个声明 ${selector} 的 chunk，找到 ${chunks.length} 个`);
      return scriptsSince(start).has(chunks[0]);
    };
    const gameEntrySince = start => requests.slice(start).filter(url => url === session.game.url).length;

    const scenario = { session, result, origin, requests, loadedSince, gameEntrySince };

    /* 默认的标签页：先关掉启动页，后面每个场景各开各的标签页。 */
    await session.page.close();

    await mixedWindows(scenario);
    await twoFindersAndZoom(scenario);
    await integratedApp(scenario, 'standard');
    await integratedApp(scenario, 'transparent');
    await closedAndFront(scenario);
    await minimizedOnly(scenario);
    await retiredApp(scenario);
    await noticeAfterBoot(scenario);
    await shrunkViewport(scenario);
    await separateTabs(scenario);
    await pruneStaleRows(scenario);
    await blockedStorage(scenario);

    return { windowLayout: result };
  }
};

/**
 * AC#1、AC#7、AC#10（刷新前的部分）：Finder 停在 Documents、Notes 最小化、几猫3A大作与终端（前台）。
 * 刷新后三个窗口回到原位原大小，Notes 仍是最小化，Finder 还在 Documents；终端与游戏只重建外框，
 * 启动阶段不拉起虚拟机、不请求 saltline.html，用户第一次点击窗口才装载（哪怕终端就是恢复前的前台窗口）。
 */
async function mixedWindows({ session, result, requests, loadedSince, gameEntrySince }) {
  const { page, helpers } = await session.openDesktopPage();
  const { win, launch, appears, shows } = helpers;

  const finder = win('finder').last();
  await finder.locator('.fitem[data-name="Documents"]').dblclick();
  await page.waitForFunction(
    () => document.querySelector('.win[data-app="finder"] [data-title]')?.textContent?.trim() === 'Documents'
  );
  await dragBy(page, await grabPoint(finder), 70, 30);
  await resizeBy(page, finder, 60, 40);

  await page.locator('#dock .di[data-app="notes"]').click();
  await win('notes').waitFor();
  await page.waitForTimeout(400);
  const notesBefore = await boxOf(win('notes'));
  await dragBy(page, await grabPoint(win('notes')), -120, 60);
  await win('notes').locator('.tl .m').click();
  await page.waitForTimeout(800);

  await launch('几猫3A大作');
  await appears(win('saltline').locator('[data-saltline-frame]'));
  await page.waitForTimeout(400);
  await dragBy(page, await grabPoint(win('saltline')), -60, 90);

  await page.locator('#dock .di[data-app="terminal"]').click();
  await appears(win('terminal').locator('.xterm'), 30_000);
  await page.waitForTimeout(500);
  await dragBy(page, await grabPoint(win('terminal')), 90, -20);

  const apps = ['finder', 'notes', 'saltline', 'terminal'];
  const expected = Object.fromEntries(await Promise.all(apps.map(async app => [app, await boxOf(win(app).last())])));
  const moved = !sameBox(expected.notes, notesBefore, 20);
  const layout = await savedLayout(session, page, saved =>
    apps.every(app =>
      saved.windows.some(
        item => item.appId === app && sameBox(item.box, expected[app]) && item.minimized === (app === 'notes')
      )
    )
  );
  result.layoutRowShape =
    layout !== null &&
    layout.version === 1 &&
    typeof layout.updatedAt === 'number' &&
    layout.windows.every(
      item =>
        typeof item.appId === 'string' &&
        typeof item.name === 'string' &&
        ['left', 'top', 'width', 'height'].every(key => Number.isFinite(item.box[key])) &&
        typeof item.minimized === 'boolean' &&
        typeof item.zoomed === 'boolean' &&
        typeof item.options === 'object'
    ) &&
    (await layoutKeyOf(page)).startsWith(LAYOUT_PREFIX) &&
    appsIn(layout).at(-1) === 'terminal';

  const mark = requests.length;
  await page.reload({ waitUntil: 'load' });
  await win('finder').waitFor();
  await win('saltline').waitFor();
  await win('terminal').waitFor();
  /* 给迟到的装载留点时间：启动阶段什么都不该多出来。 */
  await page.waitForTimeout(2_000);

  const after = Object.fromEntries(await Promise.all(apps.map(async app => [app, await boxOf(win(app).last())])));
  result.restoresPositionAndSize =
    layout !== null &&
    moved &&
    ['finder', 'saltline', 'terminal', 'notes'].every(app => sameBox(after[app], expected[app]));
  const stack = await stackOf(page);
  result.restoresMinimizedState =
    (await win('notes').count()) === 1 &&
    !(await win('notes').isVisible()) &&
    stack.find(item => item.app === 'notes')?.visible === false &&
    stack.filter(item => item.app !== 'notes').every(item => item.visible);
  result.finderKeepsPath = ((await titleOf(win('finder').last())) ?? '').trim() === 'Documents';

  const terminalWin = win('terminal');
  const gameWin = win('saltline');
  result.heavyWindowsRestoreAsFrames =
    sameBox(after.terminal, expected.terminal) && sameBox(after.saltline, expected.saltline);
  result.heavyWindowsShowIdlePlaceholder =
    (await shows(terminalWin.locator('[data-window-idle]'))) && (await shows(gameWin.locator('[data-window-idle]')));
  result.heavyFrontWindowStaysFront = stack.at(-1)?.app === 'terminal' && stack.at(-1)?.front === true;
  result.startupBootsNoVirtualMachine =
    (await terminalWin.locator('.xterm').count()) === 0 &&
    (await terminalWin.locator('.xterm-helper-textarea').count()) === 0;
  result.startupRequestsNoHeavyChunks =
    !loadedSince(mark, 'app-terminal') && !loadedSince(mark, 'app-saltline') && !loadedSince(mark, 'app-notes');
  result.startupRequestsNoSaltlineEntry =
    gameEntrySince(mark) === 0 && (await page.locator('[data-saltline-frame]').count()) === 0;

  /* 第一次点击才装载：先终端（恢复前的前台窗口），再游戏。 */
  const clicked = requests.length;
  await clickWindow(page, terminalWin);
  result.firstClickStartsTerminal =
    (await appears(terminalWin.locator('.xterm'), 30_000)) &&
    loadedSince(clicked, 'app-terminal') &&
    (await terminalWin.locator('[data-window-idle]').count()) === 0;
  const gameClicked = requests.length;
  await clickWindow(page, gameWin);
  result.firstClickStartsGame =
    (await appears(gameWin.locator('[data-saltline-frame]'), 15_000)) &&
    gameEntrySince(gameClicked) === 1 &&
    gameEntrySince(mark) === 1;

  /* 再刷新一次：占位是真正的按钮（可聚焦、有名称），键盘也能启动它；重型应用这一轮仍然只重建外框。 */
  await page.reload({ waitUntil: 'load' });
  await terminalWin.waitFor();
  await gameWin.waitFor();
  await page.waitForTimeout(1_000);
  const idle = terminalWin.locator('[data-window-idle]');
  await idle.focus();
  result.idlePlaceholderIsFocusableButton =
    (await idle.evaluate(
      node =>
        node.tagName === 'BUTTON' &&
        node.getAttribute('aria-label') === 'Start Terminal' &&
        document.activeElement === node
    )) && (await terminalWin.locator('.xterm').count()) === 0;
  const typed = requests.length;
  await gameWin.locator('[data-window-idle]').focus();
  await page.keyboard.press('Enter');
  result.idlePlaceholderStartsFromKeyboard =
    (await appears(gameWin.locator('[data-saltline-frame]'), 15_000)) && gameEntrySince(typed) === 1;
  await page.close();
}

/**
 * AC#2：两个 Finder 窗口刷新后都在，各停在自己的目录；顺带验缩放状态：缩放过的窗口刷新后仍是缩放的，
 * 取消缩放回到缩放前的位置与大小。
 */
async function twoFindersAndZoom({ session, result }) {
  const { page, helpers } = await session.openDesktopPage();
  const { win } = helpers;
  await page.keyboard.press('Meta+n');
  await page.waitForFunction(() => document.querySelectorAll('.win[data-app="finder"]:not(.closing)').length === 2);
  await win('finder').last().locator('[data-place="Desktop"]').click();
  await page.waitForTimeout(300);
  const first = win('finder').first();
  const titles = (await Promise.all([titleOf(win('finder').first()), titleOf(win('finder').last())])).map(text =>
    text?.trim()
  );
  const zoomedBefore = await boxOf(first);
  await first.locator('.tl .f').dispatchEvent('click');
  await page.waitForTimeout(700);

  const layout = await savedLayout(
    session,
    page,
    saved =>
      saved.windows.filter(item => item.appId === 'finder').length === 2 && saved.windows.some(item => item.zoomed)
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.win[data-app="finder"]:not(.closing)').length === 2);
  await page.waitForTimeout(500);
  const restoredTitles = await Promise.all(
    [0, 1].map(async index => ((await titleOf(win('finder').nth(index))) ?? '').trim())
  );
  result.restoresTwoFinders = layout !== null && (await win('finder').count()) === 2;
  result.twoFindersKeepTheirPaths =
    [...restoredTitles].sort().join() === [...titles].sort().join() && titles[0] !== titles[1];

  const stack = await stackOf(page);
  const viewport = page.viewportSize();
  const zoomedWin = page.locator('.win[data-app="finder"].zoomed:not(.closing)');
  const zoomedBox = (await zoomedWin.count()) === 1 ? await zoomedWin.boundingBox() : null;
  const zoomedId = (await zoomedWin.count()) === 1 ? await zoomedWin.getAttribute('id') : null;
  result.zoomedWindowRestoresZoomed =
    stack.filter(item => item.zoomed).length === 1 &&
    zoomedBox !== null &&
    zoomedBox.x <= 1 &&
    near(zoomedBox.width, viewport.width, 2);
  await zoomedWin.locator('.tl .f').dispatchEvent('click');
  await page.waitForTimeout(700);
  const unzoomed = zoomedId ? await boxOf(page.locator(`#${zoomedId}`)) : null;
  result.zoomedWindowUnzoomsToSavedBox =
    unzoomed !== null &&
    (await page.locator('.win[data-app="finder"].zoomed').count()) === 0 &&
    sameBox(unzoomed, zoomedBefore, 3);
  await page.close();
}

/**
 * AC#3：集成应用恢复 = 重新开窗并重新握手就绪（D-11），透明窗口恢复后由应用收起桌面的标题栏（D-14）。
 * 两种窗口外观各验一次，替身应用顶替线上的 Aiao Code。
 */
async function integratedApp({ session, result, requests }, mode) {
  const label = mode === 'standard' ? 'Standard' : 'Transparent';
  session.aiaoCode.mode = mode;
  const { page, helpers } = await session.openDesktopPage();
  const { win, appears, disappears } = helpers;
  const vscodeWin = win('vscode');
  const ready = vscodeWin.locator('.webapp[data-webapp-state="ready"]');
  /** 应用入口文档的请求（替身自己的脚本不算）：刷新后重新握手意味着入口被重新请求。 */
  const entryRequestsSince = start =>
    requests.slice(start).filter(url => url.startsWith('https://vscode.aiao.io/') && !url.includes('/__standin/'))
      .length;

  await page.locator('#dock .di[data-app="vscode"]').click();
  await appears(ready, 20_000);
  if (mode === 'standard') await dragBy(page, await grabPoint(vscodeWin), 70, 40);
  else {
    /* 透明窗口的拖动区：桌面在应用标题栏上方盖的 [data-webapp-drag]，是主页面里的元素；
     * 不进跨源 iframe 取坐标（Firefox 取不到跨源 iframe 的节点）。 */
    await appears(vscodeWin.locator('[data-webapp-drag]').first(), 10_000);
    const bar = await vscodeWin.locator('[data-webapp-drag]').first().boundingBox();
    await dragBy(page, { x: bar.x + bar.width - 80, y: bar.y + bar.height / 2 }, 70, 40);
  }
  await resizeBy(page, vscodeWin, -120, -80);
  const expected = await boxOf(vscodeWin);
  const layout = await savedLayout(session, page, saved =>
    saved.windows.some(item => item.appId === 'vscode' && sameBox(item.box, expected))
  );

  const mark = requests.length;
  await page.reload({ waitUntil: 'load' });
  await vscodeWin.waitFor({ state: 'attached' });
  const handshook = await appears(ready, 25_000);
  const geometry = layout !== null && sameBox(await boxOf(vscodeWin), expected);
  const again =
    handshook &&
    entryRequestsSince(mark) >= 1 &&
    (await vscodeWin.locator('.webapp[data-webapp-state="failed"]').count()) === 0 &&
    (await vscodeWin.locator('[data-webapp-retry]').count()) === 0;
  result[`integrated${label}RestoresGeometry`] = geometry;
  result[`integrated${label}HandshakesAgain`] = again;
  if (mode === 'transparent')
    result.integratedTransparentHidesDesktopChrome =
      (await disappears(vscodeWin.locator('.tb'), 5_000)) &&
      (await appears(vscodeWin.locator('[data-webapp-drag]'), 5_000));
  session.aiaoCode.mode = 'standard';
  await page.close();
}

/**
 * AC#4 与 AC#9：关掉默认的 Finder，只留 Calculator 与 Notes（Calculator 在前台，创建顺序与层叠顺序故意不一致）。
 * 刷新后关掉的 Finder 不回来、不会多出一个默认的 Finder，两个窗口各就各位，前台与层叠顺序和刷新前一致。
 */
async function closedAndFront({ session, result }) {
  const { page, helpers } = await session.openDesktopPage();
  const { win } = helpers;
  await page.locator('#dock .di[data-app="calculator"]').click();
  await win('calculator').waitFor();
  await page.waitForTimeout(400);
  await page.locator('#dock .di[data-app="notes"]').click();
  await win('notes').waitFor();
  await page.waitForTimeout(400);
  await win('finder').locator('.tl .c').dispatchEvent('click');
  await page.waitForTimeout(500);
  /* 拖一下 Calculator 的标题栏：它被提到最前，层叠顺序变成 Notes（后）、Calculator（前）。 */
  await dragBy(page, await grabPoint(win('calculator')), 420, 0);
  const before = (await stackOf(page)).map(item => item.app);

  const layout = await savedLayout(session, page, saved => appsIn(saved).join() === 'notes,calculator');
  await page.reload({ waitUntil: 'load' });
  await win('calculator').waitFor();
  await win('notes').waitFor();
  await page.waitForTimeout(2_000);
  const after = await stackOf(page);
  const menuName = (await page.locator('#menubar .mb-item.app').textContent())?.trim();

  result.closedWindowStaysClosed = layout !== null && (await win('finder').count()) === 0;
  result.otherWindowsRestoredAfterClose = after.map(item => item.app).join() === 'notes,calculator';
  result.noExtraDefaultFinder = (await page.locator('.win[data-app="finder"]').count()) === 0 && after.length === 2;
  result.frontWindowStaysFront =
    before.at(-1) === 'calculator' &&
    after.at(-1)?.app === 'calculator' &&
    after.at(-1)?.front === true &&
    menuName === 'Calculator';
  result.stackOrderPreserved =
    before.join() === 'notes,calculator' && after.map(item => item.app).join() === before.join();
  await page.close();
}

/**
 * AC#10：布局里只有一个最小化的 Notes。刷新后窗口外框仍是最小化（没有默认 Finder 顶上来），
 * 启动阶段不请求 Notes 的内容载荷；从 Dock 第一次还原时才加载内容。
 */
async function minimizedOnly({ session, result, requests, loadedSince }) {
  const { page, helpers } = await session.openDesktopPage();
  const { win, appears } = helpers;
  await page.locator('#dock .di[data-app="notes"]').click();
  await win('notes').waitFor();
  await page.waitForTimeout(400);
  await win('finder').locator('.tl .c').dispatchEvent('click');
  await page.waitForTimeout(500);
  await win('notes').locator('.tl .m').click();
  await page.waitForTimeout(800);
  const layout = await savedLayout(
    session,
    page,
    saved => appsIn(saved).join() === 'notes' && saved.windows[0].minimized === true
  );

  const mark = requests.length;
  await page.reload({ waitUntil: 'load' });
  await win('notes').waitFor({ state: 'attached' });
  await page.waitForTimeout(2_000);
  result.minimizedFrameOnlyAtStartup =
    layout !== null &&
    !(await win('notes').isVisible()) &&
    (await win('notes').locator('[data-items]').count()) === 0 &&
    (await page.locator('.win[data-app="finder"]').count()) === 0;
  result.minimizedPayloadNotRequestedAtStartup = !loadedSince(mark, 'app-notes');

  const restoreMark = requests.length;
  await page.locator('#dock .di[data-app="notes"]').click();
  result.dockRestoreShowsWindow = await appears(win('notes').locator('[data-items]'), 15_000);
  result.dockRestoreLoadsPayloadFirstTime = loadedSince(restoreMark, 'app-notes') && (await win('notes').isVisible());
  await page.close();
}

/**
 * AC#5：保存的布局里有已下线的应用（清单里没有）。该窗口被跳过并有可见提示，桌面其余正常启动，
 * 恢复后布局里不再留着它；布局里只剩已下线的应用时，打开默认的 Finder。
 */
async function retiredApp({ session, result }) {
  const { page, helpers } = await session.openDesktopPage();
  const { win } = helpers;
  await win('finder').locator('.tl .c').dispatchEvent('click');
  await page.locator('#dock .di[data-app="calculator"]').click();
  await win('calculator').waitFor();
  await page.waitForTimeout(400);
  const saved = await savedLayout(session, page, layout => appsIn(layout).join() === 'calculator');
  const key = await layoutKeyOf(page);
  const calculatorBox = saved?.windows[0]?.box ?? { left: 300, top: 150, width: 254, height: 366 };

  await writeLayout(session, key, {
    version: 1,
    updatedAt: Date.now(),
    windows: [
      record('retired-podcasts-pro', 'Podcasts Pro'),
      record('calculator', 'Calculator', { box: calculatorBox })
    ]
  });
  await recordToasts(page);
  await page.reload({ waitUntil: 'load' });
  await win('calculator').waitFor();
  const noticed = await toastShown(page, 'Podcasts Pro');
  await page.waitForTimeout(1_500);
  const stack = await stackOf(page);
  result.retiredAppSkipped = saved !== null && stack.every(item => item.app === 'calculator') && stack.length === 1;
  result.retiredAppNotice = noticed;
  result.retiredAppOthersRestored =
    sameBox(await boxOf(win('calculator')), calculatorBox) &&
    (await page.locator('#dock .di[data-app="launchpad"]').isVisible()) &&
    (await page.locator('.win[data-app="finder"]').count()) === 0;
  result.retiredWindowDroppedFromLayout =
    (await savedLayout(session, page, layout => appsIn(layout).join() === 'calculator')) !== null;

  /* 只剩已下线的应用：没有任何可恢复的窗口，打开默认的 Finder。 */
  await writeLayout(session, key, {
    version: 1,
    updatedAt: Date.now(),
    windows: [record('retired-podcasts-pro', 'Podcasts Pro')]
  });
  await page.reload({ waitUntil: 'load' });
  result.onlyRetiredOpensDefaultFinder = await win('finder')
    .waitFor()
    .then(
      () => true,
      () => false
    );
  await page.close();
}

/**
 * 开机画面与登录界面盖着桌面的时候（不带 boot=0 的入口）：窗口在后面照常恢复，但提示要等用户登录进了桌面才弹，
 * 否则提示只显示两秒，开机画面还没退场就消失了，用户根本看不到。
 */
async function noticeAfterBoot({ session, result, origin }) {
  const { page, helpers } = await session.openDesktopPage();
  const { win } = helpers;
  await win('finder').locator('.tl .c').dispatchEvent('click');
  await page.locator('#dock .di[data-app="calculator"]').click();
  await win('calculator').waitFor();
  await page.waitForTimeout(400);
  const saved = await savedLayout(session, page, layout => appsIn(layout).join() === 'calculator');
  const key = await layoutKeyOf(page);
  await writeLayout(session, key, {
    version: 1,
    updatedAt: Date.now(),
    windows: [
      record('retired-podcasts-pro', 'Podcasts Pro'),
      record('calculator', 'Calculator', { box: saved?.windows[0]?.box ?? record('x', 'x').box })
    ]
  });

  await recordToasts(page);
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => {
      const lock = document.querySelector('#lock');
      return lock instanceof HTMLElement && !lock.hidden && lock.dataset['on'] === '1';
    },
    undefined,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(1_000);
  const restoredBehind = await win('calculator')
    .waitFor({ state: 'attached', timeout: 10_000 })
    .then(
      () => true,
      () => false
    );
  const earlyToasts = await page.evaluate(() => window['__toasts'] ?? []);
  result.restoreRunsBehindBootScreen = saved !== null && restoredBehind;

  await page.locator('#lock').click();
  result.noticeWaitsForUnlockedDesktop =
    earlyToasts.every(text => !text.includes('Podcasts Pro')) && (await toastShown(page, 'Podcasts Pro'));
  await page.close();
}

/**
 * AC#6：窗口拖到屏幕右下角边缘，视口变小后刷新，恢复的窗口被拉回屏幕内（复用 keepOnScreen 的规则：
 * 左边缘至少 120px、上沿不进菜单栏、下沿至少 40px 留在视口内）。视口在页面离开桌面期间改小，
 * 这样布局里存的还是“拖在边缘”的位置，恢复时才是恢复在做拉回，而不是页面实时的窗口修正。
 */
async function shrunkViewport({ session, result, origin }) {
  const { page, helpers } = await session.openDesktopPage();
  const { win } = helpers;
  const finder = win('finder').last();
  const initial = await boxOf(finder);
  const grab = await grabPoint(finder);
  grab.x = initial.left + 100;
  await dragBy(page, grab, 1200 - initial.left, 700 - initial.top);
  const edge = await boxOf(finder);
  const layout = await savedLayout(session, page, saved =>
    saved.windows.some(item => item.appId === 'finder' && item.box.left >= 1100)
  );
  result.farWindowWasSaved = layout !== null && edge.left >= 1100;

  await page.goto('about:blank');
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
  await win('finder').waitFor();
  await page.waitForTimeout(500);
  const pulled = await boxOf(win('finder').last());
  /* 左边缘正好拉到 视口宽 - 120；上沿落在视口内（下沿至少留 40px）。默认位置的 Finder（left 约 160）过不了这条。 */
  result.restoredWindowPulledOnScreen =
    near(pulled.left, 800 - 120, 1) && pulled.top >= 400 && pulled.top <= 600 - 40 && pulled.width === edge.width;
  await page.close();
}

/**
 * AC#8：同一浏览器上下文里的两个页面（多页夹具）。A 摆 Finder 与 Notes，B 只摆 Calculator；先刷新 A 再刷新 B，
 * 各自只恢复自己的窗口，库里是各自的布局行，互不覆盖；新开的标签页从空桌面开始，不继承别人的布局。
 */
async function separateTabs({ session, result, origin }) {
  const [pageA, pageB] = await openPages(session.context, 2);
  for (const page of [pageA, pageB]) session.observePage(page);
  const url = `${origin}/?boot=0`;
  const helpersA = createHelpers(pageA);
  const helpersB = createHelpers(pageB);
  await pageA.goto(url, { waitUntil: 'load' });
  await helpersA.win('finder').waitFor();
  await pageB.goto(url, { waitUntil: 'load' });
  await helpersB.win('finder').waitFor();

  await pageA.locator('#dock .di[data-app="notes"]').click();
  await helpersA.win('notes').waitFor();
  await helpersB.win('finder').locator('.tl .c').dispatchEvent('click');
  await pageB.locator('#dock .di[data-app="calculator"]').click();
  await helpersB.win('calculator').waitFor();
  const layoutA = await savedLayout(session, pageA, saved => appsIn(saved).sort().join() === 'finder,notes');
  const layoutB = await savedLayout(session, pageB, saved => appsIn(saved).join() === 'calculator');
  const keyA = await layoutKeyOf(pageA);
  const keyB = await layoutKeyOf(pageB);

  await pageA.reload({ waitUntil: 'load' });
  await helpersA.win('finder').waitFor();
  await helpersA.win('notes').waitFor();
  await pageA.waitForTimeout(1_500);
  const stackA = (await stackOf(pageA)).map(item => item.app).sort();
  await pageB.reload({ waitUntil: 'load' });
  await helpersB.win('calculator').waitFor();
  await pageB.waitForTimeout(2_000);
  const stackB = (await stackOf(pageB)).map(item => item.app).sort();
  result.tabAKeepsOnlyItsWindows = layoutA !== null && stackA.join() === 'finder,notes';
  result.tabBKeepsOnlyItsWindows = layoutB !== null && stackB.join() === 'calculator';

  const rows = await surgery(session, readLayouts);
  result.layoutsStoredPerTab =
    keyA !== keyB &&
    appsIn(rows[keyA] ?? { windows: [] })
      .sort()
      .join() === 'finder,notes' &&
    appsIn(rows[keyB] ?? { windows: [] }).join() === 'calculator';
  /* B 刷新、A 也刷新过之后，A 的行没被覆盖成 B 的内容（反之亦然）。 */
  await pageA.reload({ waitUntil: 'load' });
  await helpersA.win('finder').waitFor();
  await pageA.waitForTimeout(1_000);
  const rowsAfter = await surgery(session, readLayouts);
  result.reloadDoesNotOverwriteOtherTab =
    appsIn(rowsAfter[keyB] ?? { windows: [] }).join() === 'calculator' &&
    appsIn(rowsAfter[keyA] ?? { windows: [] })
      .sort()
      .join() === 'finder,notes';

  const [pageC] = await openPages(session.context, 1);
  session.observePage(pageC);
  await pageC.goto(url, { waitUntil: 'load' });
  await createHelpers(pageC).win('finder').waitFor();
  await pageC.waitForTimeout(1_500);
  result.newTabStartsFromEmptyDesktop = (await stackOf(pageC)).map(item => item.app).join() === 'finder';
  await Promise.all([pageA.close(), pageB.close(), pageC.close()]);
}

/**
 * 遗留行的清理：关掉的标签页留下布局行，新页面启动时顺手清掉其他标签页超过 30 天没更新的行；
 * 近期的行留着。过期与近期的行都是先让真实页面写出来，再把写入时间改到过去。
 */
async function pruneStaleRows({ session, result }) {
  const keys = {};
  for (const name of ['stale', 'recent']) {
    const { page } = await session.openDesktopPage();
    await savedLayout(session, page, layout => appsIn(layout).join() === 'finder');
    keys[name] = await layoutKeyOf(page);
    await page.close();
  }
  await writeLayout(session, keys.stale, { version: 1, updatedAt: Date.now() - 40 * DAY, windows: [] });
  await writeLayout(session, keys.recent, { version: 1, updatedAt: Date.now() - 2 * DAY, windows: [] });

  const { page } = await session.openDesktopPage();
  const rows = await surgery(session, async db => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const found = await readLayouts(db);
      if (!(keys.stale in found) || Date.now() > deadline) return found;
      await pause(300);
    }
  });
  result.staleRowsPruned = !(keys.stale in rows);
  result.recentRowsKept = keys.recent in rows;
  await page.close();
}

/**
 * 会话存储取不到（浏览器禁用站点数据）：布局保存停用，不退回共享的键，桌面可见后提示一次；桌面照常启动，默认打开 Finder。
 */
async function blockedStorage({ session, result, origin }) {
  const before = await surgery(session, readLayouts);
  const page = await session.openPage();
  await recordToasts(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      }
    });
  });
  await page.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
  const helpers = createHelpers(page);
  result.blockedStorageStillOpensFinder = await helpers
    .win('finder')
    .waitFor()
    .then(
      () => true,
      () => false
    );
  result.blockedStorageNotice = await toastShown(page, 'won’t be remembered');
  await page.locator('#dock .di[data-app="calculator"]').click();
  await helpers.win('calculator').waitFor();
  await page.waitForTimeout(1_500);
  const after = await surgery(session, readLayouts);
  result.blockedStorageWritesNothing = Object.keys(after).sort().join() === Object.keys(before).sort().join();
  await page.close();
}
