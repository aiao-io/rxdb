import { createPersistentProfile } from '../fixtures/persistent-profile.mjs';
import { createHelpers } from './helpers.mjs';
import { installAiaoCodeStandin, installGameStandin } from './standin.mjs';

export const VIEWPORT = { width: 1440, height: 900 };

/**
 * 外网被拦截时资源加载失败是预期内的，不算页面错误。各引擎的措辞不同：
 * Chromium `Failed to load resource` / `ERR_FAILED`，Firefox `Cross-Origin Request Blocked` / `NetworkError` / `NS_BINDING_ABORTED`，
 * WebKit `Fetch API cannot load … due to access control checks` / `Load failed`。
 */
const IGNORED_CONSOLE =
  /Failed to load resource|ERR_FAILED|Cross-Origin Request Blocked|NetworkError when attempting to fetch resource|NS_BINDING_ABORTED|due to access control checks|Load failed/;

/**
 * 引擎的临时（非持久）浏览器上下文有没有 OPFS。WebKit 的临时上下文等同于 Safari 的隐私浏览：
 * `navigator.storage.getDirectory()` 直接抛 `UnknownError`，本地库根本打不开，所以 WebKit 用持久 profile 跑冒烟。
 * （桌面在隐私浏览里会显示「Local storage is unavailable」，这是明确的不支持提示。）
 *
 * 注意：Playwright 的 WebKit 持久上下文即使 `userDataDir` 不同，**同一来源的 OPFS 也是共享的**（实测：一个上下文写的
 * OPFS 文件另一个上下文读得到，localStorage 却是隔离的）。所以检查组之间的隔离靠「每个检查组各起一个桌面服务器、
 * 各用各的来源」（见 `runner.mjs`），不能指望 profile 目录隔离。
 */
const EPHEMERAL_CONTEXT_HAS_OPFS = Object.freeze({ chromium: true, firefox: true, webkit: false });

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
 * @param {import('playwright').BrowserContextOptions} [options.context] 检查组要求的浏览器上下文选项（窄屏视口、触屏等）
 */
export async function createSession({
  browser,
  origin,
  label,
  distRoot,
  engine = 'chromium',
  standins = [],
  context: contextOptions = {}
}) {
  const viewport = contextOptions.viewport ?? VIEWPORT;
  const profile =
    EPHEMERAL_CONTEXT_HAS_OPFS[engine] ? null : await createPersistentProfile({ engine, viewport, contextOptions });
  const context = profile ? await profile.open() : await browser.newContext({ viewport, ...contextOptions });
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
      if (message.type() !== 'error' || IGNORED_CONSOLE.test(message.text())) return;
      const { url, lineNumber } = message.location();
      errors.push(url ? `${message.text()}（${url.replace(origin, '')}:${lineNumber}）` : message.text());
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
    /**
     * 刷新桌面，回到干净的起点。刷新会把开着的窗口恢复出来（ADESK-US-104）——上一轮的窗口会盖在这一轮要点的东西上，
     * 或者把要计数的窗口算多了。这里先关光窗口（关窗立即写回布局，所以布局里没有窗口，刷新时也没有开着的 iframe 拖着页面卸载），
     * 刷新后等启动结束（等条件：有窗口、窗口数稳定、没有窗口还在「Opening…」，不是固定延时）；
     * 万一还是恢复出了窗口就再关光，最后留一个全新的 Finder（`finder: false` 就不留），起点与刷新前「默认只有一个 Finder」一致。
     * 要验窗口恢复本身的检查组不用它，直接 `page.reload()`。
     *
     * @param {import('playwright').Page} [target] 要刷新的页面，默认是检查组的主页面
     * @param {{ finder?: boolean }} [options]
     */
    async reloadDesktop(target = page, { finder = true } = {}) {
      const targetHelpers = target === page ? helpers : createHelpers(target);
      await targetHelpers.closeAll();
      await target.reload({ waitUntil: 'load' });
      await targetHelpers.restored();
      const apps = await target.evaluate(() =>
        [...document.querySelectorAll('.win:not(.closing)')].map(node => node.getAttribute('data-app'))
      );
      const onlyDefaultFinder = apps.length === 1 && apps[0] === 'finder';
      if (finder && onlyDefaultFinder) return;
      await targetHelpers.closeAll();
      if (!finder) return;
      await target.locator('#dock .di[data-app="finder"]').click();
      await targetHelpers.win('finder').waitFor();
    },
    /** 打开桌面并等默认的 Finder 窗口出现；默认跳过开机动画。 */
    async openDesktop({ boot = false } = {}) {
      await page.goto(`${origin}/${boot ? '' : '?boot=0'}`, { waitUntil: 'load' });
      await helpers.win('finder').waitFor();
    },
    close: async () => {
      await context.close();
      await profile?.dispose();
    }
  };
}
