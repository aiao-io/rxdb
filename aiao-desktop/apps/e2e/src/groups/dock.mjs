import { PREFERENCES, surgery } from '../harness/database.mjs';

/**
 * 默认 Dock 的入口与顺序（ADESK-US-205 AC#9 的对照基线）。清单的 `defaultPinned` 生成默认布局之前，Dock 是
 * 硬编码数组，这里逐项固化当时的顺序：改动 Dock 的实现不得改变首次使用时用户看到的入口与顺序。
 * 废纸篓在分隔线之后。
 */
export const DEFAULT_DOCK_APPS = [
  'finder',
  'launchpad',
  'safari',
  'mail',
  'messages',
  'maps',
  'photos',
  'notes',
  'calendar',
  'music',
  'terminal',
  'vscode',
  'calculator',
  'settings'
];
export const DEFAULT_DOCK_TRAILING = ['trash'];

/** Dock 布局在系统偏好里的键。 */
const LAYOUT_KEY = 'dock:layout';

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));

/** Dock 图标的 `data-app` 顺序（含临时图标），按屏幕上从左到右。 */
export const dockEntries = page =>
  page.evaluate(() => [...document.querySelectorAll('#dock .di')].map(node => node.getAttribute('data-app')));

/** 实际顺序与期望顺序的差异；一致时为空数组，失败时输出里直接看得到差在哪。 */
const orderDiff = (actual, expected) =>
  sameJson(actual, expected) ? [] : [`实际 ${actual.join(',')}`, `期望 ${expected.join(',')}`];

/** 固定布局里的一个应用与分隔线（写进偏好里的形状）。 */
const appItem = id => ({ type: 'app', id });
const DIVIDER = { type: 'divider' };
const layoutOf = (...items) => ({ version: 1, items });

/** 布局压成 id 序列，分隔线记为 `|`。 */
const idsOf = layout => layout.items.map(item => (item.type === 'app' ? item.id : '|'));

/** 库里保存的 Dock 布局；没存过为 null。 */
const savedLayout = session =>
  surgery(session, async db => {
    const rows = await db.shell.rows(`SELECT "value" FROM "${PREFERENCES}" WHERE "key" = ?`, [LAYOUT_KEY]);
    return rows.length ? JSON.parse(rows[0][0]) : null;
  });

/** 直接改库里的 Dock 布局（值列有 JSON_VALID 约束，所以写的是任意合法 JSON，不是任意文本）。 */
const writeLayout = (session, raw) =>
  surgery(session, db =>
    db.shell.execute(`UPDATE "${PREFERENCES}" SET "value" = ? WHERE "key" = ?`, [JSON.stringify(raw), LAYOUT_KEY])
  );

/** 轮询直到条件成立或超时；返回最后一次的结果。 */
async function until(read, accept, { timeout = 15_000, interval = 400 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (accept(value) || Date.now() > deadline) return accept(value);
    await pause(interval);
  }
}

/** 库里保存的布局（去掉分隔线）等于期望的图标顺序：改动已经落库。 */
const savedAs = (session, expected) =>
  until(
    () => savedLayout(session),
    layout =>
      layout !== null &&
      sameJson(
        idsOf(layout).filter(id => id !== '|'),
        expected
      )
  );

/**
 * 一个桌面页面上 Dock 的操作与读数。
 *
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof import('../harness/helpers.mjs').createHelpers>} helpers
 */
