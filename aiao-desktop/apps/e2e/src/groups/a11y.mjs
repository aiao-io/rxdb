import AxeBuilder from '@axe-core/playwright';

import {
  brief,
  eventually,
  exposedSvgs,
  focusInfo,
  focusReaches,
  missingInOrder,
  missingNamesInOrder,
  pressUntil,
  tabWalk,
  unnamedControls,
  until
} from '../harness/a11y.mjs';

/** 菜单栏左侧：Apple 菜单、前台应用名、Finder 的其余菜单（窗口里是 Finder 时）。 */
const FINDER_MENUS = ['Apple', 'Finder', 'File', 'Edit', 'View', 'Go', 'Window', 'Help'];
/** 菜单栏右侧状态图标名称的开头，屏幕上从左到右。 */
const STATUS_PREFIXES = ['Bluetooth', 'Sound', 'Battery', 'Wi-Fi', 'Spotlight', 'Control Centre'];
const CLOCK = /\d{1,2}:\d{2}/;

const sameList = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected) ?
    []
  : [`实际 ${actual.join(' | ')}`, `期望 ${expected.join(' | ')}`];

/** 一次检查的问题清单：空数组表示通过（冒烟把非空数组当失败并原样打印，定位时不用重跑）。 */
const problems = (...found) => found.flat().filter(Boolean);

/** 连续相同的区域折叠成一个：menubar×15, window×30 → menubar, window。 */
const collapse = list => list.filter((item, index) => index === 0 || item !== list[index - 1]);

/** 把顺序焦点导航的起点放回文档开头（页面刚加载时就在那里）：之后的第一个 Tab 落在文档里的第一个可聚焦元素上。 */
const focusDocumentStart = page =>
  page.evaluate(() => {
    document.activeElement?.blur();
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute('tabindex');
  });

/** 本检查组的全部检查项键（每个检查项的值是问题清单，空数组表示通过）。 */
const KEYS = [
  'a11y.tabPath.startsInMenubar',
  'a11y.tabPath.menubarOrder',
  'a11y.tabPath.windowBetweenMenubarAndDock',
  'a11y.tabPath.dockOrder',
  'a11y.tabPath.desktopAfterDock',
  'a11y.tabPath.regionsInVisibleOrder',
  'a11y.tabPath.noInvisibleStops',
  'a11y.tabPath.doesNotTrap',
  'a11y.tabPath.shiftTabReverses',
  'a11y.tabPath.focusRingOnlyForKeyboard',
  'a11y.tabPath.enterAndSpaceActivate',
  'a11y.overlays.launchpadOpensByEnter',
  'a11y.overlays.launchpadTabStaysInside',
  'a11y.overlays.launchpadSpaceLaunches',
  'a11y.overlays.launchpadEscapeRestoresFocus',
  'a11y.overlays.spotlightOpensByEnter',
  'a11y.overlays.spotlightComboboxState',
  'a11y.overlays.spotlightTabStaysInside',
  'a11y.overlays.spotlightEnterOpensApp',
  'a11y.overlays.spotlightEscapeRestoresFocus',
  'a11y.overlays.panelOpensBySpace',
  'a11y.overlays.panelTabStaysInside',
  'a11y.overlays.panelSwitchToggles',
  'a11y.overlays.panelEscapeRestoresFocus',
  'a11y.menus.menubarRoles',
  'a11y.menus.arrowKeysMoveBetweenTitles',
  'a11y.menus.expandKeys',
  'a11y.menus.arrowsMoveInsideMenu',
  'a11y.menus.typeaheadJumps',
  'a11y.menus.leftRightSwitchMenus',
  'a11y.menus.escapeRestoresFocus',
  'a11y.menus.tabClosesMenu',
  'a11y.menus.checkedItemRole',
  'a11y.menus.keyboardOnlyFlow.opensFinder',
  'a11y.menus.keyboardOnlyFlow.opensGoMenu',
  'a11y.menus.keyboardOnlyFlow.changesDirectory',
  'a11y.menus.keyboardOnlyFlow.closesWindow',
  'a11y.windows.dialogsNamedByTitle',
  'a11y.windows.backgroundHidden',
  'a11y.windows.menubarShowsFrontApp',
  'a11y.windows.openMovesFocusIn',
  'a11y.windows.cycleSwitchesFocusAndFront',
  'a11y.windows.minimizeHandsFocusToNext',
  'a11y.windows.restoreFromDockByKeyboard',
  'a11y.windows.closeHandsFocusOver',
  'a11y.windows.lastCloseFocusesDockIcon',
  'a11y.windows.tabIntoBackgroundRaises',
  'a11y.finder.listboxRoles',
  'a11y.finder.arrowKeysMoveSelection',
  'a11y.finder.enterOpensFolderKeepsFocus',
  'a11y.finder.backspaceGoesUp',
  'a11y.finder.commandUpGoesUp',
  'a11y.finder.listViewArrows',
  'a11y.finder.columnViewArrows',
  'a11y.tree.finderWindow',
  'a11y.tree.dock',
  'a11y.tree.dockRunningState',
  'a11y.tree.menuItems',
  'a11y.tree.launchpad',
  'a11y.tree.spotlight',
  'a11y.tree.updatesWhenWindowsOpenAndClose',
  'a11y.tree.everyControlNamed',
  'a11y.tree.decorativeSvgHidden',
  'a11y.axe.noViolations'
];

/** 按点分路径往嵌套对象里写值。 */
function setPath(target, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  const holder = parts.reduce((node, part) => (node[part] ??= {}), target);
  holder[last] = value;
}

const getPath = (target, path) => path.split('.').reduce((node, part) => node?.[part], target);

/**
 * 跑一节检查。某一步抛错（等不到元素、超时）不会拖垮后面的小节：这一节里还没出结果的检查项记为未通过，
 * 并写明出错的位置与原因；已经出了结果的照常保留。出错不会被吞掉——它就是失败的检查项。
 */
async function guarded(section, target, task) {
  try {
    await task();
  } catch (error) {
    const prefix = `a11y.${section}.`;
    const message = `${section} 检查中途出错：${String(error.message).split('\n')[0]}（${error.stack?.match(/(groups\/a11y\.mjs:\d+)/)?.[1] ?? '?'}）`;
    for (const key of KEYS.filter(item => item.startsWith(prefix)).map(item => item.slice(prefix.length)))
      if (getPath(target, key) === undefined) setPath(target, key, [message]);
  }
}

/**
 * 无障碍与纯键盘路径（ADESK-US-108）：对正式构建，用 Playwright 的 `getByRole` / `ariaSnapshot` 断言无障碍树里的角色与名称，
 * 用 `page.keyboard` 走 Tab / Shift+Tab / Enter / 空格 / 方向键 / Esc / ⌘W / ⌘M / ⌘` 的纯键盘路径。
 *
 * 说明：`ariaSnapshot` 与 `getByRole` 的角色、名称是 Playwright 按 DOM 与 ARIA 属性算的（三个引擎算法一致），不是各引擎
 * 原生无障碍树；原生树里读屏到底播报什么，由本机的 VoiceOver 实测清单（apps/e2e/VOICEOVER.md）补充。
 */
