import { existsSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

import { contentTypes } from '../fixtures/artifact-server.mjs';

/** 替身应用用 Orbit 客户端的正式构建握手（e2e 目标先构建 orbit）。 */
export const orbitDist = resolve(import.meta.dirname, '../../../../../packages/orbit/dist');
export const STANDIN_ORIGIN = 'https://vscode.aiao.io';

/**
 * 替身应用（ADESK-US-202）：顶替集成应用 Aiao Code 的入口 https://vscode.aiao.io/，按真实的接入契约
 * 返回 COEP 与 CORP，并用 Orbit 客户端握手。`mode`：
 *
 * - `standard` 保留桌面的标题栏；
 * - `transparent` 隐藏桌面的标题栏、自己画红黄绿与拖动区（ADESK-US-204）；
 * - `fail` 启动时自报失败；
 * - `offline` 入口请求失败；
 * - `hold` 握手后不报告就绪，等测试经 `window.standin.release()` 放行（ADESK-US-206 AC#3、#14、#18：控制 ready 的时机）；
 * - `future` 声明比桌面支持的更高的协议版本（`aiao.orbit:99`，模拟用更新的 SDK 构建的应用，AC#10），不经本仓的 SDK 握手，
 *   收到宿主的不兼容通知后记进 `window.standin.notices` 并打到控制台。
 *
 * 每个模式的页面里，`window.standin` 给测试用：`call(路径, 参数)` 经 `getDesktop` 调桌面能力并把成功值或稳定错误码当结果返回，
 * `raw(方法, 请求体)` 直接发一条 Orbit 请求（绕过 SDK，测宿主侧校验与实例绑定），`desktop` 记录宿主推来的能力事件，
 * `instance` 是桌面给这个实例的实例 ID，`ordinal` 是这是替身的第几次文档加载。
 */
const standinPage = (mode, ordinal) => `<!doctype html>
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
      ${mode === 'future' ? futureScript(ordinal) : mainScript(mode, ordinal)}
    </script>
  </body>
</html>`;

/** 声明更高协议版本的应用：自己发握手，收到不兼容通知就记下来。 */
const futureScript = ordinal => `
      const channel = new URL(location.href).searchParams.get('__aiao_orbit');
      window.standin = { id: crypto.randomUUID(), ordinal: ${ordinal}, notices: [] };
      addEventListener('message', event => {
        if (event.source !== parent || event.data?.type !== 'incompatible') return;
        window.standin.notices.push(event.data);
        console.log('[standin] incompatible ' + JSON.stringify({ supported: event.data.supported, requested: event.data.requested }));
      });
      parent.postMessage({ protocol: 'aiao.orbit:99', type: 'hello', channel }, '*');`;

const mainScript = (mode, ordinal) => `
      import { connectOrbitClient } from './__standin/orbit/client.js';
      import { getCurrentWindow } from './__standin/orbit/window.js';
      import { getDesktop } from './__standin/orbit/desktop.js';
      const client = await connectOrbitClient();
      const appWindow = getCurrentWindow(client);
      const desktop = getDesktop(client);
      const state = {
        id: crypto.randomUUID(),
        ordinal: ${ordinal},
        instance: client.context.instanceId,
        visibility: [],
        window: [],
        desktop: []
      };
      window.standin = state;
      client.onVisibilityChange(visible => state.visibility.push(visible));
      appWindow.onStateChange(next => state.window.push(next));
      desktop.window.onStateChange(next => state.desktop.push({ event: 'window', state: next }));
      desktop.menu.onCommand(commandId => state.desktop.push({ event: 'command', commandId }));
      desktop.appearance.onChange(next => state.desktop.push({ event: 'appearance', appearance: next }));
      /* 经统一的能力接口调用，把成功值或稳定错误码当结果交给测试。 */
      state.call = async (path, args) => {
        const [area, name] = path.split('.');
        try {
          const value = await desktop[area][name](args);
          return { ok: true, value: value ?? null };
        } catch (error) {
          return { ok: false, name: error?.name, code: error?.code, message: String(error?.message ?? error) };
        }
      };
      /* 直接发一条 Orbit 请求，不经 SDK 的参数整理。 */
      state.raw = (method, body) =>
        client.request(method, body).then(
          value => ({ ok: true, value }),
          error => ({ ok: false, name: error?.name, code: error?.code, message: String(error?.message ?? error) })
        );
      state.release = () => client.ready();
      const actions = { close: () => appWindow.close(), minimize: () => appWindow.minimize(), maximize: () => appWindow.toggleMaximize() };
      for (const button of document.querySelectorAll('[data-standin-window]'))
        button.addEventListener('click', () => actions[button.dataset.standinWindow]());
      /* 跨源 iframe 没有用户激活时不能自己抢焦点；等桌面把焦点交过来再落到输入框。 */
      addEventListener('focus', () => document.querySelector('[data-standin-input]').focus());
      ${mode === 'transparent' ? 'appWindow.trackDragRegions(document); await appWindow.setDecorations(false);' : ''}
      ${
        mode === 'fail' ? "client.fail('stand-in failed on purpose');"
        : mode === 'hold' ? ''
        : 'setTimeout(() => client.ready(), 600);'
      }`;

/**
 * 在上下文里装上 Aiao Code 的替身。返回的控制器用 `mode` 切换替身的行为（见 {@link standinPage}），
 * `documents` 记录替身的入口文档被请求过几次（每次打开窗口或重试各一次）。
 *
 * @param {import('playwright').BrowserContext} context
 */
export async function installAiaoCodeStandin(context) {
  const standin = { mode: 'standard', documents: 0 };
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
    standin.documents += 1;
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': contentTypes['.html'],
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
      body: standinPage(standin.mode, standin.documents)
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
