/** Dock 图标缩到的最小点按尺寸（像素），与 Dock 的最小图标尺寸一致。 */
const MIN_TARGET = 22;

/** 触点：从元素中心取一个点。 */
const centerOf = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/**
 * 触摸拖动：Chromium 经 CDP 发真实的触摸事件（浏览器据 `touch-action` 决定是滚动还是把指针事件交给页面）；
 * Firefox 与 WebKit 没有 CDP，退到合成的 `pointerType: 'touch'` 指针事件，只能证明页面的拖动逻辑接受触摸指针，
 * 不能证明 `touch-action`（这一差别写在能力矩阵里）。
 */
async function touchDrag(session, from, to) {
  const { page, engine } = session;
  const steps = 8;
  if (engine === 'chromium') {
    const cdp = await session.context.newCDPSession(page);
    const touch = (type, point) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: point.x, y: point.y }]
      });
    await touch('touchStart', from);
    for (let step = 1; step <= steps; step++)
      await touch('touchMove', {
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps
      });
    /* 窗口拖动松手带惯性：先停一下、再挪一个像素，松手时速度为零，窗口停在手指到的地方。 */
    await page.waitForTimeout(150);
    await touch('touchMove', { x: to.x - Math.sign(to.x - from.x), y: to.y - Math.sign(to.y - from.y) });
    await touch('touchEnd', to);
    await cdp.detach();
    return;
  }
  await page.evaluate(
    async ({ from, to, steps }) => {
      const fire = (target, type, point, down) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: point.x,
            clientY: point.y,
            button: 0,
            buttons: down ? 1 : 0,
            bubbles: true,
            cancelable: true,
            composed: true
          })
        );
      const origin = document.elementFromPoint(from.x, from.y) ?? document.body;
      fire(origin, 'pointerdown', from, true);
      for (let step = 1; step <= steps; step++) {
        const point = { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps };
        fire(origin, 'pointermove', point, true);
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      await new Promise(resolve => setTimeout(resolve, 150));
      fire(origin, 'pointermove', { x: to.x - Math.sign(to.x - from.x), y: to.y - Math.sign(to.y - from.y) }, true);
      fire(origin, 'pointerup', to, false);
    },
    { from, to, steps }
  );
}

/**
 * 窄屏与触屏（ADESK-US-005 AC#2、AC#3）：390×844 的视口、触摸输入。承诺的是最低限度的可用，不是移动端专门设计：
 * 菜单栏与 Dock 不溢出且点得到，窗口不跑出屏幕，没有横向滚动，触摸能拖动与缩放窗口。
 */