export const a11y = {
  name: 'a11y',
  description: '无障碍：Tab 路径与焦点环、浮层焦点陷阱、菜单与窗口的纯键盘操作、Finder 键盘导航、无障碍树的角色与名称',
  keys: KEYS,
  async run(session) {
    const { page } = session;
    const { win, appears, disappears } = session.helpers;
    const press = key => page.keyboard.press(key);
    const active = () => focusInfo(page);
    const is = (info, region, name) => info?.region === region && info.name === name;
    const isDockIcon = name => info => info.region === 'dock' && info.name === name;
    /** 纯键盘走到某个元素：从当前位置一路按 Tab（或 Shift+Tab）直到焦点落在它上面。 */
    const tabTo = (predicate, key = 'Tab') => pressUntil(page, predicate, { key });
    /** 窗口（含正在关闭的）按无障碍属性的描述：应用、名称、是否对读屏隐藏。 */
    const windowStates = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.win:not(.closing)')].map(node => ({
          app: node.getAttribute('data-app'),
          name: node.getAttribute('aria-label'),
          hidden: node.getAttribute('aria-hidden') === 'true'
        }))
      );
    /** 读屏看得到的对话框（窗口）名称：前台窗口只有一个。 */
    const visibleDialogs = async () => {
      const names = await Promise.all(
        (await page.getByRole('dialog').all()).map(dialog =>
          dialog.evaluate(node => (node.classList.contains('win') ? node.getAttribute('aria-label') : null))
        )
      );
      return names.filter(name => name !== null);
    };
    /** 读屏看得到的窗口名称随渲染到位：轮询到等于 `expected`（或超时），返回与期望的差异（空数组表示一致）。 */
    const dialogsSettle = async expected => {
      let last = [];
      await eventually(
        async () => {
          last = await visibleDialogs();
          return sameList(last, expected).length === 0;
        },
        { timeout: 4_000 }
      );
      return sameList(last, expected);
    };
    const menubarFirstApp = async () =>
      page
        .locator('#menubar .mb-item.app')
        .textContent()
        .then(text => text?.trim());
    const snapshot = (selector, options) => page.locator(selector).first().ariaSnapshot(options);
    const reset = async () => {
      await session.reloadDesktop();
      await page.locator('.win[data-app="finder"] [role="option"]').first().waitFor({ timeout: 15_000 });
      await focusDocumentStart(page);
    };
    /** 键盘（Enter）打开一个应用：Tab 走到它的 Dock 图标再按 Enter，等窗口出现。 */
    const openFromDock = async (name, app) => {
      await focusDocumentStart(page);
      const { found } = await tabTo(isDockIcon(name));
      if (!found) return false;
      await press('Enter');
      return appears(win(app), 15_000);
    };

    const tabPath = {};
    const overlays = {};
    const menus = {};
    const windows = {};
    const finder = {};
    const tree = {};
    const axeResult = {};
    const inside = region => info => info !== null && info !== undefined && region === info.region;
    await session.openDesktop();

    /* ==== AC#1 Tab 路径：菜单栏 → 窗口 → Dock → 桌面图标 ==== */
    await guarded('tabPath', tabPath, async () => {
      await reset();
      await tabTo(info => info.role === 'option');
      await until(page, () => document.activeElement?.getAttribute('aria-selected') === 'true');
      await focusDocumentStart(page);
      const forward = await tabWalk(page);
      const stops = forward.stops;
      const bar = stops.filter(stop => stop.region === 'menubar');
      const windowStops = stops.filter(stop => stop.region === 'window');
      const dockStops = stops.filter(stop => stop.region === 'dock');
      const desktopStops = stops.filter(stop => stop.region === 'desktop');
      const dockNames = await page.evaluate(() =>
        [...document.querySelectorAll('#dock .di')].map(node => node.getAttribute('aria-label'))
      );
      const desktopNames = await page.evaluate(() =>
        [...document.querySelectorAll('#desktop .dicon')].map(node => node.textContent?.trim())
      );
      const ascending = list => list.every((stop, index) => index === 0 || stop.x > list[index - 1].x);
      tabPath.startsInMenubar = problems(
        stops[0] ? [] : ['没有任何停靠点'],
        is(stops[0], 'menubar', 'Apple') ? [] : [`第一个停靠点应是菜单栏的 Apple，实际 ${brief(stops[0])}`]
      );
      tabPath.menubarOrder = problems(
        sameList(
          bar.slice(0, FINDER_MENUS.length).map(stop => stop.name),
          FINDER_MENUS
        ),
        STATUS_PREFIXES.flatMap((prefix, index) => {
          const stop = bar[FINDER_MENUS.length + index];
          return stop?.name.startsWith(prefix) ?
              []
            : [`第 ${FINDER_MENUS.length + index + 1} 个菜单栏停靠点应以 ${prefix} 开头，实际 ${stop?.name}`];
        }),
        CLOCK.test(bar.at(-1)?.name ?? '') ? [] : [`最后一个菜单栏停靠点应是时钟，实际 ${bar.at(-1)?.name}`],
        bar.length === FINDER_MENUS.length + STATUS_PREFIXES.length + 1 ?
          []
        : [`菜单栏停靠点 ${bar.length} 个，期望 15`],
        ascending(bar) ? [] : ['菜单栏的停靠点不是从左到右']
      );
      const windowNames = windowStops.map(stop => stop.name);
      tabPath.windowBetweenMenubarAndDock = problems(
        windowStops.length >= 12 ? [] : [`窗口里只有 ${windowStops.length} 个停靠点`],
        windowStops.every(stop => stop.app === 'finder') ? [] : ['窗口停靠点不都在 Finder 里'],
        missingNamesInOrder(windowNames, [
          'Close',
          'Minimize',
          'Zoom',
          'Back',
          'Forward',
          'Icons',
          'List',
          'Columns',
          'Gallery',
          'Sort',
          'Share',
          'More',
          'Search'
        ]).map(name => `窗口停靠点里缺少或顺序不对：${name}`),
        windowStops.some(stop => stop.role === 'option') ? [] : ['窗口里没有停靠到内容区的条目（listbox 的 option）'],
        windowStops.some(stop => stop.tag === 'button' && stop.name === 'Macintosh HD') ?
          []
        : ['窗口里没有停靠到路径栏']
      );
      tabPath.dockOrder = problems(
        sameList(
          dockStops.map(stop => stop.name),
          dockNames
        ),
        ascending(dockStops) ? [] : ['Dock 的停靠点不是从左到右']
      );
      tabPath.desktopAfterDock = problems(
        desktopStops.length === desktopNames.length && desktopNames.length >= 5 ?
          []
        : [`桌面图标停靠点 ${desktopStops.length} 个，桌面上有 ${desktopNames.length} 个`]
      );
      tabPath.regionsInVisibleOrder = sameList(collapse(stops.map(stop => stop.region)), [
        'menubar',
        'window',
        'dock',
        'desktop'
      ]);
      tabPath.noInvisibleStops = problems(
        stops.filter(stop => !stop.visible).map(stop => `不可见的停靠点：${brief(stop)}`),
        stops.filter(stop => stop.hiddenByAria).map(stop => `落在对读屏隐藏的元素上：${brief(stop)}`)
      );
      tabPath.doesNotTrap =
        forward.ended === 'left' || forward.ended === 'wrapped' ?
          []
        : [`Tab 走了 ${stops.length} 次仍没有离开或绕回（${forward.ended}）`];

      /* 反向：从最后一个停靠点（最后一个桌面图标）一路 Shift+Tab，经过的停靠点与正向一模一样、顺序相反。 */
      await page.locator('#desktop .dicon').last().focus();
      const backward = await tabWalk(page, { key: 'Shift+Tab' });
      /* 菜单栏时钟的名称是当前时间，两次走查之间可能跳了一分钟：按「时钟」比，不按文字比。 */
      const label = stop =>
        `${stop.region}:${stop.region === 'menubar' && CLOCK.test(stop.name) ? '<clock>' : stop.name}`;
      const reversed = [...backward.stops].reverse().map(label);
      const expectedReverse = stops.slice(0, -1).map(label);
      tabPath.shiftTabReverses = problems(
        sameList(reversed, expectedReverse),
        backward.ended === 'left' || backward.ended === 'wrapped' ? [] : ['Shift+Tab 没有走出文档']
      );

      /* 焦点环：键盘聚焦时 :focus-visible 成立、有可见的环；鼠标点击不出现。 */
      await focusDocumentStart(page);
      const goStop = (await tabTo(info => is(info, 'menubar', 'Go'))).stops.at(-1);
      const backStop = (await tabTo(info => is(info, 'window', 'Back'))).stops.at(-1);
      const dockRing = await (async () => {
        await focusDocumentStart(page);
        await tabTo(isDockIcon('Finder'));
        return page.evaluate(() => {
          const art = document.activeElement?.querySelector('.art');
          return art ? getComputedStyle(art).outlineStyle : 'none';
        });
      })();
      await page.locator('.win[data-app="finder"] [data-view="list"]').click();
      const afterMouse = await active();
      tabPath.focusRingOnlyForKeyboard = problems(
        stops.filter(stop => !stop.focusVisible).map(stop => `键盘聚焦时 :focus-visible 不成立：${brief(stop)}`),
        goStop && goStop.outline.startsWith('solid') ? [] : [`菜单栏标题聚焦时没有焦点环：${goStop?.outline}`],
        backStop && backStop.outline.startsWith('solid') ? [] : [`工具栏按钮聚焦时没有焦点环：${backStop?.outline}`],
        dockRing === 'solid' ? [] : [`Dock 图标聚焦时没有焦点环：${dockRing}`],
        afterMouse?.focusVisible ? [`鼠标点击之后 :focus-visible 仍成立：${brief(afterMouse)}`] : []
      );
      await page.locator('.win[data-app="finder"] [data-view="icon"]').click();

      /* Enter / 空格触发与鼠标点击相同的动作：Space 切到列表视图，Enter 切回图标视图。 */
      await focusDocumentStart(page);
      await tabTo(info => is(info, 'window', 'List'));
      await press('Space');
      const listOn = await until(
        page,
        () =>
          document.querySelector('.win[data-app="finder"] [data-view="list"]')?.getAttribute('aria-pressed') === 'true'
      );
      await focusDocumentStart(page);
      await tabTo(info => is(info, 'window', 'Icons'));
      await press('Enter');
      const iconsOn = await until(
        page,
        () =>
          document.querySelector('.win[data-app="finder"] [data-view="icon"]')?.getAttribute('aria-pressed') === 'true'
      );
      tabPath.enterAndSpaceActivate = problems(
        listOn ? [] : ['在「List」按钮上按空格没有切到列表视图'],
        iconsOn ? [] : ['在「Icons」按钮上按 Enter 没有切回图标视图']
      );
    });

    /* ==== 浮层：启动台、聚焦搜索、状态面板的焦点进出与陷阱 ==== */
    await guarded('overlays', overlays, async () => {
      await reset();

      /* 启动台 */
      await tabTo(isDockIcon('Launchpad'));
      await press('Enter');
      const launchpadOpen = await appears(page.locator('#lpad:not(.out) [data-lq]'), 8_000);
      const inLaunchpad = await focusReaches(page, inside('launchpad'));
      overlays.launchpadOpensByEnter = problems(
        launchpadOpen ? [] : ['在 Dock 的启动台图标上按 Enter 没有打开启动台'],
        inLaunchpad ? [] : [`启动台打开后焦点没有进入它：${brief(await active())}`]
      );
      const tabbed = [];
      for (let step = 0; step < 36; step++) {
        await press('Tab');
        tabbed.push(await active());
      }
      for (let step = 0; step < 4; step++) {
        await press('Shift+Tab');
        tabbed.push(await active());
      }
      overlays.launchpadTabStaysInside = problems(
        tabbed.filter(info => info?.region !== 'launchpad').map(info => `Tab 漏出了启动台：${brief(info)}`)
      );
      /* 搜索、Tab 到唯一的一个图标，空格启动它；启动台关闭，应用窗口打开。 */
      await page.locator('#lpad [data-lq]').focus();
      await page.keyboard.type('Notes');
      await page.waitForFunction(() => document.querySelectorAll('#lpad .app').length === 1, undefined, {
        timeout: 5_000
      });
      await press('Tab');
      const tileFocused = (await active())?.name === 'Notes';
      await press('Space');
      const launched = await appears(win('notes'), 15_000);
      const closed = await disappears(page.locator('#lpad'), 5_000);
      overlays.launchpadSpaceLaunches = problems(
        tileFocused ? [] : ['Tab 没有走到搜索结果里的 Notes 图标'],
        launched && closed ? [] : ['在图标上按空格没有关闭启动台并打开 Notes']
      );
      await reset();
      await tabTo(isDockIcon('Launchpad'));
      await press('Enter');
      await appears(page.locator('#lpad:not(.out) [data-lq]'), 8_000);
      await press('Escape');
      const lpadGone = await disappears(page.locator('#lpad'), 5_000);
      const backOnIcon = await focusReaches(page, isDockIcon('Launchpad'));
      overlays.launchpadEscapeRestoresFocus = problems(
        lpadGone ? [] : ['Esc 没有关闭启动台'],
        backOnIcon ? [] : [`Esc 之后焦点没有回到 Dock 的启动台图标：${brief(await active())}`]
      );

      /* 聚焦搜索：从菜单栏的 Spotlight 图标打开 */
      await reset();
      await tabTo(info => info.region === 'menubar' && info.name === 'Spotlight');
      await press('Enter');
      const spotOpen = await appears(page.locator('#spot:not(.out) [data-sq]'), 8_000);
      const inSpot = await focusReaches(page, inside('spotlight'));
      overlays.spotlightOpensByEnter = problems(
        spotOpen ? [] : ['在菜单栏的 Spotlight 图标上按 Enter 没有打开聚焦搜索'],
        inSpot ? [] : [`聚焦搜索打开后焦点没有进入输入框：${brief(await active())}`]
      );
      await page.keyboard.type('Cal');
      await page.waitForFunction(() => document.querySelectorAll('#spot [role="option"]').length >= 2, undefined, {
        timeout: 8_000
      });
      const comboState = () =>
        page.evaluate(() => {
          const input = document.querySelector('#spot [data-sq]');
          const id = input?.getAttribute('aria-activedescendant');
          const option = id ? document.getElementById(id) : null;
          return {
            activeId: id,
            role: input?.getAttribute('role'),
            expanded: input?.getAttribute('aria-expanded'),
            controls: input?.getAttribute('aria-controls'),
            listbox: document.getElementById(input?.getAttribute('aria-controls') ?? '')?.getAttribute('role') ?? null,
            selected: option?.getAttribute('aria-selected') ?? null,
            optionName: option?.getAttribute('aria-label') ?? null,
            focusStaysInInput: document.activeElement === input,
            options: document.querySelectorAll('#spot [role="option"]').length
          };
        });
      const first = await comboState();
      await press('ArrowDown');
      await until(
        page,
        previous => document.querySelector('#spot [data-sq]')?.getAttribute('aria-activedescendant') !== previous,
        first.activeId,
        3_000
      );
      const second = await comboState();
      overlays.spotlightComboboxState = problems(
        first.role === 'combobox' ? [] : [`输入框的角色是 ${first.role}`],
        first.expanded === 'true' ? [] : ['有结果时 aria-expanded 不是 true'],
        first.listbox === 'listbox' ? [] : ['aria-controls 指向的不是 listbox'],
        first.selected === 'true' && first.optionName ? [] : ['aria-activedescendant 没有指向选中的结果'],
        first.focusStaysInInput && second.focusStaysInInput ?
          []
        : ['方向键把焦点移出了输入框（应该靠 aria-activedescendant）'],
        second.optionName && second.optionName !== first.optionName ? [] : ['按 ArrowDown 之后当前项没有变化']
      );
      const spotTabs = [];
      for (let step = 0; step < 3; step++) {
        await press('Tab');
        spotTabs.push(await active());
      }
      await press('Shift+Tab');
      spotTabs.push(await active());
      overlays.spotlightTabStaysInside = problems(
        spotTabs.filter(info => info?.region !== 'spotlight').map(info => `Tab 漏出了聚焦搜索：${brief(info)}`)
      );
      await press('Escape');
      const spotGone = await disappears(page.locator('#spot'), 5_000);
      const backOnSpotButton = await focusReaches(page, info => info.region === 'menubar' && info.name === 'Spotlight');
      overlays.spotlightEscapeRestoresFocus = problems(
        spotGone ? [] : ['Esc 没有关闭聚焦搜索'],
        backOnSpotButton ? [] : [`Esc 之后焦点没有回到菜单栏的 Spotlight 图标：${brief(await active())}`]
      );
      /* 键盘选中结果、Enter 打开：搜 Calculator，打开后焦点进新窗口。 */
      await press('Enter');
      await appears(page.locator('#spot:not(.out) [data-sq]'), 8_000);
      await focusReaches(page, inside('spotlight'));
      await page.keyboard.type('Calculator');
      await page.waitForFunction(
        () => document.querySelector('#spot [role="option"][aria-selected="true"]'),
        undefined,
        { timeout: 8_000 }
      );
      await press('Enter');
      const calculatorOpened = await appears(win('calculator'), 15_000);
      const focusInCalculator = await focusReaches(page, info => info.region === 'window' && info.app === 'calculator');
      overlays.spotlightEnterOpensApp = problems(
        calculatorOpened ? [] : ['在聚焦搜索里选中 Calculator 按 Enter 没有打开它'],
        focusInCalculator ? [] : [`打开应用之后焦点没有进入新窗口：${brief(await active())}`]
      );

      /* 状态面板：Wi-Fi 面板用空格打开、Tab 只在面板里循环、开关用空格切换、Esc 关闭并回到图标。 */
      await reset();
      await tabTo(info => info.region === 'menubar' && info.name.startsWith('Wi-Fi'));
      await press('Space');
      const wifiPanel = page.locator('app-wifi-panel');
      const panelOpen = await appears(wifiPanel, 5_000);
      const inPanel = await focusReaches(page, info => info.region === 'popover');
      overlays.panelOpensBySpace = problems(
        panelOpen ? [] : ['在 Wi-Fi 图标上按空格没有打开面板'],
        inPanel ? [] : [`面板打开后焦点没有进入面板：${brief(await active())}`],
        (await page.getByRole('dialog', { name: 'Wi-Fi' }).count()) === 1 ? [] : ['面板不是名叫 Wi-Fi 的 dialog']
      );
      const panelTabs = [];
      for (let step = 0; step < 8; step++) {
        await press('Tab');
        panelTabs.push(await active());
      }
      await press('Shift+Tab');
      panelTabs.push(await active());
      overlays.panelTabStaysInside = problems(
        panelTabs.filter(info => info?.region !== 'popover').map(info => `Tab 漏出了面板：${brief(info)}`),
        new Set(panelTabs.map(brief)).size >= 4 ? [] : ['面板里 Tab 没有走遍它的控件']
      );
      await tabTo(info => info.role === 'switch' && info.name === 'Wi-Fi');
      const wifiBefore = await page.locator('app-wifi-panel [role="switch"]').getAttribute('aria-checked');
      await press('Space');
      const wifiAfter = await until(
        page,
        before => document.querySelector('app-wifi-panel [role="switch"]')?.getAttribute('aria-checked') !== before,
        wifiBefore,
        3_000
      );
      await press('Space');
      overlays.panelSwitchToggles = wifiAfter ? [] : ['在开关上按空格没有切换 Wi-Fi'];
      await press('Escape');
      const panelGone = await disappears(wifiPanel, 5_000);
      const backOnWifi = await focusReaches(page, info => info.region === 'menubar' && info.name.startsWith('Wi-Fi'));
      overlays.panelEscapeRestoresFocus = problems(
        panelGone ? [] : ['Esc 没有关闭面板'],
        backOnWifi ? [] : [`Esc 之后焦点没有回到菜单栏的 Wi-Fi 图标：${brief(await active())}`]
      );
    });

    /* ==== AC#2 菜单栏与菜单的键盘操作 ==== */
    await guarded('menus', menus, async () => {
      await reset();
      const barSnapshot = await snapshot('#menubar');
      menus.menubarRoles = problems(
        missingInOrder(barSnapshot, [
          '- menubar "Menu bar":',
          '- menuitem "Apple"',
          '- menuitem "Finder"',
          '- menuitem "File"',
          '- menuitem "Edit"',
          '- menuitem "View"',
          '- menuitem "Go"',
          '- menuitem "Window"',
          '- menuitem "Help"',
          '- toolbar "Status menus":'
        ]).map(fragment => `菜单栏的无障碍树里缺少或顺序不对：${fragment}`),
        (await page.locator('#menubar [aria-haspopup="menu"]').count()) === FINDER_MENUS.length ?
          []
        : ['菜单标题没有都带 aria-haspopup="menu"']
      );
      await tabTo(info => is(info, 'menubar', 'Finder'));
      const arrowSeen = [];
      for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'ArrowRight', 'Home', 'ArrowLeft']) {
        await press(key);
        arrowSeen.push((await active())?.name);
      }
      menus.arrowKeysMoveBetweenTitles = sameList(arrowSeen, [
        'File',
        'Edit',
        'File',
        'Help',
        'Apple',
        'Apple',
        'Help'
      ]);

      /* 展开：Enter、空格、向下方向键聚焦第一项，向上方向键聚焦最后一项；aria-expanded 跟着变。 */
      const expandProblems = [];
      const goButton = page.getByRole('menuitem', { name: 'Go', exact: true });
      const focusGo = async () => {
        await focusDocumentStart(page);
        await tabTo(info => is(info, 'menubar', 'Go'));
      };
      for (const [key, expected] of [
        ['Enter', 'Recents'],
        ['Space', 'Recents'],
        ['ArrowDown', 'Recents'],
        ['ArrowUp', 'Applications']
      ]) {
        await focusGo();
        await press(key);
        const opened = await appears(page.locator('#layer-menu [role="menu"]'), 5_000);
        const landed = await focusReaches(
          page,
          info => info.region === 'popover' && info.role === 'menuitem' && info.name.startsWith(expected)
        );
        const expanded = await goButton.getAttribute('aria-expanded');
        if (!opened) expandProblems.push(`${key}：没有展开「Go」菜单`);
        else if (!landed) expandProblems.push(`${key}：焦点应在「${expected}」上，实际 ${brief(await active())}`);
        if (expanded !== 'true') expandProblems.push(`${key}：展开后 aria-expanded 是 ${expanded}`);
        await press('Escape');
        await disappears(page.locator('#layer-menu [role="menu"]'), 3_000);
      }
      menus.expandKeys = expandProblems;

      /* 菜单里：上下方向键移动并循环、Home / End、按首字母跳转。 */
      await focusGo();
      await press('Enter');
      await focusReaches(page, info => info.region === 'popover');
      const menuLabel = info => info?.name.split(/[⇧⌥⌃⌘]/u)[0].trim();
      const inMenu = [];
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'ArrowDown', 'ArrowUp', 'Home']) {
        await press(key);
        inMenu.push(menuLabel(await active()));
      }
      menus.arrowsMoveInsideMenu = sameList(inMenu, [
        'Documents',
        'Desktop',
        'Documents',
        'Applications',
        'Recents',
        'Applications',
        'Recents'
      ]);
      const typed = [];
      for (const letter of ['d', 'd', 'a']) {
        await press(letter);
        typed.push(menuLabel(await active()));
      }
      menus.typeaheadJumps = sameList(typed, ['Documents', 'Desktop', 'Applications']);

      /* 菜单里左右方向键切到相邻的菜单（首尾相接）。 */
      const switchMenu = async (key, name) => {
        await press(key);
        await page.getByRole('menu', { name }).waitFor({ timeout: 5_000 });
        await focusReaches(page, info => info.region === 'popover');
        return active();
      };
      const afterRight = await switchMenu('ArrowRight', 'Window');
      await switchMenu('ArrowLeft', 'Go');
      const afterLeft = await switchMenu('ArrowLeft', 'View');
      menus.leftRightSwitchMenus = problems(
        afterRight?.region === 'popover' ? [] : [`向右切到「Window」菜单后焦点不在菜单里：${brief(afterRight)}`],
        afterLeft?.region === 'popover' ? [] : [`向左切回「View」菜单后焦点不在菜单里：${brief(afterLeft)}`],
        (await page.locator('#menubar [aria-expanded="true"]').count()) === 1 ?
          []
        : ['切换菜单后应该只有一个标题处于展开状态']
      );

      /* Esc 关闭菜单，焦点回到当前展开的菜单标题。 */
      await press('Escape');
      await disappears(page.locator('#layer-menu [role="menu"]'), 3_000);
      const afterEscape = await focusReaches(page, info => is(info, 'menubar', 'View'));
      menus.escapeRestoresFocus = afterEscape ? [] : [`Esc 之后焦点应回到「View」，实际 ${brief(await active())}`];

      /* Tab 关闭菜单并继续走到下一个标题。 */
      await focusGo();
      await press('Enter');
      await focusReaches(page, info => info.region === 'popover');
      await press('Tab');
      const menuClosedByTab = await disappears(page.locator('#layer-menu [role="menu"]'), 3_000);
      const nextTitle = await focusReaches(page, info => is(info, 'menubar', 'Window'));
      menus.tabClosesMenu = problems(
        menuClosedByTab ? [] : ['在菜单里按 Tab 没有关闭菜单'],
        nextTitle ? [] : [`Tab 之后焦点应落在下一个标题「Window」上，实际 ${brief(await active())}`]
      );

      /* 带勾选的项是 menuitemcheckbox：Finder 工具栏「Sort」菜单里 Name 默认是勾选的。 */
      await focusDocumentStart(page);
      await tabTo(info => is(info, 'window', 'Sort'));
      await press('Enter');
      await page.getByRole('menu', { name: 'Sort By' }).waitFor({ timeout: 5_000 });
      const sortSnapshot = await snapshot('#layer-menu');
      menus.checkedItemRole = problems(
        sortSnapshot.includes('- menuitemcheckbox "Name" [checked]') ?
          []
        : ['Sort 菜单里勾选的「Name」不是 checked 的 menuitemcheckbox'],
        sortSnapshot.includes('- menuitemcheckbox "Date Modified"') ?
          []
        : ['Sort 菜单里的「Date Modified」不是 menuitemcheckbox']
      );
      await press('Escape');
      await focusReaches(page, info => is(info, 'window', 'Sort'));

      /* 完整的纯键盘流程：关掉 Finder 窗口 → Dock 图标 Enter 重新打开 → 「前往」菜单选 Documents → ⌘W 关窗口。全程不碰鼠标。 */
      await reset();
      const flow = (menus.keyboardOnlyFlow = {});
      await press('Meta+w');
      const noWindow = await disappears(win('finder'), 5_000);
      const onFinderIcon = await focusReaches(page, isDockIcon('Finder'));
      await press('Enter');
      flow.opensFinder = problems(
        noWindow ? [] : ['⌘W 没有关掉 Finder 窗口'],
        onFinderIcon ? [] : [`关掉最后一个窗口后焦点应落在 Dock 的 Finder 图标上，实际 ${brief(await active())}`],
        (await appears(win('finder'), 15_000)) ? [] : ['在 Dock 的 Finder 图标上按 Enter 没有打开窗口'],
        (await focusReaches(page, info => info.region === 'window' && info.app === 'finder')) ?
          []
        : ['Finder 打开后焦点没有进入窗口']
      );
      const reachedGo = await tabTo(info => is(info, 'menubar', 'Go'), 'Shift+Tab');
      await press('Enter');
      const goMenu = page.getByRole('menu', { name: 'Go' });
      const menuShown = await appears(goMenu, 5_000);
      flow.opensGoMenu = problems(
        reachedGo.found ? [] : [`Shift+Tab 没有走到「Go」菜单（${reachedGo.stops.length} 次）`],
        menuShown ? [] : ['在「Go」上按 Enter 没有展开菜单'],
        (await focusReaches(page, info => info.region === 'popover' && info.role === 'menuitem')) ?
          []
        : ['菜单展开后焦点没有进入菜单项']
      );
      await press('ArrowDown');
      await press('Enter');
      const navigated = await until(
        page,
        () =>
          document.querySelector('.win[data-app="finder"]:not(.closing)')?.getAttribute('aria-label') === 'Documents'
      );
      const toolbarTitle = await win('finder').locator('[data-title]').textContent();
      flow.changesDirectory = problems(
        navigated ? [] : ['选中「Documents」后窗口名称没有变成 Documents'],
        toolbarTitle?.trim() === 'Documents' ? [] : [`工具栏标题应是 Documents，实际 ${toolbarTitle}`],
        (await disappears(page.locator('#layer-menu [role="menu"]'), 3_000)) ? [] : ['执行命令之后菜单没有关闭'],
        (await focusReaches(page, info => info.region === 'window' && info.app === 'finder')) ?
          []
        : ['执行命令之后焦点没有回到 Finder 窗口']
      );
      await press('Meta+w');
      flow.closesWindow = problems(
        (await disappears(win('finder'), 5_000)) ? [] : ['⌘W 没有关掉窗口'],
        (await focusReaches(page, isDockIcon('Finder'))) ?
          []
        : [`关窗口后焦点应回到 Dock 的 Finder 图标，实际 ${brief(await active())}`]
      );
    });

    /* ==== AC#3 窗口与焦点 ==== */
    await guarded('windows', windows, async () => {
      await reset();
      const opened = [];
      opened.push(await openFromDock('Calendar', 'calendar'));
      opened.push(await openFromDock('Calculator', 'calculator'));
      const states = await windowStates();
      windows.dialogsNamedByTitle = problems(
        opened.every(Boolean) ? [] : ['用键盘（Dock 图标 Enter）没有把 Calendar 与 Calculator 都打开'],
        sameList(
          states.map(state => state.name),
          ['prasenjit', 'Calendar', 'Calculator']
        )
      );
      windows.backgroundHidden = problems(
        await dialogsSettle(['Calculator']),
        (await page.locator('.win[role="dialog"]').count()) === 3 ? [] : ['应有 3 个 role="dialog" 的窗口'],
        (
          (await page
            .getByRole('dialog', { includeHidden: true })
            .filter({ has: page.locator('.tl') })
            .count()) === 3
        ) ?
          []
        : ['includeHidden 时读屏树里应能找到 3 个窗口'],
        states.filter(state => state.hidden).length === 2 ?
          []
        : [`后台窗口应有 2 个 aria-hidden，实际 ${states.filter(state => state.hidden).length}`],
        states.find(state => state.app === 'calculator')?.hidden ? ['前台窗口不该 aria-hidden'] : []
      );
      windows.menubarShowsFrontApp = problems(
        (await menubarFirstApp()) === 'Calculator' ?
          []
        : [`菜单栏应显示前台应用 Calculator，实际 ${await menubarFirstApp()}`],
        (await page.getByRole('menuitem', { name: 'Calculator', exact: true }).count()) === 1 ?
          []
        : ['无障碍树里没有名叫 Calculator 的菜单标题']
      );
      const focusedNow = await active();
      windows.openMovesFocusIn =
        focusedNow?.region === 'window' && focusedNow.app === 'calculator' ?
          []
        : [`打开 Calculator 后焦点应在它的窗口里，实际 ${brief(focusedNow)}`];

      /* ⌘反引号：最底层的窗口到前台，焦点、菜单栏与 aria-hidden 一起换。 */
      await press('Meta+Backquote');
      const cycled = await until(page, () =>
        document.querySelector('.win[data-app="finder"]')?.classList.contains('front')
      );
      const cycledStates = await windowStates();
      const cycleFocus = await focusReaches(page, info => info.region === 'window' && info.app === 'finder');
      windows.cycleSwitchesFocusAndFront = problems(
        cycled ? [] : ['⌘反引号没有把 Finder 窗口调到前台'],
        cycleFocus ? [] : [`⌘反引号之后焦点应进入 Finder 窗口，实际 ${brief(await active())}`],
        await dialogsSettle(['prasenjit']),
        cycledStates.find(state => state.app === 'finder')?.hidden ? ['新前台窗口仍 aria-hidden'] : [],
        (await menubarFirstApp()) === 'Finder' ? [] : [`菜单栏应换成 Finder，实际 ${await menubarFirstApp()}`]
      );

      /* 把最小化动画停在中途，确保 Dock 还原请求发生在动画结束前，不受机器负载影响。 */
      await page.evaluate(() => {
        const hold = event => {
          if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'm') return;
          document.removeEventListener('keydown', hold);
          queueMicrotask(() => {
            const animation = document
              .querySelector('.win[data-app="finder"]')
              ?.getAnimations()
              .find(
                item =>
                  item.effect instanceof KeyframeEffect &&
                  item.effect.getKeyframes().some(frame => String(frame.clipPath).includes('43%'))
              );
            window.__heldMinimize = Boolean(animation);
            if (!animation) return;
            animation.pause();
            animation.currentTime = 100;
          });
        };
        document.addEventListener('keydown', hold);
      });
      await press('Meta+m');
      await until(
        page,
        () => !document.querySelector('.win[data-app="finder"]:not(.closing)')?.classList.contains('front'),
        undefined,
        5_000
      );
      const nextFocus = await focusReaches(
        page,
        info => info.region === 'window' && info.app !== 'finder' && info.app !== null,
        5_000
      );
      const minimizedHidden = await until(
        page,
        () => document.querySelector('.win[data-app="finder"]')?.getAttribute('aria-hidden') === 'true',
        undefined,
        5_000
      );
      const afterMinimize = await visibleDialogs();
      windows.minimizeHandsFocusToNext = problems(
        (await page.evaluate(() => window.__heldMinimize === true)) ? [] : ['未能固定最小化动画中的还原前置条件'],
        nextFocus ? [] : [`⌘M 之后焦点应交给下一个窗口，实际 ${brief(await active())}`],
        minimizedHidden ? [] : ['最小化的窗口没有对读屏隐藏'],
        afterMinimize.length === 1 && afterMinimize[0] !== 'prasenjit' ?
          []
        : [`⌘M 之后读屏只应看到下一个前台窗口，实际 ${afterMinimize.join(' | ')}`]
      );

      /* 键盘从 Dock 还原：Tab 到 Finder 图标按 Enter，窗口还原、焦点进入、菜单栏回到 Finder。 */
      await focusDocumentStart(page);
      await tabTo(isDockIcon('Finder'));
      await press('Enter');
      const restoredFront = await until(
        page,
        () => {
          const node = document.querySelector('.win[data-app="finder"]:not(.closing)');
          return (
            node?.classList.contains('front') &&
            node.getAttribute('aria-hidden') !== 'true' &&
            node.style.visibility !== 'hidden'
          );
        },
        undefined,
        10_000
      );
      windows.restoreFromDockByKeyboard = problems(
        restoredFront ? [] : ['在 Dock 的 Finder 图标上按 Enter 没有把最小化的窗口还原到前台'],
        (await focusReaches(page, info => info.region === 'window' && info.app === 'finder', 8_000)) ?
          []
        : [`还原之后焦点应进入 Finder 窗口，实际 ${brief(await active())}`],
        (await menubarFirstApp()) === 'Finder' ? [] : [`菜单栏应显示 Finder，实际 ${await menubarFirstApp()}`]
      );

      /* ⌘W：关掉前台窗口，焦点交给下一个窗口；关到最后一个，焦点落在它的 Dock 图标上。 */
      await press('Meta+w');
      await until(page, () => !document.querySelector('.win[data-app="finder"]:not(.closing)'), undefined, 5_000);
      const closeFocus = await focusReaches(
        page,
        info => info.region === 'window' && info.app !== null && info.app !== 'finder',
        5_000
      );
      windows.closeHandsFocusOver = problems(
        closeFocus ? [] : [`⌘W 之后焦点应交给下一个窗口，实际 ${brief(await active())}`],
        await dialogsSettle(['Calculator'])
      );
      await press('Meta+w');
      await until(page, () => !document.querySelector('.win[data-app="calculator"]:not(.closing)'), undefined, 5_000);
      await focusReaches(page, info => info.region === 'window' && info.app === 'calendar', 5_000);
      await press('Meta+w');
      await until(page, () => document.querySelectorAll('.win:not(.closing)').length === 0, undefined, 8_000);
      const lastFocus = await focusReaches(page, info => info.region === 'dock', 5_000);
      windows.lastCloseFocusesDockIcon =
        lastFocus ? [] : [`关掉最后一个窗口后焦点应落在 Dock 图标上，实际 ${brief(await active())}`];

      /* 用 Tab 走进后台窗口：窗口随之成为前台，菜单栏跟着换。开 Finder（后台）与 Calendar（前台），从文档开头 Tab 进 Finder。 */
      await reset();
      await openFromDock('Calendar', 'calendar');
      await focusDocumentStart(page);
      const intoFinder = await tabTo(info => info.region === 'window' && info.app === 'finder');
      const raised = await until(
        page,
        () => document.querySelector('.win[data-app="finder"]')?.classList.contains('front'),
        undefined,
        5_000
      );
      windows.tabIntoBackgroundRaises = problems(
        intoFinder.found ? [] : ['Tab 没有走进后台的 Finder 窗口'],
        raised ? [] : ['Tab 走进后台窗口之后，窗口没有成为前台'],
        (await menubarFirstApp()) === 'Finder' ? [] : [`菜单栏应换成 Finder，实际 ${await menubarFirstApp()}`],
        await dialogsSettle(['prasenjit'])
      );
    });

    /* ==== Finder 的键盘导航 ==== */
    await guarded('finder', finder, async () => {
      await reset();
      const finderWin = win('finder');
      const listboxText = await snapshot('.win[data-app="finder"]');
      finder.listboxRoles = problems(
        missingInOrder(listboxText, [
          '- listbox "Items":',
          '- option "Desktop, Folder"',
          '- option "Documents, Folder"'
        ]).map(fragment => `Finder 无障碍树里缺少：${fragment}`),
        (await finderWin.locator('[role="option"][tabindex="0"]').count()) === 1 ?
          []
        : ['内容区应只有一个 Tab 停靠点（roving tabindex）']
      );
      await focusDocumentStart(page);
      await tabTo(info => info.role === 'option');
      /* 方向键同步地把焦点交给目标条目；选中状态（aria-selected）随下一次渲染到位，所以移动看焦点，选中另外等。 */
      const focusedName = async () => (await active())?.name;
      const selectedName = () =>
        finderWin.locator('[role="option"][aria-selected="true"]').first().getAttribute('aria-label');
      const selectionFollowsFocus = () =>
        until(
          page,
          () => {
            const focused = document.activeElement;
            return focused?.getAttribute('aria-selected') === 'true';
          },
          undefined,
          3_000
        );
      const seen = [await focusedName()];
      for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home']) {
        await press(key);
        seen.push(await focusedName());
      }
      finder.arrowKeysMoveSelection = problems(
        sameList(seen, [
          'Desktop, Folder',
          'Documents, Folder',
          'Downloads, Folder',
          'Documents, Folder',
          'Public, Folder',
          'Desktop, Folder'
        ]),
        (await selectionFollowsFocus()) ? [] : ['方向键移动之后，焦点所在的条目没有成为选中项（aria-selected）']
      );
      await press('ArrowRight');
      await press('Enter');
      const entered = await until(
        page,
        () =>
          document.querySelector('.win[data-app="finder"]:not(.closing)')?.getAttribute('aria-label') === 'Documents'
      );
      const optionFocus = await focusReaches(page, info => info.region === 'window' && info.role === 'option', 5_000);
      finder.enterOpensFolderKeepsFocus = problems(
        entered ? [] : ['在 Documents 上按 Enter 没有进入这个文件夹'],
        optionFocus ? [] : [`进入文件夹之后焦点应留在内容区的条目上，实际 ${brief(await active())}`]
      );
      await press('Backspace');
      const wentUp = await until(
        page,
        () =>
          document.querySelector('.win[data-app="finder"]:not(.closing)')?.getAttribute('aria-label') === 'prasenjit'
      );
      const reselected = await until(
        page,
        () =>
          document
            .querySelector('.win[data-app="finder"] [role="option"][aria-selected="true"]')
            ?.getAttribute('aria-label') === 'Documents, Folder',
        undefined,
        3_000
      );
      finder.backspaceGoesUp = problems(
        wentUp ? [] : ['Backspace 没有回到上一级目录'],
        reselected ? [] : [`回到上一级之后应选中刚才所在的 Documents，实际 ${await selectedName()}`],
        (await focusReaches(page, info => info.role === 'option', 5_000)) ? [] : ['回到上一级之后焦点没有留在条目上']
      );
      await press('Meta+ArrowUp');
      const wentUpAgain = await until(
        page,
        () => document.querySelector('.win[data-app="finder"]:not(.closing)')?.getAttribute('aria-label') === 'Users'
      );
      finder.commandUpGoesUp = wentUpAgain ? [] : ['⌘↑ 没有回到上一级目录'];

      /* 列表视图：键盘切换视图，上下方向键移动选择，Enter 打开。 */
      await session.reloadDesktop();
      await page.locator('.win[data-app="finder"] [role="option"]').first().waitFor();
      await focusDocumentStart(page);
      await tabTo(info => is(info, 'window', 'List'));
      await press('Enter');
      await finderWin.locator('.fv-list').waitFor({ timeout: 5_000 });
      await tabTo(info => info.role === 'option');
      const listSeen = [await focusedName()];
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp']) {
        await press(key);
        listSeen.push(await focusedName());
      }
      finder.listViewArrows = problems(
        sameList(listSeen, ['Desktop, Folder', 'Documents, Folder', 'Downloads, Folder', 'Documents, Folder']),
        (await finderWin.locator('.fv-list[role="listbox"]').count()) === 1 ? [] : ['列表视图的容器不是 listbox']
      );

      /* 分栏视图：向右进入下一栏的第一项，向左回到上一栏选中的项。 */
      await focusDocumentStart(page);
      await tabTo(info => is(info, 'window', 'Columns'));
      await press('Enter');
      await finderWin.locator('.fv-col').waitFor({ timeout: 5_000 });
      await tabTo(info => info.role === 'option');
      const columnFocus = async () => {
        const info = await active();
        const column = await page.evaluate(() => document.activeElement?.getAttribute('data-ci'));
        return `${column}:${info?.name}`;
      };
      const columnSeen = [await columnFocus()];
      await press('ArrowDown');
      columnSeen.push(await columnFocus());
      await press('ArrowRight');
      await focusReaches(page, info => info.role === 'option', 3_000);
      await until(page, () => document.activeElement?.getAttribute('data-ci') === '1', undefined, 3_000);
      columnSeen.push(await columnFocus());
      await press('ArrowLeft');
      await until(page, () => document.activeElement?.getAttribute('data-ci') === '0', undefined, 3_000);
      columnSeen.push(await columnFocus());
      finder.columnViewArrows = problems(
        columnSeen[0]?.endsWith('Desktop, Folder') ?
          []
        : [`分栏视图的 Tab 停靠点应是第一栏的第一项，实际 ${columnSeen[0]}`],
        columnSeen[1]?.endsWith('Documents, Folder') ? [] : [`向下应移到 Documents，实际 ${columnSeen[1]}`],
        columnSeen[2] && !columnSeen[2].startsWith(columnSeen[1].split(':')[0]) ?
          []
        : [`向右应进入下一栏，实际 ${columnSeen[2]}`],
        columnSeen[3] === columnSeen[1] ? [] : [`向左应回到上一栏选中的 Documents，实际 ${columnSeen[3]}`]
      );
    });

    /* ==== AC#4 无障碍树 ==== */
    await guarded('tree', tree, async () => {
      await reset();
      const finderTree = await snapshot('.win[data-app="finder"]');
      tree.finderWindow = problems(
        missingInOrder(finderTree, [
          '- dialog "prasenjit":',
          '- button "Close"',
          '- button "Minimize"',
          '- button "Zoom"',
          '- group "Favourites":',
          '- button "Documents"',
          '- toolbar "Toolbar":',
          '- button "Back"',
          '- group "View":',
          '- button "Icons" [pressed]',
          '- textbox "Search"',
          '- listbox "Items":',
          '- option "Documents, Folder"',
          '- navigation "Path":'
        ]).map(fragment => `Finder 窗口的无障碍树里缺少或顺序不对：${fragment}`)
      );
      const dockNames = await page.evaluate(() =>
        [...document.querySelectorAll('#dock .di')].map(node => node.getAttribute('aria-label'))
      );
      const dockTree = await snapshot('#dockwrap');
      tree.dock = problems(
        missingInOrder(
          dockTree,
          dockNames.map(name => `- button "${name}"`)
        ).map(fragment => `Dock 的无障碍树里缺少或顺序不对：${fragment}`),
        dockTree.includes('- toolbar "Dock":') ? [] : ['Dock 不是名叫 Dock 的 toolbar'],
        dockTree.includes('- separator') ? [] : ['Dock 的分隔线不是 separator']
      );
      const runningState = await page.evaluate(() => {
        const describe = app => {
          const node = document.querySelector(`#dock .di[data-app="${app}"]`);
          const id = node?.getAttribute('aria-describedby');
          return { id, text: id ? document.getElementById(id)?.textContent?.trim() : null };
        };
        return { finder: describe('finder'), launchpad: describe('launchpad') };
      });
      tree.dockRunningState = problems(
        runningState.finder.text === 'Running' ?
          []
        : [`运行中的 Finder 图标应带「Running」的描述，实际 ${JSON.stringify(runningState.finder)}`],
        runningState.launchpad.id === null ? [] : ['没在运行的启动台图标不该有运行中的描述']
      );
      await focusDocumentStart(page);
      await tabTo(info => is(info, 'menubar', 'File'));
      await press('Enter');
      await page.getByRole('menu', { name: 'File' }).waitFor({ timeout: 5_000 });
      const fileMenu = await snapshot('#layer-menu');
      const closeShortcut = await page
        .locator('#layer-menu [role="menuitem"][data-act="cl"]')
        .getAttribute('aria-keyshortcuts');
      await press('Escape');
      await focusDocumentStart(page);
      await tabTo(info => is(info, 'menubar', 'Edit'));
      await press('Enter');
      await page.getByRole('menu', { name: 'Edit' }).waitFor({ timeout: 5_000 });
      const editMenu = await snapshot('#layer-menu');
      await press('Escape');
      tree.menuItems = problems(
        missingInOrder(fileMenu, [
          '- menu "File":',
          '- menuitem "New Finder Window"',
          '- separator',
          '- menuitem "Close Window"'
        ]).map(fragment => `File 菜单的无障碍树里缺少或顺序不对：${fragment}`),
        closeShortcut === 'Meta+W' ? [] : [`「Close Window」的 aria-keyshortcuts 应是 Meta+W，实际 ${closeShortcut}`],
        fileMenu.includes('⌘') ? ['快捷键字形被读进了菜单项的名称'] : [],
        editMenu.includes('- menuitem "Undo" [disabled]') ? [] : ['Edit 菜单里置灰的「Undo」不是 disabled']
      );

      await focusDocumentStart(page);
      await tabTo(isDockIcon('Launchpad'));
      await press('Enter');
      await appears(page.locator('#lpad:not(.out) [data-lq]'), 8_000);
      await page.locator('#lpad .app').first().waitFor();
      const launchpadTree = await snapshot('#lpad');
      tree.launchpad = problems(
        missingInOrder(launchpadTree, [
          '- dialog "Launchpad":',
          '- textbox "Search Launchpad"',
          '- group "Applications":',
          '- button "Safari"',
          '- button "Notes"'
        ]).map(fragment => `启动台的无障碍树里缺少或顺序不对：${fragment}`)
      );
      await press('Escape');
      await disappears(page.locator('#lpad'), 5_000);

      await focusDocumentStart(page);
      await tabTo(info => info.region === 'menubar' && info.name === 'Spotlight');
      await press('Enter');
      await appears(page.locator('#spot:not(.out) [data-sq]'), 8_000);
      await focusReaches(page, inside('spotlight'));
      await page.keyboard.type('Notes');
      await page.waitForFunction(() => document.querySelector('#spot [role="option"]'), undefined, { timeout: 8_000 });
      const spotTree = await snapshot('#spot');
      tree.spotlight = problems(
        missingInOrder(spotTree, [
          '- dialog "Spotlight":',
          '- combobox "Spotlight Search" [expanded]',
          '- listbox "Results":',
          '- group "Top Hit":',
          '- option "Notes, Application" [selected]'
        ]).map(fragment => `聚焦搜索的无障碍树里缺少或顺序不对：${fragment}`)
      );
      await press('Escape');
      await disappears(page.locator('#spot'), 5_000);

      /* 窗口开关时树跟着更新：开 Calendar，读屏只看到 Calendar；关掉它，只看到 Finder。 */
      await openFromDock('Calendar', 'calendar');
      const withCalendar = await dialogsSettle(['Calendar']);
      await press('Meta+w');
      await disappears(win('calendar'), 5_000);
      const afterClose = await until(
        page,
        () => [...document.querySelectorAll('.win:not(.closing)')].length === 1,
        undefined,
        5_000
      );
      const withoutCalendar = await dialogsSettle(['prasenjit']);
      tree.updatesWhenWindowsOpenAndClose = problems(
        withCalendar,
        afterClose ? [] : ['关掉窗口之后窗口数没有减少'],
        withoutCalendar
      );

      await reset();
      const wholePage = await page.locator('body').ariaSnapshot();
      const unnamed = unnamedControls(wholePage);
      tree.everyControlNamed = problems(unnamed.map(line => `没有名称的控件：${line}`));
      tree.decorativeSvgHidden = problems(
        (await exposedSvgs(page, '#menubar')).map(item => `菜单栏里没有 aria-hidden 的 SVG：${item}`),
        (await exposedSvgs(page, '#dockwrap')).map(item => `Dock 里没有 aria-hidden 的 SVG：${item}`),
        (await exposedSvgs(page, '.win[data-app="finder"]')).map(
          item => `Finder 窗口里没有 aria-hidden 的 SVG：${item}`
        ),
        (await exposedSvgs(page, '#desktop')).map(item => `桌面上没有 aria-hidden 的 SVG：${item}`)
      );
    });

    /* axe：单个前台窗口的外壳（菜单栏、窗口、Dock、桌面）不带规则违规；色彩对比度（压在壁纸上）不在本故事范围。 */
    await guarded('axe', axeResult, async () => {
      const axe = await new AxeBuilder({ page })
        .disableRules(['color-contrast', 'region', 'landmark-one-main', 'page-has-heading-one'])
        .analyze();
      axeResult.noViolations = axe.violations.map(
        violation => `${violation.id}（${violation.nodes.length} 处）：${violation.nodes[0]?.target.join(' ')}`
      );
    });

    return {
      a11y: {
        tabPath,
        overlays,
        menus,
        windows,
        finder,
        tree,
        axe: axeResult
      }
    };
  }
};
