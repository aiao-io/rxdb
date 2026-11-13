import { standinProbe } from '../harness/standin.mjs';

/** 透明窗口（ADESK-US-204）：替身隐藏桌面的标题栏，自己画红黄绿与拖动区，按钮调用桌面的窗口接口。 */
export const transparentWindow = {
  name: 'transparent-window',
  description: '透明窗口：隐藏桌面标题栏、拖动区、双击缩放、窗口按钮、前后台状态',
  standins: ['aiao-code'],
  keys: [
    'transparentWindow.chromeWhileLoading',
    'transparentWindow.chromeHiddenWhenReady',
    'transparentWindow.appKnowsDecorations',
    'transparentWindow.dragMovesWindow',
    'transparentWindow.buttonsAreNotDragArea',
    'transparentWindow.doubleClickZooms',
    'transparentWindow.maximizeButtonToggles',
    'transparentWindow.focusStateReachesApp',
    'transparentWindow.minimizeButtonMinimizes',
    'transparentWindow.closeButtonCloses'
  ],
  async run(session) {
    const { page, aiaoCode: standinControl } = session;
    const { win, closeAll, shows, appears, disappears } = session.helpers;
    const { frame: standinFrame, windowState: standinWindow, waitInFrame } = standinProbe(page);
    await session.openDesktop();

    await closeAll();
    standinControl.mode = 'transparent';
    const vscodeWin = win('vscode');
    const webappIn = state => vscodeWin.locator(`.webapp[data-webapp-state="${state}"]`);
    const zoomed = () => vscodeWin.evaluate(node => node.classList.contains('zoomed'));
    const barPoint = async () => {
      const bar = await (await standinFrame()).locator('[data-standin-bar]').boundingBox();
      return { x: bar.x + bar.width - 80, y: bar.y + bar.height / 2 };
    };
    await page.locator('#dock .di[data-app="vscode"]').click();
    const transparentWindow = { chromeWhileLoading: await shows(vscodeWin.locator('.tb .tl')) };
    await appears(webappIn('ready'), 15_000);
    transparentWindow.chromeHiddenWhenReady =
      (await disappears(vscodeWin.locator('.tb'), 3_000)) &&
      (await appears(vscodeWin.locator('[data-webapp-drag]'), 3_000)) &&
      (await (await standinFrame()).locator('[data-standin-bar]').boundingBox()).y - (await vscodeWin.boundingBox()).y <
        2;
    transparentWindow.appKnowsDecorations = await waitInFrame(
      () => window.standin?.window.at(-1)?.decorations === false
    );

    /* 按住替身标题栏空白处拖动（往右下，窗口留在屏幕内，后面的按钮才点得到）：窗口跟着走；最后一步放慢，松手不滑行。 */
    const beforeDrag = await vscodeWin.boundingBox();
    const grab = await barPoint();
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 120, grab.y + 80, { steps: 10 });
    await page.waitForTimeout(200);
    await page.mouse.move(grab.x + 119, grab.y + 80);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterDrag = await vscodeWin.boundingBox();
    transparentWindow.dragMovesWindow =
      Math.abs(beforeDrag.x + 119 - afterDrag.x) <= 3 && Math.abs(beforeDrag.y + 80 - afterDrag.y) <= 3;

    /* 按住标题栏里的按钮拖：挖空处归应用，窗口不动。 */
    const noop = await (await standinFrame()).locator('[data-standin-noop]').boundingBox();
    await page.mouse.move(noop.x + noop.width / 2, noop.y + noop.height / 2);
    await page.mouse.down();
    await page.mouse.move(noop.x - 100, noop.y + 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterHole = await vscodeWin.boundingBox();
    transparentWindow.buttonsAreNotDragArea = afterHole.x === afterDrag.x && afterHole.y === afterDrag.y;

    /* 双击空白处缩放；替身的绿色按钮还原。 */
    const doubleClickAt = await barPoint();
    await page.mouse.dblclick(doubleClickAt.x, doubleClickAt.y);
    await page.waitForTimeout(500);
    transparentWindow.doubleClickZooms = await zoomed();
    await (await standinFrame()).locator('[data-standin-window="maximize"]').click();
    await page.waitForTimeout(500);
    transparentWindow.maximizeButtonToggles = !(await zoomed()) && (await standinWindow()).maximized === false;

    /* 切到别的窗口再点回来：替身收到失去与回到前台。 */
    await page.locator('#dock .di[data-app="calculator"]').click();
    await win('calculator').waitFor();
    await page.waitForTimeout(300);
    const blurred = (await standinWindow()).focused === false;
    const back = await barPoint();
    await page.mouse.click(back.x, back.y);
    await page.waitForTimeout(300);
    transparentWindow.focusStateReachesApp = blurred && (await standinWindow()).focused === true;
    await win('calculator').locator('.tl .c').click();
    await page.waitForTimeout(300);

    /* 替身的黄色按钮最小化，从 Dock 还原；红色按钮关闭。 */
    await (await standinFrame()).locator('[data-standin-window="minimize"]').click();
    await page.waitForTimeout(700);
    transparentWindow.minimizeButtonMinimizes = await vscodeWin.evaluate(node => node.style.visibility === 'hidden');
    await page.locator('#dock .di[data-app="vscode"]').click();
    await page.waitForTimeout(900);
    await (await standinFrame()).locator('[data-standin-window="close"]').click();
    transparentWindow.closeButtonCloses = await disappears(vscodeWin, 3_000);

    return { transparentWindow };
  }
};
