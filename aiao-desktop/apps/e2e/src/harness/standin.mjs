import { existsSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

import { contentTypes } from '../fixtures/artifact-server.mjs';

/** 替身应用用 Orbit 客户端的正式构建握手（e2e 目标先构建 orbit）。 */
export const orbitDist = resolve(import.meta.dirname, '../../../../../packages/orbit/dist');
export const STANDIN_ORIGIN = 'https://vscode.aiao.io';

/**
 * 替身应用（ADESK-US-202）：顶替集成应用 Aiao Code 的入口 https://vscode.aiao.io/，按真实的接入契约
 * 返回 COEP 与 CORP，并用 Orbit 客户端握手。`mode`：standard 保留桌面的标题栏；transparent 隐藏桌面的
 * 标题栏、自己画红黄绿与拖动区（ADESK-US-204）；fail 启动时自报失败；offline 入口请求失败。
 */
const standinPage = mode => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Aiao Code stand-in</title></head>
  <body style="margin: 0; font: 14px system-ui">
    <header data-standin-bar data-orbit-drag-region style="display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px">
      <button data-standin-window="close">×</button>
      <button data-standin-window="minimize">−</button>
      <button data-standin-window="maximize">+</button>
      <span style="margin-left: 24px">Stand-in</span>
      <button data-standin-noop style="margin-left: 16px">noop</button>
    </header>
    <textarea data-standin-input style="width: 90%; height: 120px"></textarea>
    <script type="module">
      import { connectOrbitClient } from './__standin/orbit/client.js';
      import { getCurrentWindow } from './__standin/orbit/window.js';
      const client = await connectOrbitClient();
      const appWindow = getCurrentWindow(client);
      const state = { id: crypto.randomUUID(), visibility: [], window: [] };
      window.standin = state;
      client.onVisibilityChange(visible => state.visibility.push(visible));
      appWindow.onStateChange(next => state.window.push(next));
      const actions = { close: () => appWindow.close(), minimize: () => appWindow.minimize(), maximize: () => appWindow.toggleMaximize() };
      for (const button of document.querySelectorAll('[data-standin-window]'))
        button.addEventListener('click', () => actions[button.dataset.standinWindow]());
      /* 跨源 iframe 没有用户激活时不能自己抢焦点；等桌面把焦点交过来再落到输入框。 */
      addEventListener('focus', () => document.querySelector('[data-standin-input]').focus());
      ${mode === 'transparent' ? 'appWindow.trackDragRegions(document); await appWindow.setDecorations(false);' : ''}
      ${mode === 'fail' ? "client.fail('stand-in failed on purpose');" : 'setTimeout(() => client.ready(), 600);'}
    </script>
  </body>
</html>`;

/**
 * 在上下文里装上 Aiao Code 的替身。返回的控制器用 `mode` 切换替身的行为：
 * `standard` | `transparent` | `fail` | `offline`。
 *
 * @param {import('playwright').BrowserContext} context
 */
export async function installAiaoCodeStandin(context) {
  const standin = { mode: 'standard' };
  await context.route(`${STANDIN_ORIGIN}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/__standin/orbit/')) {
      const filePath = normalize(join(orbitDist, url.pathname.slice('/__standin/orbit/'.length)));
      if (!filePath.startsWith(`${orbitDist}/`) || !existsSync(filePath)) return route.fulfill({ status: 404 });
      return route.fulfill({
        path: filePath,
        headers: { 'Content-Type': contentTypes['.js'], 'Cross-Origin-Resource-Policy': 'cross-origin' }
      });
    }
    if (standin.mode === 'offline') return route.abort('internetdisconnected');
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': contentTypes['.html'],
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
      body: standinPage(standin.mode)
    });
  });
  return standin;
}

/**
 * 读 Aiao Code 替身页里的状态：它的 iframe（按来源找）与页面里记录的实例身份、可见性序列和输入框文字。
 *
 * @param {import('playwright').Page} page
 */
export function standinProbe(page) {
  const frame = () => page.frames().find(item => item.url().startsWith(`${STANDIN_ORIGIN}/`));
  const state = async () =>
    (await frame()?.evaluate(() => ({
      id: window.standin?.id,
      visibility: window.standin?.visibility.join(),
      text: document.querySelector('[data-standin-input]')?.value,
      isolated: window.crossOriginIsolated
    }))) ?? {};
  /** 替身最近一次收到的窗口状态（`getCurrentWindow().onStateChange`）。 */
  const windowState = async () => (await frame()?.evaluate(() => window.standin?.window.at(-1))) ?? {};
  return { frame, state, windowState };
}

/**
 * 几猫3A大作的替身页（ADESK-US-103）：记录按键、点击与文档身份。无头 Chromium 只有软件 WebGL，
 * 真游戏开着时整页每秒约一帧，所以窗口这一侧用替身页顶替 `/saltline.html`，最后单独启动一次真游戏。
 * 返回的控制器用 `enabled` 在替身页与真游戏之间切换。
 *
 * @param {import('playwright').BrowserContext} context
 * @param {string} origin 桌面的来源
 */
export async function installGameStandin(context, origin) {
  const url = `${origin}/saltline.html`;
  const standin = { url, enabled: true };
  await context.route(
    request => request.href === url,
    route =>
      standin.enabled ?
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': contentTypes['.html'], 'Cross-Origin-Embedder-Policy': 'require-corp' },
          body: `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>Saltline stand-in</title></head>
  <body style="margin: 0; height: 100vh; background: #0b0d0f">
    <script>
      window.standin = { id: crypto.randomUUID(), keys: '', presses: 0 };
      addEventListener('keydown', event => (window.standin.keys += event.key));
      addEventListener('pointerdown', () => (window.standin.presses += 1));
    </script>
  </body>
</html>`
        })
      : route.continue()
  );
  return standin;
}
