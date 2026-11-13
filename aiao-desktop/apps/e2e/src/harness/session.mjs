import { createHelpers } from './helpers.mjs';
import { installAiaoCodeStandin, installGameStandin } from './standin.mjs';

export const VIEWPORT = { width: 1440, height: 900 };

/** 外网被拦截时资源加载失败是预期内的，不算页面错误。 */
const IGNORED_CONSOLE = /Failed to load resource|ERR_FAILED/;

/**
 * 一个检查组的运行环境：独立的浏览器上下文（独立的 OPFS、localStorage、IndexedDB）、一个页面、
 * 该页面上收集的页面错误，以及按需安装的替身应用。检查组之间不共享任何状态（ADESK-US-008）。
 *
 * 外网请求一律拦掉（桌面的来源之外全部 abort），结果稳定；任何页面错误都判检查组失败。
 *
 * @param {object} options
 * @param {import('playwright').Browser} options.browser
 * @param {string} options.origin 桌面的来源
 * @param {string} options.label 检查组名，用于报错
 * @param {string} [options.engine] 浏览器引擎名，默认 chromium
 * @param {readonly ('aiao-code' | 'game')[]} [options.standins] 要安装的替身
 */
export async function createSession({ browser, origin, label, engine = 'chromium', standins = [] }) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.route(
    url => !url.href.startsWith(origin),
    route => route.abort()
  );
  /* 替身的路由后注册，优先于上面的外网拦截。 */
  const aiaoCode = standins.includes('aiao-code') ? await installAiaoCodeStandin(context) : null;
  const game = standins.includes('game') ? await installGameStandin(context, origin) : null;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !IGNORED_CONSOLE.test(message.text())) errors.push(message.text());
  });
  const helpers = createHelpers(page);
  return {
    label,
    engine,
    browser,
    context,
    page,
    origin,
    errors,
    aiaoCode,
    game,
    helpers,
    /** 打开桌面并等默认的 Finder 窗口出现；默认跳过开机动画。 */
    async openDesktop({ boot = false } = {}) {
      await page.goto(`${origin}/${boot ? '' : '?boot=0'}`, { waitUntil: 'load' });
      await helpers.win('finder').waitFor();
    },
    close: () => context.close()
  };
}