function dockOf(page, helpers) {
  const { win, appears, disappears } = helpers;
  const icon = id => page.locator(`#dock .di[data-app="${id}"]`);
  const tile = id => page.locator(`#lpad .app[data-app="${id}"]`);

  /** 全部固定项（含分隔线之后的废纸篓），不含本标签页的临时图标。 */
  const pinned = () =>
    page.evaluate(() => [...document.querySelectorAll('#dock .di:not(.temp)')].map(node => node.dataset.app));

  const waitForEntries = (expected, timeout = 10_000) =>
    page
      .waitForFunction(
        wanted => {
          const now = [...document.querySelectorAll('#dock .di')].map(node => node.dataset.app);
          return JSON.stringify(now) === JSON.stringify(wanted);
        },
        expected,
        { timeout }
      )
      .then(
        () => true,
        () => false
      );

  /** 立刻读每个图标的中心（不动鼠标）；被拖起（`lifted`）的图标不计。 */
  const measure = () =>
    page.evaluate(() => {
      const center = node => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width };
      };
      const dividerRect = document.querySelector('#dock .divider')?.getBoundingClientRect();
      return {
        icons: [...document.querySelectorAll('#dock .di:not(.lifted)')].map(node => ({
          app: node.dataset.app,
          temp: node.classList.contains('temp'),
          ...center(node)
        })),
        divider: dividerRect ? { left: dividerRect.left, right: dividerRect.right } : null
      };
    });

  /** 鼠标移到屏幕上方、等放大收回，再读每个图标的静止中心。 */
  async function geometry() {
    await page.mouse.move(720, 120);
    await page.waitForTimeout(650);
    return measure();
  }

  /** 屏幕上被撑开的那处空位两侧的图标：相邻图标的间距明显大于常规间距。拖动中调用，不动鼠标。 */
  async function gapPair() {
    const { icons } = await measure();
    const sorted = [...icons].sort((a, b) => a.x - b.x);
    const spacing = sorted.slice(1).map((item, index) => item.x - sorted[index].x);
    const pitch = Math.min(...spacing);
    const at = spacing.findIndex(distance => distance > pitch * 1.6);
    return at < 0 ? null : [sorted[at].app, sorted[at + 1].app];
  }

  const at = (shape, app) => shape.icons.find(item => item.app === app);

  /** 鼠标按在 `from` 上并越过拖动阈值。 */
  async function press(from) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y - 8, { steps: 2 });
  }

  /** 拖到 `to` 并停住（不松手），等空位的过渡动画走完。 */
  async function hoverAt(to) {
    await page.mouse.move(to.x, to.y, { steps: 14 });
    await page.waitForTimeout(450);
  }

  async function release() {
    await page.mouse.up();
    await page.waitForTimeout(450);
  }

  /** 读 Dock 当前的插入槽位（拖动中才有）。 */
  const dropSlot = () => page.locator('#dock').getAttribute('data-drop-slot');
  const ghost = () => page.locator('.dock-ghost');

  async function openLaunchpad() {
    await icon('launchpad').click();
    await page.waitForSelector('#lpad:not(.out) [data-lq]');
    await page.waitForTimeout(650);
  }

  async function closeLaunchpad() {
    await page.keyboard.press('Escape');
    await disappears(page.locator('#lpad'), 3_000);
  }

  /** 菜单里的命令，按出现顺序。 */
  const menuItems = () =>
    page.locator('#layer-menu .pop .mi').evaluateAll(nodes =>
      nodes.map(node => ({
        act: node.dataset.act,
        label: node.textContent.trim(),
        disabled: node.classList.contains('dis')
      }))
    );

  async function openMenu(target) {
    await target.click({ button: 'right' });
    await page.locator('#layer-menu .pop .mi').first().waitFor();
    return menuItems();
  }

  async function closeMenu() {
    await page.keyboard.press('Escape');
    await disappears(page.locator('#layer-menu .pop'), 3_000);
  }

  async function choose(act) {
    await page.locator(`#layer-menu .pop .mi[data-act="${act}"]`).click();
    await page.waitForTimeout(300);
  }

  /** Finder 的 Applications 里列出了这个 .app（应用本体不因 Dock 改动而消失）。 */
  async function listedInApplications(name) {
    if ((await win('finder').count()) === 0) await icon('finder').click();
    const finder = win('finder').last();
    await finder.locator('[data-place="Applications"]').click();
    return appears(finder.locator(`.fitem[data-name="${name}.app"]`), 20_000);
  }

  const activeApp = () => page.evaluate(() => document.activeElement?.dataset?.app ?? null);

  return {
    icon,
    tile,
    pinned,
    waitForEntries,
    geometry,
    gapPair,
    at,
    press,
    hoverAt,
    release,
    dropSlot,
    ghost,
    openLaunchpad,
    closeLaunchpad,
    menuItems,
    openMenu,
    closeMenu,
    choose,
    listedInApplications,
    activeApp
  };
}

