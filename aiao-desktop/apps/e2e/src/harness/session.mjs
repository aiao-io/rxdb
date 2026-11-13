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
 * @param {string} [options.distRoot] 被测产物的目录（需要读构建内容的检查组用，例如升级验收找 sqlite 工作线程）
 * @param {string} [options.engine] 浏览器引擎名，默认 chromium
 * @param {readonly ('aiao-code' | 'game')[]} [options.standins] 要安装的替身
 */
export async function createSession({ browser, origin, label, distRoot, engine = 'chromium', standins = [] }) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.route(
    url => !url.href.startsWith(origin),
    route => route.abort()
  );
  /* 替身的路由后注册，优先于上面的外网拦截。 */
  const aiaoCode = standins.includes('aiao-code') ? await installAiaoCodeStandin(context) : null;
  const game = standins.includes('game') ? await installGameStandin(context, origin) : null;
  const errors = [];
  /** 新开一个页面，页面错误一律记进本检查组的 errors。 */
  const openPage = async () => {
    const opened = await context.newPage();
    opened.on('pageerror', error => errors.push(error.message));
    opened.on('console', message => {
      if (message.type() === 'error' && !IGNORED_CONSOLE.test(message.text())) errors.push(message.text());
    });
    return opened;
  };
  const page = await openPage();
  const helpers = createHelpers(page);
  return {
    label,
    engine,
    browser,
    context,
    page,
    origin,
    distRoot,
    errors,
    aiaoCode,
    game,
    helpers,
    openPage,
    /**
     * 新开一个页面并打开桌面（跳过开机动画）。多页或重开桌面的检查组用它；返回页面与绑定到该页面的常用操作。
     * `waitForFinder: false` 时只等页面加载，用于桌面起不来（例如本地数据有问题）的情形。
     */
    async openDesktopPage({ waitForFinder = true } = {}) {
      const opened = await openPage();
      await opened.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
      const pageHelpers = createHelpers(opened);
      if (waitForFinder) await pageHelpers.win('finder').waitFor();
      return { page: opened, helpers: pageHelpers };
    },
    /** 打开桌面并等默认的 Finder 窗口出现；默认跳过开机动画。 */
    async openDesktop({ boot = false } = {}) {
      await page.goto(`${origin}/${boot ? '' : '?boot=0'}`, { waitUntil: 'load' });
      await helpers.win('finder').waitFor();
    },
    close: () => context.close()
  };
}
