import { expect as playwrightExpect } from 'playwright/test';

import { traced } from './host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });

/** 正式游戏的帧计数与 AudioContext 状态；不以替身计时器证明渲染已停止。 */
export async function checkGameLifecycle(page, { hiddenTab = false, synthetic = false } = {}) {
  const activate = locator => (synthetic ? locator.dispatchEvent('click') : locator.click());
  const result = traced('game-lifecycle');
  const game = page.locator('.win[data-app="saltline"]:not(.closing)');
  /* 替身路径在开窗后立刻进来：iframe 可能还没注册进 page.frames()，等它出现。 */
  let frame = page.frames().find(item => item.url().endsWith('/saltline.html'));
  for (let attempt = 0; !frame && attempt < 20; attempt++) {
    await page.waitForTimeout(250);
    frame = page.frames().find(item => item.url().endsWith('/saltline.html'));
  }
  if (!frame) throw new Error('Saltline frame did not appear in time');
  const identity = await frame.evaluate(() => (window.__lifecycleProof = crypto.randomUUID()));
  const state = () =>
    frame.evaluate(() => ({
      frames: window.__frames,
      lifecycle: window.saltlineDesktop.state,
      audio: window.saltlineDesktop.audioState,
      game: window.__stats().state,
      identity: window.__lifecycleProof
    }));
  const waitFor = value =>
    frame.waitForFunction(expected => window.saltlineDesktop.state === expected, value, {
      timeout: 45_000,
      polling: 100
    });
  const observePause = () =>
    frame.evaluate(() => {
      const bridge = window.saltlineDesktop;
      window.__pauseSample = new Promise(resolve => {
        let unsubscribe = () => undefined;
        const timeout = setTimeout(() => {
          unsubscribe();
          resolve({ timedOut: true });
        }, 45_000);
        unsubscribe = bridge.subscribe(state => {
          if (state !== 'paused') return;
          unsubscribe();
          const frames = window.__frames;
          setTimeout(() => {
            clearTimeout(timeout);
            resolve({
              frames,
              after: window.__frames,
              paused: bridge.state === 'paused',
              audio: bridge.audioState
            });
          }, 600);
        });
      });
    });
  const stable = async () => {
    const sample = await frame.evaluate(() => window.__pauseSample);
    expect(sample.timedOut, '游戏未回报暂停状态').not.toBe(true);
    expect(sample.paused, '采样期间游戏应保持暂停').toBe(true);
    expect(sample.after).toBe(sample.frames);
    expect(sample.audio === null || sample.audio === 'suspended').toBe(true);
    return true;
  };
  /* 键盘打开 Apple 菜单（DOM focus + Enter）：与 a11y 组验证过的菜单路径一致。
     合成鼠标事件在慢机（CI）上带 hover/回声竞态；locator.focus 又会被 Playwright 的稳定性预检卡住——
     真游戏在 CI 慢机上 ~1fps，主线程饱和时连续两帧几何不变都凑不齐。evaluate 直设 DOM 焦点绕开一切 actionability。 */
  const apple = async label => {
    await page.locator('#menubar .mb-item.apple').evaluate(node => node.focus());
    await page.keyboard.press('Enter');
    await page.locator('#layer-menu .pop .mi', { hasText: label }).evaluate(node => node.focus());
    await page.keyboard.press('Enter');
  };
  const before = await state();
  await observePause();
  await activate(game.locator('.tl .m'));
  result.minimizedLoopStops = await stable();
  await activate(page.locator('#dock .di[data-app="saltline"]'));
  await waitFor('running');
  await frame.waitForFunction(count => window.__frames > count, before.frames, { timeout: 45_000, polling: 100 });
  const restored = await state();
  result.restoreKeepsGame =
    restored.identity === identity && restored.game === (before.game === 'playing' ? 'paused' : before.game);
  expect(result.restoreKeepsGame).toBe(true);

  await observePause();
  await apple('Lock Screen');
  result.lockedLoopStops = await stable();
  await activate(page.locator('#lock'));
  await waitFor('running');
  await observePause();
  await apple('Sleep');
  result.sleepLoopStops = await stable();
  /* 睡眠是输入唤醒（不再自动醒来）：按任意键进入 waking，桌面才会把可见性回报给游戏桥。 */
  await page.keyboard.press('a');
  await waitFor('running');

  if (hiddenTab) {
    await observePause();
    const other = await page.context().newPage();
    try {
      await other.bringToFront();
      await page.waitForFunction(() => document.visibilityState === 'hidden', undefined, { polling: 100 });
      result.hiddenPageStops = await stable();
      await page.bringToFront();
      await waitFor('running');
      result.visiblePageResumes = (await state()).identity === identity;
    } finally {
      await other.close();
    }
  }
  return result;
}
