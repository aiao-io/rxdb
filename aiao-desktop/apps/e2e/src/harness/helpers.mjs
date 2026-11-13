/** 把「等到某件事发生」的 Promise 变成布尔：超时或失败都是 false，由检查项自己断言。 */
export const passes = promise =>
  promise.then(
    () => true,
    () => false
  );

/**
 * 桌面页面的常用操作与等待。每个检查组用自己页面创建一份，互不共享状态。
 *
 * @param {import('playwright').Page} page
 */
export function createHelpers(page) {
  /** 某个应用的窗口（不含正在关闭的）。 */
  const win = id => page.locator(`.win[data-app="${id}"]:not(.closing)`);

  const closeAll = async () => {
    for (let guard = 0; guard < 40; guard++) {
      const close = page.locator('.win:not(.closing) .tl .c');
      if ((await close.count()) === 0) return;
      await close.first().dispatchEvent('click');
      await page.waitForTimeout(240);
    }
  };

  /**
   * 等桌面启动时的窗口恢复结束（ADESK-US-104）：至少有一个窗口、窗口数连续 `stable` 毫秒不变、没有窗口还在「Opening…」。
   * 刷新（或在同一个标签页里重开）桌面后，上一轮开着的窗口会被恢复出来，一个一个地建；等的是这个条件，不是固定的延时。
   * 启动之后总会有窗口：恢复出来的，或者没有可恢复的窗口时打开的默认 Finder。
   */
  const restored = ({ stable = 600, timeout = 30_000 } = {}) =>
    page.waitForFunction(
      holdFor => {
        const windows = document.querySelectorAll('.win:not(.closing)').length;
        const loading = document.querySelectorAll('.win:not(.closing) [data-window-loading]').length;
        const probe = (window['__restoreProbe'] ??= { count: -1, since: performance.now() });
        if (probe.count !== windows) Object.assign(probe, { count: windows, since: performance.now() });
        return windows > 0 && loading === 0 && performance.now() - probe.since >= holdFor;
      },
      stable,
      { timeout, polling: 100 }
    );

  /** 从启动台搜索并打开应用。 */
  const launch = async name => {
    await page.locator('#dock .di[data-app="launchpad"]').click();
    await page.waitForSelector('#lpad:not(.out) [data-lq]');
    await page.locator('#lpad [data-lq]').fill(name);
    await page.locator('#lpad [data-lq]').press('Enter');
  };

  /** 打开聚焦搜索并输入文字（等搜索框拿到焦点再输入）。 */
  const spotlight = async text => {
    await page.keyboard.press('Meta+Space');
    await page.waitForFunction(() => document.activeElement?.matches('#spot [data-sq]'));
    await page.keyboard.type(text);
  };

  /** 等元素可见；弹出层先隐藏测量、下一帧才定位显示。 */
  const shows = locator => passes(locator.waitFor({ state: 'visible', timeout: 3_000 }));
  const appears = (locator, timeout = 10_000) => passes(locator.waitFor({ state: 'attached', timeout }));
  const disappears = (locator, timeout = 10_000) => passes(locator.waitFor({ state: 'detached', timeout }));

  const xtermText = () =>
    page.evaluate(() => document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? '');

  /** 在终端里输入一条命令；给了 `expect` 就等输出里出现它。 */
  const runInShell = async (command, expect) => {
    await page.locator('.win[data-app="terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.type(command);
    await page.keyboard.press('Enter');
    if (!expect) return true;
    return passes(
      page.waitForFunction(
        source =>
          new RegExp(source).test(document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? ''),
        expect.source,
        { timeout: 15_000 }
      )
    );
  };

  /** 桌面图标来自 ~/Desktop：id 是 `file:<文件名>`。 */
  const desktopIcon = name => page.locator(`.dicon[data-id="file:${name}"]`);

  /** 窗口里某个元素的文字包含 `text`。 */
  const windowShowsText = (app, selector, text) =>
    passes(
      page.waitForFunction(
        ([app, selector, text]) =>
          document.querySelector(`.win[data-app="${app}"] ${selector}`)?.textContent?.includes(text) ?? false,
        [app, selector, text],
        { timeout: 10_000 }
      )
    );

  /** 从 Dock 打开终端并等 Vivari 的 shell 能响应。 */
  const openTerminal = async () => {
    await page.locator('#dock .di[data-app="terminal"]').click();
    await page.waitForSelector('.win[data-app="terminal"] .xterm', { timeout: 15_000 });
    await page.waitForTimeout(1_500);
  };

  return {
    win,
    closeAll,
    restored,
    launch,
    spotlight,
    shows,
    appears,
    disappears,
    xtermText,
    runInShell,
    desktopIcon,
    windowShowsText,
    openTerminal
  };
}