export const narrowScreen = {
  name: 'narrow-screen',
  description: '窄屏（390×844）与触屏：菜单栏与 Dock 不溢出且可点、窗口不出屏幕、没有横向滚动、触摸拖动与缩放窗口',
  context: { viewport: { width: 390, height: 844 }, hasTouch: true },
  keys: [
    'narrowScreen.noHorizontalScroll',
    'narrowScreen.menubarFits',
    'narrowScreen.menubarItemsDoNotOverlap',
    'narrowScreen.dockFits',
    'narrowScreen.dockTargetsTappable',
    'narrowScreen.tapOpensApp',
    'narrowScreen.tapOpensLaunchpad',
    'narrowScreen.launchpadTapLaunches',
    'narrowScreen.windowsStayOnScreen',
    'narrowScreen.touchDragMovesWindow',
    'narrowScreen.touchResizeResizesWindow',
    'narrowScreen.touchDragKeepsWindowOnScreen'
  ],
  async run(session) {
    const { page } = session;
    const { win, closeAll, appears, shows } = session.helpers;
    await session.openDesktop();
    const viewport = page.viewportSize();
    const narrowScreen = {};

    narrowScreen.noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth
    );

    /* 菜单栏：每个条目都在屏幕内，条目之间不互相盖住（文字不叠在一起）。 */
    const menubar = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#menubar .mb-item, #menubar .mb-st')]
        .filter(node => {
          const style = getComputedStyle(node);
          return style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().width > 0;
        })
        .map(node => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, width: box.width };
        })
        .sort((a, b) => a.left - b.left);
      const overlaps = boxes.some((box, index) => index > 0 && box.left < boxes[index - 1].right - 1);
      return { fits: boxes.every(box => box.left >= -0.5 && box.right <= window.innerWidth + 0.5), overlaps };
    });
    narrowScreen.menubarFits = menubar.fits;
    narrowScreen.menubarItemsDoNotOverlap = !menubar.overlaps;

    /* Dock：每个图标都在屏幕内、够点（至少 24 像素宽）。 */
    const dock = await page.evaluate(() =>
      [...document.querySelectorAll('#dock .di')].map(node => {
        const box = node.getBoundingClientRect();
        return { app: node.getAttribute('data-app'), left: box.left, right: box.right, width: box.width };
      })
    );
    narrowScreen.dockFits =
      dock.length > 0 && dock.every(item => item.left >= -0.5 && item.right <= viewport.width + 0.5);
    narrowScreen.dockTargetsTappable = dock.length > 0 && dock.every(item => item.width >= MIN_TARGET);

    /* 触摸点按 Dock 图标打开应用，再点启动台、点启动台里的应用。 */
    const tapDock = async app => {
      const box = await page.locator(`#dock .di[data-app="${app}"]`).boundingBox();
      const point = centerOf(box);
      await page.touchscreen.tap(point.x, point.y);
    };
    await tapDock('calculator');
    narrowScreen.tapOpensApp = await appears(win('calculator'), 5_000);
    await closeAll();
    await tapDock('launchpad');
    narrowScreen.tapOpensLaunchpad = await shows(page.locator('#lpad:not(.out)'));
    await page.waitForTimeout(500);
    const tile = await page.locator('#lpad .app', { hasText: 'Calculator' }).first().boundingBox();
    await page.touchscreen.tap(centerOf(tile).x, centerOf(tile).y);
    narrowScreen.launchpadTapLaunches = await appears(win('calculator'), 5_000);
    await closeAll();

    /* 打开几个窗口：全部在屏幕内（菜单栏之下、Dock 之上，不超出左右边缘）。 */
    for (const app of ['finder', 'notes', 'calculator']) {
      await tapDock(app);
      await win(app).first().waitFor();
      await page.waitForTimeout(350);
    }
    const onScreen = box =>
      box.x >= -0.5 &&
      box.y >= -0.5 &&
      box.x + box.width <= viewport.width + 0.5 &&
      box.y + box.height <= viewport.height + 0.5;
    const boxes = await Promise.all(['finder', 'notes', 'calculator'].map(app => win(app).last().boundingBox()));
    narrowScreen.windowsStayOnScreen = boxes.every(onScreen);

    /* 触摸拖动标题栏移动窗口，拖右下角缩放窗口。 */
    await closeAll();
    await tapDock('finder');
    const finder = win('finder').last();
    await finder.waitFor();
    await page.waitForTimeout(400);
    /* 窄屏上窗口已经是最小尺寸（打开时就比视口窄 60 像素），只能往外拉：拉大 10 像素，仍在屏幕内。
       先缩放再拖动：窗口拖到下面会被 Dock 盖住右下角的缩放把手。 */
    const opened = await finder.boundingBox();
    const corner = centerOf(await finder.locator('.rz-se').boundingBox());
    await touchDrag(session, corner, { x: corner.x + 10, y: corner.y + 10 });
    await page.waitForTimeout(250);
    const resized = await finder.boundingBox();
    narrowScreen.touchResizeResizesWindow =
      Math.abs(resized.width - (opened.width + 9)) <= 4 &&
      Math.abs(resized.height - (opened.height + 9)) <= 4 &&
      resized.x + resized.width <= viewport.width;

    /* 触摸拖动标题栏移动窗口：垂直方向跟着手指（不检查水平方向，窗口已经贴着屏幕边缘）。 */
    const before = await finder.boundingBox();
    const handle = await finder.locator('[data-drag]').first().boundingBox();
    const grab = { x: handle.x + handle.width - 16, y: handle.y + 8 };
    await touchDrag(session, grab, { x: grab.x - 10, y: grab.y + 60 });
    await page.waitForTimeout(250);
    const moved = await finder.boundingBox();
    narrowScreen.touchDragMovesWindow = Math.abs(moved.y - (before.y + 60)) <= 4;

    /* 往屏幕外拖：松手后窗口仍然在屏幕内。 */
    const handle2 = await finder.locator('[data-drag]').first().boundingBox();
    const grab2 = { x: handle2.x + handle2.width - 16, y: handle2.y + 8 };
    await touchDrag(session, grab2, { x: viewport.width - 4, y: viewport.height - 40 });
    await page.waitForTimeout(400);
    const edge = await finder.boundingBox();
    narrowScreen.touchDragKeepsWindowOnScreen =
      edge.x < viewport.width - 40 && edge.y < viewport.height - 30 && edge.x + edge.width > 40;

    return { narrowScreen };
  }
};