/** Dock（ADESK-US-205 阶段 C、D）：默认布局、固定与取消固定、运行态、持久化与修复、拖放、键盘。 */
export const dock = {
  name: 'dock',
  description: 'Dock：默认布局、固定与取消固定、运行态、持久化与修复、拖放排序、键盘操作',
  keys: [
    'dock.defaultOrder',
    'dock.defaultDivider',
    'dock.removableOffersRemove',
    'dock.removableUnpinned',
    'dock.removeKeepsApplication',
    'dock.systemItemsRefuseRemoval',
    'dock.addFromLaunchpadMenu',
    'dock.addNotDuplicated',
    'dock.menuChangesSurviveReload',
    'dock.runningShowsTemporaryIcon',
    'dock.runningIndicator',
    'dock.runningKeepsPinnedOrder',
    'dock.minimizedRestoresFromDock',
    'dock.quitRemovesTemporaryIcon',
    'dock.pinnedStaysAfterQuit',
    'dock.launchpadDragShowsInsertionGap',
    'dock.launchpadDragPinsAtSlot',
    'dock.dragAgainNoDuplicate',
    'dock.dockDragReorders',
    'dock.dragDoesNotLaunchApp',
    'dock.dragResultSurvivesReload',
    'dock.dragOutUnpins',
    'dock.dragOutKeepsApplication',
    'dock.dragOutProtectedStays',
    'dock.dragMatchesMenu',
    'dock.finderIconDragPins',
    'dock.finderListDragPins',
    'dock.finderColumnDragPins',
    'dock.finderDragAgainNoDuplicate',
    'dock.finderNonAppNotDraggable',
    'dock.keyboardFocusRing',
    'dock.keyboardRemoveFromDock',
    'dock.keyboardRemoveKeepsFocus',
    'dock.keyboardAddToDock',
    'dock.keyboardAddMatchesDrag',
    'dock.keyboardAddFromTemporaryIcon',
    'dock.keyboardMenuEscapeRestoresFocus',
    'dock.repairDropsUnknownAndDuplicates',
    'dock.repairKeepsUserOrder',
    'dock.repairRestoresProtected',
    'dock.repairWrittenBack',
    'dock.repairedLayoutSurvivesReload',
    'dock.unreadableLayoutGetsDefault'
  ],
  async run(session) {
    const { page } = session;
    const { win, closeAll, launch, appears, disappears } = session.helpers;
    const dockPage = dockOf(page, session.helpers);
    const { icon, tile } = dockPage;
    await session.openDesktop();

    /* AC#9：没有已存布局时，入口与顺序和硬编码时期逐项一致；分隔线恰好一条，夹在设置与废纸篓之间。 */
    const expected = [...DEFAULT_DOCK_APPS, ...DEFAULT_DOCK_TRAILING];
    const result = { defaultOrder: orderDiff(await dockEntries(page), expected) };
    const initial = await dockPage.geometry();
    result.defaultDivider =
      initial.divider !== null &&
      dockPage.at(initial, 'settings').x < initial.divider.left &&
      initial.divider.right < dockPage.at(initial, 'trash').x &&
      (await page.locator('#dock .divider').count()) === 1;

    /* AC#10：可移除的固定项 Remove from Dock 后取消固定，应用本体仍在 Applications。 */
    const removable = await dockPage.openMenu(icon('music'));
    result.removableOffersRemove = removable.some(item => item.act === 'remove-from-dock' && !item.disabled);
    await dockPage.choose('remove-from-dock');
    result.removableUnpinned = !(await dockEntries(page)).includes('music');
    result.removeKeepsApplication = await dockPage.listedInApplications('Music');

    /* 系统项（启动台、废纸篓）与受保护项（Finder）：菜单里的 Remove from Dock 置灰，点了也不会取消固定。 */
    const refusals = [];
    for (const id of ['finder', 'launchpad', 'trash']) {
      const items = await dockPage.openMenu(icon(id));
      const remove = items.find(item => item.act === 'remove-from-dock');
      await page.locator('#layer-menu .pop .mi[data-act="remove-from-dock"]').click();
      await page.waitForTimeout(250);
      await dockPage.closeMenu();
      refusals.push(remove?.disabled === true && (await dockEntries(page)).includes(id));
    }
    result.systemItemsRefuseRemoval = refusals.every(Boolean);

    /* 从 Launchpad 的菜单 Add to Dock：固定到应用区末尾（分隔线之前）；已固定的再看菜单不再提供 Add。 */
    const beforeAdd = await dockPage.pinned();
    await dockPage.openLaunchpad();
    const addMenu = await dockPage.openMenu(tile('music'));
    const offersAdd = addMenu.some(item => item.act === 'add-to-dock' && !item.disabled);
    await dockPage.choose('add-to-dock');
    const afterAdd = await dockPage.pinned();
    result.addFromLaunchpadMenu = offersAdd && sameJson(afterAdd, [...beforeAdd.slice(0, -1), 'music', 'trash']);
    const pinnedMenu = await dockPage.openMenu(tile('music'));
    result.addNotDuplicated =
      !pinnedMenu.some(item => item.act === 'add-to-dock') &&
      pinnedMenu.some(item => item.act === 'remove-from-dock' && !item.disabled) &&
      (await dockEntries(page)).filter(id => id === 'music').length === 1;
    await dockPage.closeMenu();
    await dockPage.closeLaunchpad();

    /* AC#12（持久化）：菜单里的改动落库，刷新后布局仍在。 */
    const menuState = await dockPage.pinned();
    const savedMenuState = await savedAs(session, menuState);
    await page.reload({ waitUntil: 'load' });
    await win('finder').waitFor();
    result.menuChangesSurviveReload = savedMenuState && (await dockPage.waitForEntries(menuState));

    /* AC#11：运行态。未固定的天气在运行时出现临时图标（接在固定项之后、分隔线之前）并显示运行指示，固定项的顺序不受影响。 */
    await closeAll();
    await launch('Weather');
    await win('weather').waitFor();
    await appears(icon('weather'));
    await page.waitForTimeout(400);
    const running = await dockPage.geometry();
    const weather = dockPage.at(running, 'weather');
    result.runningShowsTemporaryIcon =
      weather?.temp === true &&
      weather.x > dockPage.at(running, 'settings').x &&
      weather.x < running.divider.left &&
      dockPage.at(running, 'trash').x > running.divider.right;
    result.runningIndicator =
      (await icon('weather').evaluate(node => node.classList.contains('run'))) &&
      (await icon('calculator').evaluate(node => !node.classList.contains('run')));
    result.runningKeepsPinnedOrder = sameJson(await dockPage.pinned(), menuState);

    /* 最小化后图标还在，点它还原；退出后临时图标消失。 */
    await win('weather').locator('.tl .m').click();
    await page.waitForTimeout(700);
    const stillThere = (await icon('weather').count()) === 1;
    await icon('weather').click();
    await page.waitForTimeout(800);
    const restored = await win('weather').evaluate(
      node => node.style.visibility === '' && !node.classList.contains('mini')
    );
    result.minimizedRestoresFromDock = stillThere && restored;
    await win('weather').locator('.tl .c').click();
    result.quitRemovesTemporaryIcon = await disappears(icon('weather'), 5_000);

    /* 固定的应用退出后仍保留，只是没有运行指示。 */
    await icon('calculator').click();
    await win('calculator').waitFor();
    const calculatorRuns = await icon('calculator').evaluate(node => node.classList.contains('run'));
    await win('calculator').locator('.tl .c').click();
    /* 窗口一进入关闭动画就不再算 win()，运行指示要等窗口真正移除（200ms 后）才熄灭。 */
    const indicatorGone = await page
      .waitForFunction(
        () => !document.querySelector('#dock .di[data-app="calculator"]')?.classList.contains('run'),
        undefined,
        { timeout: 5_000 }
      )
      .then(
        () => true,
        () => false
      );
    result.pinnedStaysAfterQuit = calculatorRuns && indicatorGone && (await icon('calculator').count()) === 1;

    /* AC#13：从 Launchpad 拖一个图标到 Dock，Dock 显示插入位置，松手后固定在对应位置。 */
    await closeAll();
    const beforeDrag = await dockPage.pinned();
    const [left, right] = [beforeDrag[5], beforeDrag[6]];
    await dockPage.openLaunchpad();
    const shape = await dockPage.geometry();
    const from = await tile('weather').boundingBox();
    const aim = { x: (dockPage.at(shape, left).x + dockPage.at(shape, right).x) / 2, y: dockPage.at(shape, left).y };
    await dockPage.press({ x: from.x + from.width / 2, y: from.y + from.height / 2 });
    await dockPage.hoverAt(aim);
    const gap = await dockPage.gapPair();
    result.launchpadDragShowsInsertionGap =
      sameJson(gap, [left, right]) && (await dockPage.dropSlot()) === '6' && (await dockPage.ghost().count()) === 1;
    await dockPage.release();
    const afterDrag = await dockPage.pinned();
    result.launchpadDragPinsAtSlot = sameJson(afterDrag, [
      ...beforeDrag.slice(0, 6),
      'weather',
      ...beforeDrag.slice(6)
    ]);

    /* 已固定的再拖入：不显示插入位置，松手也不重复添加、不挪动。 */
    const again = await dockPage.geometry();
    const second = await tile('weather').boundingBox();
    await dockPage.press({ x: second.x + second.width / 2, y: second.y + second.height / 2 });
    await dockPage.hoverAt({ x: dockPage.at(again, 'photos').x, y: dockPage.at(again, 'photos').y });
    const gapWhileDragging = await dockPage.gapPair();
    const slotWhileDragging = await dockPage.dropSlot();
    await dockPage.release();
    result.dragAgainNoDuplicate =
      gapWhileDragging === null && slotWhileDragging === null && sameJson(await dockPage.pinned(), afterDrag);
    await dockPage.closeLaunchpad();

    /* AC#14：拖动 Dock 里的固定图标调整顺序。被拖起的图标让出位置，指针对应的槽位以去掉它之后的静止布局为准。 */
    const rest = await dockPage.geometry();
    const index = rest.icons.findIndex(item => item.app === 'weather');
    const pitch = rest.icons[index + 1].x - rest.icons[index].x;
    const freeX = app =>
      dockPage.at(rest, app).x + (rest.icons.findIndex(item => item.app === app) < index ? pitch / 2 : -pitch / 2);
    const dragged = dockPage.at(rest, 'weather');
    await dockPage.press(dragged);
    await dockPage.hoverAt({ x: (freeX('launchpad') + freeX('safari')) / 2, y: dragged.y });
    const reorderGap = await dockPage.gapPair();
    const reorderSlot = await dockPage.dropSlot();
    await dockPage.release();
    const reordered = await dockPage.pinned();
    result.dockDragReorders =
      sameJson(reorderGap, ['launchpad', 'safari']) &&
      reorderSlot === '2' &&
      sameJson(reordered, [
        'finder',
        'launchpad',
        'weather',
        ...afterDrag.filter(id => !['finder', 'launchpad', 'weather'].includes(id))
      ]);

    /* 拖放结束后松手引发的点击被吞掉：被拖的应用没有因此启动（Launchpad 的图标、Dock 的图标都一样）。 */
    result.dragDoesNotLaunchApp = (await win('weather').count()) === 0;

    /* 拖动的结果落库，刷新后顺序仍保留。 */
    const savedDrag = await savedAs(session, reordered);
    await page.reload({ waitUntil: 'load' });
    await win('finder').waitFor();
    result.dragResultSurvivesReload = savedDrag && (await dockPage.waitForEntries(reordered));

    /* 把可移除项拖出 Dock：旁边显示 Remove，松手只取消固定，应用仍在 Applications。 */
    const outside = await dockPage.geometry();
    const weatherIcon = dockPage.at(outside, 'weather');
    await dockPage.press(weatherIcon);
    await dockPage.hoverAt({ x: 720, y: 300 });
    const removing =
      (await dockPage.ghost().count()) === 1 && (await page.locator('.dock-ghost.removing').count()) === 1;
    await dockPage.release();
    result.dragOutUnpins = removing && !(await dockEntries(page)).includes('weather');
    result.dragOutKeepsApplication = await dockPage.listedInApplications('Weather');

    /* 受保护的 Finder 拖出 Dock：没有 Remove，松手后回到原位。 */
    const finderBefore = await dockPage.pinned();
    const finderShape = await dockPage.geometry();
    await dockPage.press(dockPage.at(finderShape, 'finder'));
    await dockPage.hoverAt({ x: 720, y: 300 });
    const protectedNoRemove =
      (await dockPage.ghost().count()) === 1 && (await page.locator('.dock-ghost.removing').count()) === 0;
    await dockPage.release();
    result.dragOutProtectedStays = protectedNoRemove && sameJson(await dockPage.pinned(), finderBefore);

    /* Add to Dock 与拖放得到完全相同的结果：天气用菜单固定、取消固定后再拖到应用区最右边，两次的 Dock 一样。 */
    await dockPage.openLaunchpad();
    await dockPage.openMenu(tile('weather'));
    await dockPage.choose('add-to-dock');
    const viaMenu = await dockPage.pinned();
    await dockPage.closeLaunchpad();
    await dockPage.openMenu(icon('weather'));
    await dockPage.choose('remove-from-dock');
    await dockPage.openLaunchpad();
    const endShape = await dockPage.geometry();
    const lastApp = endShape.icons.filter(item => item.x < endShape.divider.left).at(-1);
    const source = await tile('weather').boundingBox();
    await dockPage.press({ x: source.x + source.width / 2, y: source.y + source.height / 2 });
    await dockPage.hoverAt({ x: lastApp.x + lastApp.w * 0.75, y: lastApp.y });
    await dockPage.release();
    result.dragMatchesMenu = sameJson(await dockPage.pinned(), viaMenu);
    await dockPage.closeLaunchpad();

    /*
     * AC#13：Finder 的 Applications 里，图标、列表、分栏三种视图的 .app 都能拖进 Dock，放在终端与它右边的图标之间；
     * 已固定的 .app 再拖入不重复，Applications 之外的条目不能拖。
     */
    await closeAll();
    await icon('finder').click();
    const finder = win('finder').last();
    await finder.locator('[data-place="Applications"]').click();
    const dragFinderItem = async (item, appId) => {
      const order = await dockPage.pinned();
      const at = order.indexOf('terminal');
      const [near, far] = [order[at], order[at + 1]];
      const shape = await dockPage.geometry();
      /* 列表视图里靠后的行在窗口可视区之外，先滚进来再取位置。 */
      await item.scrollIntoViewIfNeeded();
      const box = await item.boundingBox();
      await dockPage.press({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await dockPage.hoverAt({
        x: (dockPage.at(shape, near).x + dockPage.at(shape, far).x) / 2,
        y: dockPage.at(shape, near).y
      });
      const gapShown = sameJson(await dockPage.gapPair(), [near, far]);
      await dockPage.release();
      const after = await dockPage.pinned();
      return gapShown && sameJson(after, [...order.slice(0, at + 1), appId, ...order.slice(at + 1)]);
    };
    const finderViews = [
      ['finderIconDragPins', 'icon', '.fitem', 'reminders', 'Reminders'],
      ['finderListDragPins', 'list', '.r', 'stocks', 'Stocks'],
      ['finderColumnDragPins', 'column', '.ci', 'clock', 'Clock']
    ];
    for (const [key, view, selector, appId, name] of finderViews) {
      await finder.locator(`[data-view="${view}"]`).click();
      const item = finder.locator(`${selector}[data-name="${name}.app"]`);
      result[key] = (await appears(item, 20_000)) && (await dragFinderItem(item, appId));
    }
    await finder.locator('[data-view="icon"]').click();
    const pinnedApp = finder.locator('.fitem[data-name="Safari.app"]');
    await appears(pinnedApp, 20_000);
    const beforeAgain = await dockPage.pinned();
    const againShape = await dockPage.geometry();
    const againBox = await pinnedApp.boundingBox();
    await dockPage.press({ x: againBox.x + againBox.width / 2, y: againBox.y + againBox.height / 2 });
    await dockPage.hoverAt({ x: dockPage.at(againShape, 'photos').x, y: dockPage.at(againShape, 'photos').y });
    const againGap = await dockPage.gapPair();
    await dockPage.release();
    result.finderDragAgainNoDuplicate = againGap === null && sameJson(await dockPage.pinned(), beforeAgain);
    await finder.locator('[data-place="Documents"]').click();
    const firstItem = finder.locator('.fitem').first();
    await appears(firstItem, 20_000);
    const documentBox = await firstItem.boundingBox();
    await dockPage.press({ x: documentBox.x + documentBox.width / 2, y: documentBox.y + documentBox.height / 2 });
    await dockPage.hoverAt({ x: 720, y: 760 });
    result.finderNonAppNotDraggable = (await dockPage.ghost().count()) === 0 && (await dockPage.dropSlot()) === null;
    await dockPage.release();
    await closeAll();

    /* AC#14：只用键盘。Tab 在图标之间移动并显示焦点环（只在键盘操作时）。 */
    await page.mouse.move(720, 120);
    await icon('launchpad').focus();
    await page.keyboard.press('Tab');
    const order = await dockPage.pinned();
    const focused = await dockPage.activeApp();
    const ringOnKeyboard = await page.evaluate(() => document.activeElement?.matches(':focus-visible') === true);
    await icon('maps').hover();
    await page.mouse.down();
    const ringOnMouse = await page.evaluate(() => document.activeElement?.matches(':focus-visible') === true);
    await page.mouse.up();
    await closeAll();
    result.keyboardFocusRing = focused === order[order.indexOf('launchpad') + 1] && ringOnKeyboard && !ringOnMouse;

    /* Menu 键弹出菜单，焦点在第一项上，方向键与 Enter 选 Remove from Dock；图标消失后焦点落在相邻的图标上。 */
    const beforeKeyboard = await dockPage.pinned();
    await icon('mail').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('ContextMenu');
    await page.locator('#layer-menu .pop .mi').first().waitFor();
    const firstFocused = await page.evaluate(() => document.activeElement?.matches('#layer-menu .pop .mi') === true);
    for (let step = 0; step < 6; step++) {
      if ((await page.evaluate(() => document.activeElement?.dataset?.act)) === 'remove-from-dock') break;
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    result.keyboardRemoveFromDock =
      firstFocused &&
      sameJson(
        await dockPage.pinned(),
        beforeKeyboard.filter(id => id !== 'mail')
      );
    result.keyboardRemoveKeepsFocus = ['messages', 'safari'].includes(await dockPage.activeApp());

    /* Esc 关闭菜单，焦点回到图标。 */
    await icon('messages').focus();
    await page.keyboard.press('Shift+F10');
    await page.locator('#layer-menu .pop .mi').first().waitFor();
    await page.keyboard.press('Escape');
    await disappears(page.locator('#layer-menu .pop'), 3_000);
    result.keyboardMenuEscapeRestoresFocus = (await dockPage.activeApp()) === 'messages';

    /* 键盘打开 Launchpad、搜索、Tab 到图标、Menu 键选 Add to Dock：与拖放一样固定到应用区末尾。 */
    await page.keyboard.press('F4');
    await page.waitForFunction(() => document.activeElement?.matches('#lpad [data-lq]'), undefined, { timeout: 5_000 });
    await page.keyboard.type('Mail');
    /* 等搜索结果只剩 Mail 一项再 Tab，否则会落在还没刷新的旧列表的第一项上。 */
    await page.waitForFunction(() => document.querySelectorAll('#lpad .app').length === 1, undefined, {
      timeout: 5_000
    });
    await page.keyboard.press('Tab');
    await page.keyboard.press('ContextMenu');
    await page.locator('#layer-menu .pop .mi').first().waitFor();
    for (let step = 0; step < 6; step++) {
      if ((await page.evaluate(() => document.activeElement?.dataset?.act)) === 'add-to-dock') break;
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const afterKeyboardAdd = await dockPage.pinned();
    result.keyboardAddToDock = afterKeyboardAdd.includes('mail');
    result.keyboardAddMatchesDrag = sameJson(afterKeyboardAdd, [
      ...beforeKeyboard.filter(id => id !== 'mail' && id !== 'trash'),
      'mail',
      'trash'
    ]);
    await dockPage.closeLaunchpad();

    /* 运行中的未固定应用：键盘聚焦它的临时图标，Menu 键选 Add to Dock；图标从临时位置挪到固定位置，焦点仍留在它上面。 */
    const beforeTemporary = await dockPage.pinned();
    await launch('Contacts');
    await win('contacts').waitFor();
    await appears(icon('contacts'));
    const temporaryIsTemp = await icon('contacts').evaluate(node => node.classList.contains('temp'));
    await icon('contacts').focus();
    await page.keyboard.press('Shift+F10');
    await page.locator('#layer-menu .pop .mi').first().waitFor();
    for (let step = 0; step < 6; step++) {
      if ((await page.evaluate(() => document.activeElement?.dataset?.act)) === 'add-to-dock') break;
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    result.keyboardAddFromTemporaryIcon =
      temporaryIsTemp &&
      sameJson(await dockPage.pinned(), [...beforeTemporary.filter(id => id !== 'trash'), 'contacts', 'trash']) &&
      (await icon('contacts').evaluate(node => !node.classList.contains('temp'))) &&
      (await dockPage.activeApp()) === 'contacts';
    await closeAll();

    /* AC#12：偏好内容损坏时只清理无效项。库里的布局被改成含未知应用、重复项、非法项、缺受保护项的内容。 */
    await page.close();
    await writeLayout(
      session,
      layoutOf(
        appItem('notes'),
        appItem('ghost-app'),
        appItem('safari'),
        appItem('notes'),
        appItem('mail'),
        DIVIDER,
        appItem('music'),
        appItem('toString'),
        { type: 'bogus' },
        42,
        null,
        { type: 'app', id: 7 },
        DIVIDER
      )
    );
    let desktop = await session.openDesktopPage();
    let repair = dockOf(desktop.page, desktop.helpers);
    const repaired = ['finder', 'launchpad', 'notes', 'safari', 'mail', 'music', 'trash'];
    const repairedEntries = await repair.waitForEntries(repaired);
    const entries = await dockEntries(desktop.page);
    result.repairDropsUnknownAndDuplicates =
      repairedEntries &&
      !entries.includes('ghost-app') &&
      !entries.includes('toString') &&
      new Set(entries).size === entries.length;
    result.repairKeepsUserOrder = sameJson(
      entries.filter(id => ['notes', 'safari', 'mail', 'music'].includes(id)),
      ['notes', 'safari', 'mail', 'music']
    );
    result.repairRestoresProtected =
      entries.indexOf('finder') === 0 && entries.indexOf('launchpad') === 1 && entries.at(-1) === 'trash';
    result.repairWrittenBack = await until(
      () => savedLayout(session),
      layout =>
        layout !== null &&
        sameJson(idsOf(layout), ['finder', 'launchpad', 'notes', 'safari', 'mail', 'music', '|', 'trash'])
    );
    await desktop.page.reload({ waitUntil: 'load' });
    await desktop.helpers.win('finder').waitFor();
    result.repairedLayoutSurvivesReload = await repair.waitForEntries(repaired);

    /* 整个偏好无法识别（不是布局）：回到清单的默认布局，并写回。 */
    await desktop.page.close();
    await writeLayout(session, 'not a dock layout');
    desktop = await session.openDesktopPage();
    repair = dockOf(desktop.page, desktop.helpers);
    const defaultsRestored = await until(
      () => savedLayout(session),
      layout => layout !== null && sameJson(idsOf(layout), [...DEFAULT_DOCK_APPS, '|', ...DEFAULT_DOCK_TRAILING])
    );
    result.unreadableLayoutGetsDefault = defaultsRestored && (await repair.waitForEntries(expected));
    await desktop.page.close();

    return { dock: result };
  }
};
