import { existsSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

import { contentTypes } from '../fixtures/artifact-server.mjs';
import { installNetworkStandin } from './network-standin.mjs';

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
 *   收到宿主的不兼容通知后记进 `window.standin.notices`、转告桌面页（`postMessage({ standinNotice })`）并打到控制台。
 *
 * 每个模式的页面里，`window.standin` 给测试用：`call(路径, 参数)` 经 `getDesktop` 调桌面能力并把成功值或稳定错误码当结果返回，
 * `raw(方法, 请求体)` 直接发一条 Orbit 请求（绕过 SDK，测宿主侧校验与实例绑定），`desktop` 记录宿主推来的能力事件，
 * `instance` 是桌面给这个实例的实例 ID，`ordinal` 是这是替身的第几次文档加载。
 *
 * 文件内容在测试与替身之间用文字传：`call('filesystem.save', { text: '…' })` 里的 `text` 在替身里编成字节数组再调，
 * `filesystem.open` 结果里的字节数组换成 `text`（UTF-8 解码）与 `bytesLength`。
 * `start(编号, 路径, 参数)` 发起调用但不等结果（用户还在桌面面板里操作时调用不会返回），结果落定后记进 `results[编号]`，
 * 并用 `postMessage({ standinResult })` 转告桌面页——窗口关闭时 iframe 随即销毁，只有转告出去的结果才看得到
 * （桌面页上的 `window.__standinResults`，见 {@link installAiaoCodeStandin}）。
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
      ${commandScript}
      ${mode === 'future' ? futureScript(ordinal) : mainScript(mode, ordinal)}
    </script>
  </body>
</html>`;

/**
 * 替身页的命令通道：父页面（桌面）经 `iframe.contentWindow.postMessage` 发 `{ standinCommand: { id, name, arg } }`，
 * 替身页回 `{ standinReply: id, outcome: { value } | { error } }`。Firefox 的 Playwright 够不到这个跨源 iframe 的执行环境
 * （`frame.evaluate` 一直报「Execution context was destroyed」），测试页只能经这条通道遥控替身（`standinProbe` 的 `proxyFrame`）；
 * Chromium 与 WebKit 直接用 Playwright 的 `Frame`，不走这里。
 */
const commandScript = `
      const commands = {
        ping: () => window.standin?.kind === 'aiao-code',
        evaluate: ({ source, arg }) => (0, eval)('(' + source + ')')(arg),
        rect: selector => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        }
      };
      addEventListener('message', async event => {
        const request = event.data?.standinCommand;
        if (event.source !== parent || !request) return;
        let outcome;
        try {
          outcome = { value: await commands[request.name](request.arg) };
        } catch (error) {
          outcome = { error: String(error?.message ?? error) };
        }
        parent.postMessage({ standinReply: request.id, outcome }, '*');
      });`;

/** 声明更高协议版本的应用：自己发握手，收到不兼容通知就记下来。 */
const futureScript = ordinal => `
      const channel = new URL(location.href).searchParams.get('__aiao_orbit');
      window.standin = { kind: 'aiao-code', id: crypto.randomUUID(), ordinal: ${ordinal}, notices: [] };
      addEventListener('message', event => {
        if (event.source !== parent || event.data?.type !== 'incompatible') return;
        window.standin.notices.push(event.data);
        /* 转告桌面页：Firefox 不把跨源 iframe 的控制台消息交给 Playwright，经 postMessage 在各引擎上都收得到。 */
        parent.postMessage({ standinNotice: event.data }, '*');
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
        kind: 'aiao-code',
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
      /* 文件内容在测试里是文字：保存的 text 编成字节数组，打开结果里的字节数组解成 text。 */
      const withBytes = args => {
        if (!args || typeof args !== 'object' || typeof args.text !== 'string') return args;
        const { text, ...rest } = args;
        return { ...rest, bytes: new TextEncoder().encode(text) };
      };
      const withText = value => {
        if (!value || typeof value !== 'object' || !(value.bytes instanceof Uint8Array)) return value;
        const { bytes, ...rest } = value;
        return { ...rest, text: new TextDecoder().decode(bytes), bytesLength: bytes.length };
      };
      /* 经统一的能力接口调用，把成功值或稳定错误码当结果交给测试。 */
      state.call = async (path, args) => {
        const [area, name] = path.split('.');
        try {
          const value = await desktop[area][name](withBytes(args));
          return { ok: true, value: withText(value) ?? null };
        } catch (error) {
          return { ok: false, name: error?.name, code: error?.code, message: String(error?.message ?? error) };
        }
      };
      /* 发起调用但不等结果；落定后记下并转告桌面页（窗口关闭时 iframe 马上销毁，只有转告出去的才看得到）。 */
      state.results = {};
      state.start = (id, path, args) => {
        state.call(path, args).then(outcome => {
          state.results[id] = outcome;
          parent.postMessage({ standinResult: { id, outcome } }, '*');
        });
        return id;
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
export async function installAiaoCodeStandin(context, { network = false, desktopOrigin } = {}) {
  const standin = {
    mode: 'standard',
    documents: 0,
    origin: STANDIN_ORIGIN,
    rewriteSource: source => source,
    close: async () => undefined
  };
  /* 桌面页（只有顶层文档）收替身转告的调用结果：`window.__standinResults[编号]`。刷新后清空，由新页面的脚本重新收。 */
  await context.addInitScript(() => {
    if (window.top !== window) return;
    window.__standinResults = {};
    window.addEventListener('message', event => {
      const result = event.data?.standinResult;
      if (result) window.__standinResults[result.id] = result.outcome;
    });
  });
  if (network) {
    return Object.assign(
      standin,
      await installNetworkStandin(context, {
        desktopOrigin,
        originalOrigin: STANDIN_ORIGIN,
        scriptsRoot: orbitDist,
        document: () => standinPage(standin.mode, ++standin.documents),
        offline: () => standin.mode === 'offline'
      })
    );
  }
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

/** 桌面页（主 frame）里 Aiao Code 窗口的 Orbit iframe 的位置：iframe 在 `aiao-orbit` 外壳的 shadow root 里。 */
const IFRAME_BOX = 'aiao-orbit iframe';

/**
 * 在桌面页里给当前的 Orbit iframe 登记一个令牌（旧实例的 iframe 被移除后，令牌仍认得它，只是它已不在文档里）。
 * 没有 iframe 返回 null。
 */
function registerIframe(page) {
  return page.evaluate(() => {
    const iframe = document.querySelector('aiao-orbit')?.shadowRoot?.querySelector('iframe');
    if (!iframe) return null;
    window.__standinIframes ??= new Map();
    for (const [token, known] of window.__standinIframes) if (known === iframe) return token;
    const token = String(window.__standinIframes.size + 1);
    window.__standinIframes.set(token, iframe);
    return token;
  });
}

/** 经命令通道给令牌对应的 iframe 发一条命令，等替身页的回复。 */
function sendCommand(page, token, name, arg) {
  return page.evaluate(
    ([target, command, payload]) =>
      new Promise(resolve => {
        const iframe = window.__standinIframes?.get(target);
        if (!iframe?.isConnected || !iframe.contentWindow) return resolve({ detached: true });
        const id = crypto.randomUUID();
        const done = outcome => {
          removeEventListener('message', onReply);
          clearTimeout(timer);
          resolve(outcome);
        };
        const onReply = event => {
          if (event.data?.standinReply === id) done(event.data.outcome);
        };
        const timer = setTimeout(() => done({ error: '替身页 5 秒内没有回复' }), 5_000);
        addEventListener('message', onReply);
        iframe.contentWindow.postMessage({ standinCommand: { id, name: command, arg: payload } }, '*');
      }),
    [token, name, arg]
  );
}

/**
 * 经命令通道遥控替身页的 `Frame` 替身：只实现测试用到的那一小部分（`evaluate`、`isDetached`、
 * `locator(...).boundingBox() / click() / fill()`），语义与 Playwright 的 `Frame` 一致，所以检查组的写法不用分引擎。
 * 对已被移除的旧 iframe，`evaluate` 像 Playwright 的已分离 `Frame` 一样失败——迟到的消息物理上发不出去。
 */
function proxyFrame(page, token) {
  const run = async (name, arg) => {
    const outcome = await sendCommand(page, token, name, arg);
    if (outcome.detached) throw new Error('Frame was detached');
    if ('error' in outcome) throw new Error(outcome.error);
    return outcome.value;
  };
  /** 替身页视口里的矩形换算成桌面页的坐标。 */
  const boxOf = async selector => {
    const local = await run('rect', selector);
    const frameBox = await page.locator(IFRAME_BOX).boundingBox();
    return local && frameBox ? { ...local, x: frameBox.x + local.x, y: frameBox.y + local.y } : null;
  };
  return {
    proxy: true,
    evaluate: (action, arg) => run('evaluate', { source: action.toString(), arg }),
    isDetached: async () => !(await page.evaluate(id => window.__standinIframes?.get(id)?.isConnected ?? false, token)),
    locator: selector => ({
      boundingBox: () => boxOf(selector),
      async click() {
        const box = await boxOf(selector);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      },
      /* 与 Playwright 的 `fill` 一样：直接设值并触发 input，不经键盘（键盘事件进不进跨源 iframe 是另一回事，由 `page.keyboard` 单独测）。 */
      async fill(text) {
        await run('evaluate', {
          source:
            "({ selector, text }) => { const node = document.querySelector(selector); node.focus(); node.value = text; node.dispatchEvent(new Event('input', { bubbles: true })); }",
          arg: { selector, text }
        });
      }
    })
  };
}

/**
 * 读 Aiao Code 替身页里的状态：它的 iframe 与页面里记录的实例身份、可见性序列和输入框文字。
 *
 * iframe 按「页面里有没有替身的标记」找（遍历 `page.frames()`，在每个子 frame 里看 `window.standin.kind`），
 * **不看 `frame.url()`**：Firefox 对被 `route.fulfill` 的跨源 iframe 报空串。几猫3A大作的替身页也有 `window.standin`，
 * 所以要认标记，不能只认这个全局。Chromium 与 WebKit 拿到的是 Playwright 的 `Frame`；Firefox 的 Playwright 够不到这个
 * 跨源 iframe 的执行环境（`frame.evaluate` 报「Execution context was destroyed」、`contentFrame()` 报
 * `Permission denied … docShell`、`frameLocator` 数不到元素），退到命令通道，拿 {@link proxyFrame} 的替身对象。
 *
 * - `frame()`：这个 iframe 的 `Frame`（找不到会等一会儿再抛错），写 `(await frame()).locator(...)`；
 * - `frameHandle()`：同一个 Frame，找不到时是 `undefined`（不抛错、不等待），测实例有没有出现、有没有被销毁时用；
 *   旧实例销毁后拿着的旧 `Frame` 会变成已分离；
 * - `waitInFrame(断言, 参数, 时限)`：反复在替身页里求值直到为真，返回布尔值。
 *
 * @param {import('playwright').Page} page
 */
export function standinProbe(page) {
  const frameHandle = async () => {
    for (const candidate of page.frames()) {
      if (candidate === page.mainFrame()) continue;
      if (await candidate.evaluate(() => window.standin?.kind === 'aiao-code').catch(() => false)) return candidate;
    }
    const token = await registerIframe(page);
    if (token === null) return undefined;
    const proxy = proxyFrame(page, token);
    return (await proxy.evaluate(() => window.standin?.kind === 'aiao-code').catch(() => false)) ? proxy : undefined;
  };
  const frame = async (timeout = 5_000) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = await frameHandle();
      if (found) return found;
      if (Date.now() > deadline) throw new Error('找不到 Aiao Code 替身的 iframe');
      await page.waitForTimeout(50);
    }
  };
  const state = async () =>
    (await (
      await frameHandle()
    )?.evaluate(() => ({
      id: window.standin?.id,
      visibility: window.standin?.visibility.join(),
      text: document.querySelector('[data-standin-input]')?.value,
      isolated: window.crossOriginIsolated
    }))) ?? {};
  /** 替身最近一次收到的窗口状态（`getCurrentWindow().onStateChange`）。 */
  const windowState = async () => (await (await frameHandle())?.evaluate(() => window.standin?.window.at(-1))) ?? {};
  const waitInFrame = async (predicate, arg, timeout = 3_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const target = await frameHandle();
      if (await target?.evaluate(predicate, arg).catch(() => false)) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };
  return { frame, frameHandle, state, windowState, waitInFrame };
}

const clockedPages = new WeakSet();

/**
 * 「入口不可达」的失败（`standin.mode = 'offline'`）在各引擎上都要很快显示（ADESK-US-206 AC#3、ADESK-US-005）：
 * Chromium 对被拦截的 iframe 导航仍会触发 `load`（错误页），Orbit 在 3 秒握手宽限后以 `LOAD_ERROR` 失败；
 * Firefox 与 WebKit 根本不触发 `load`，只能等 Orbit 的就绪超时（Aiao Code 是 60 秒）才失败。
 * 所以非 Chromium 引擎用 `page.clock` 把时间快进过去，失败原因是 `TIMEOUT`；Chromium 保持现状。
 *
 * 在打开窗口**之前**调用（假时钟要早于 Orbit 创建就绪定时器），打开窗口之后调用返回的 `trigger()`。
 * `reason` 是各引擎上窗口里失败原因应当包含的片段。
 *
 * @param {{ page: import('playwright').Page, engine: string }} session
 */
export async function prepareOfflineFailure({ page, engine }) {
  const chromium = engine === 'chromium';
  if (!chromium && !clockedPages.has(page)) {
    await page.clock.install();
    clockedPages.add(page);
  }
  return {
    reason: chromium ? 'vscode.aiao.io didn’t connect' : 'didn’t finish starting within 60 seconds',
    async trigger() {
      if (chromium) return;
      /* 就绪定时器在 Orbit 实例装载时创建；`aiao-orbit` 外壳出现就说明它已经在了。 */
      await page.locator('.win[data-app="vscode"] aiao-orbit').waitFor({ state: 'attached' });
      await page.clock.fastForward(61_000);
    }
  };
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
