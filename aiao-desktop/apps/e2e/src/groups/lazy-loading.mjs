import {
  componentScripts,
  diskImageSeedScripts,
  lazyScripts,
  scriptNameOf,
  scriptsDeclaring,
  seedScripts,
  terminalRuntimeScripts
} from '../harness/chunks.mjs';
import { surgery, tableCounts } from '../harness/database.mjs';
import { passes } from '../harness/helpers.mjs';

/** 壳层自己会读的数据域：桌面上的日历、天气、股票小组件，以及通知中心里的提醒事项小组件（D-18）。 */
const SHELL_DOMAINS = ['calendar', 'reminders', 'stocks', 'weather'];
const SHELL_MARKERS = ['seed:disk', ...SHELL_DOMAINS.map(domain => `seed:${domain}`)];

/** 随桌面发布、按需加载的应用的根组件选择器（Finder 属于壳层，在首屏包里）。每个应用独立成一个 chunk。 */
const APP_SELECTORS = [
  'app-app-store',
  'app-github',
  'app-notes',
  'app-calculator',
  'app-calendar',
  'app-weather',
  'app-stocks',
  'app-reminders',
  'app-terminal',
  'app-settings',
  'app-safari',
  'app-music',
  'app-photos',
  'app-mail',
  'app-messages',
  'app-maps',
  'app-contacts',
  'app-clock',
  'app-freeform',
  'app-facetime',
  'app-shelf',
  'app-activity-monitor',
  'app-disk-utility',
  'app-font-book',
  'app-voice-memos',
  'app-textedit',
  'app-preview',
  'app-about',
  'app-saltline',
  'app-web-app'
];
/** 通知中心 / 桌面小组件对应的四个应用：它们的数据域归壳层读，应用本身没打开过就不该下载它们的组件。 */
const WIDGET_APPS = ['app-calendar', 'app-weather', 'app-stocks', 'app-reminders'];
const PANELS = {
  wifi: 'app-wifi-panel',
  bt: 'app-bluetooth-panel',
  batt: 'app-battery-panel',
  vol: 'app-sound-panel',
  cc: 'app-control-centre'
};
const OPTIONAL_COMPONENTS = [
  'app-launchpad',
  'app-spotlight',
  'app-notification-centre',
  ...Object.values(PANELS),
  'app-mail-compose',
  'app-empty-trash-dialog',
  'app-file-operation-dialog',
  'app-force-quit-panel',
  'app-boot-screen',
  'app-lock-screen',
  'app-data-problem',
  'app-file-panel'
];

const REMOTE_ENTRY = 'https://vscode.aiao.io/';

/** 反复检查，直到成立或超时。 */
async function eventually(check, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

/**
 * 应用按需加载（ADESK-US-206 阶段 A、B，D-18）：对正式构建记录网络请求，核对首屏只下载壳层、
 * 打开一个应用只下载它自己的 chunk、数据域的种子在第一次被读取时才写、同源 HTML 与远程应用只在窗口打开时请求入口。
 *
 * 证据来自构建产物本身（组件 chunk 与种子 chunk 按声明反查）和浏览器真实发出的请求，不看开发服务器。
 */
export const lazyLoading = {
  name: 'lazy-loading',
  description: '按需加载：首屏只有壳层、一次只加载被打开的应用、数据域首次读取才种、入口只在窗口打开时请求',
  standins: ['aiao-code', 'game'],
  keys: [
    'lazyLoading.everyAppIsItsOwnChunk',
    'lazyLoading.startupLoadsOnlyShellScripts',
    'lazyLoading.diskImagesLoadOnlyWhenSeeded',
    'lazyLoading.startupSkipsAppEntries',
    'lazyLoading.menuLoadsNoPanels',
    'lazyLoading.terminalRuntimeOnDemand',
    'lazyLoading.dismissedPanelStaysClosed',
    'lazyLoading.failedPanelReleasesDesktop',
    'lazyLoading.launchpadOnDemand',
    'lazyLoading.spotlightOnDemand',
    'lazyLoading.statusPanelsOnDemand',
    'lazyLoading.reopensWithoutRequests',
    'lazyLoading.notificationCentreOnDemand',
    'lazyLoading.startupWritesNoAppSeeds',
    'lazyLoading.oneAppLoadsOnlyItsChunk',
    'lazyLoading.oneAppWritesNoSeeds',
    'lazyLoading.firstReadSeedsItsDomain',
    'lazyLoading.widgetsShowSeededData',
    'lazyLoading.widgetsOnExistingLibrary',
    'lazyLoading.widgetsLoadNoAppChunks',
    'lazyLoading.remoteEntryOnlyWhenOpened',
    'lazyLoading.remoteEntryNotReloadedByMinimize',
    'lazyLoading.bundledHtmlOnlyWhenOpened',
    'lazyLoading.bundledHtmlFreshOnReopen'
  ],
  async run(session) {
    const { page, distRoot, origin } = session;
    const { win, closeAll, launch, spotlight, shows, appears, disappears } = session.helpers;

    /* 构建里的结构：哪个 chunk 是哪个应用的组件、哪个数据域的种子。 */
    const lazy = lazyScripts(distRoot);
    const components = componentScripts(distRoot);
    const seeds = seedScripts(distRoot);
    const chunkOf = selector => scriptsDeclaring(components, selector);
    const seedChunkOf = domain => scriptsDeclaring(seeds, domain);
    const diskImageChunks = [...diskImageSeedScripts(distRoot)].filter(name => lazy.has(name));
    const shellSeedChunks = new Set([...SHELL_DOMAINS.flatMap(seedChunkOf), ...diskImageChunks]);
    const terminalRuntime = terminalRuntimeScripts(distRoot);
    const notificationWidgets = [
      'app-reminders-widget',
      'app-clock-square-widget',
      'app-battery-square-widget'
    ].flatMap(chunkOf);
    const appSeedChunks = [...seeds]
      .filter(([, domains]) => domains.some(domain => !SHELL_DOMAINS.includes(domain)))
      .map(([name]) => name);
    /** 只打开 `selector` 这个应用（它的数据域是 `domain`）时不该下载的脚本：别的应用的组件与别的应用独有的种子。 */
    const forbiddenFor = (selector, domain) => [
      ...APP_SELECTORS.filter(other => other !== selector).flatMap(chunkOf),
      ...(selector === 'app-terminal' ? [] : terminalRuntime),
      ...appSeedChunks.filter(name => !domain || !seedChunkOf(domain).includes(name))
    ];

    /* 网络记录：从上下文级别记，iframe 与工作线程的请求也在里面。 */
    const requests = [];
    session.context.on('request', request => requests.push(request.url()));
    const scriptsSince = start => [
      ...new Set(
        requests
          .slice(start)
          .map(url => scriptNameOf(url, origin))
          .filter(Boolean)
      )
    ];
    const gameUrl = session.game.url;
    /** 远程应用的入口文档（替身应用的 Orbit 脚本不算）。 */
    const isRemoteEntry = url => url.startsWith(REMOTE_ENTRY) && !url.includes('/__standin/');
    const isGameEntry = url => url === gameUrl;
    const entriesSince = (start, matches) => requests.slice(start).filter(matches).length;

    const markers = () => surgery(session, db => db.markers());
    const markerKeys = async () => Object.keys(await markers()).sort();

    const lazyLoading = {};
    lazyLoading.everyAppIsItsOwnChunk =
      APP_SELECTORS.every(selector => chunkOf(selector).length === 1 && lazy.has(chunkOf(selector)[0])) &&
      new Set(APP_SELECTORS.flatMap(chunkOf)).size === APP_SELECTORS.length;

    const before = mark => requests.slice(0, mark).map(url => scriptNameOf(url, origin));
    const onlyOpened = (mark, selector) => {
      const scripts = scriptsSince(mark);
      const [chunk] = chunkOf(selector);
      const forbidden = [
        ...forbiddenFor(null),
        ...OPTIONAL_COMPONENTS.filter(other => other !== selector).flatMap(chunkOf)
      ];
      return (
        !before(mark).includes(chunk) && scripts.includes(chunk) && !scripts.some(name => forbidden.includes(name))
      );
    };

    let mark = requests.length;
    await session.openDesktop();
    await eventually(async () => (await markerKeys()).includes('seed:weather'));
    const startup = scriptsSince(mark);
    lazyLoading.startupLoadsOnlyShellScripts =
      startup.length > 0 &&
      OPTIONAL_COMPONENTS.every(selector => chunkOf(selector).length === 1 && lazy.has(chunkOf(selector)[0])) &&
      !startup.some(name =>
        [...OPTIONAL_COMPONENTS.flatMap(chunkOf), ...notificationWidgets, ...forbiddenFor(null)].includes(name)
      ) &&
      startup.filter(name => lazy.has(name)).every(name => shellSeedChunks.has(name));
    lazyLoading.startupSkipsAppEntries =
      requests.slice(mark).some(url => url.startsWith(`${origin}/`)) &&
      entriesSince(mark, isRemoteEntry) === 0 &&
      entriesSince(mark, isGameEntry) === 0;
    const startupMarkers = await markerKeys();
    lazyLoading.startupWritesNoAppSeeds =
      startupMarkers.includes('seed:disk') && startupMarkers.every(key => SHELL_MARKERS.includes(key));

    mark = requests.length;
    await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
    await page.locator('#layer-menu .pop').waitFor();
    lazyLoading.menuLoadsNoPanels = !scriptsSince(mark).some(name =>
      [...OPTIONAL_COMPONENTS.flatMap(chunkOf), ...forbiddenFor(null)].includes(name)
    );
    await page.keyboard.press('Escape');
    await page.locator('#layer-menu .pop').waitFor({ state: 'detached' });

    mark = requests.length;
    await page.locator('#dock .di[data-app="launchpad"]').click();
    await page.waitForFunction(() => document.activeElement?.matches('#lpad [data-lq]'));
    lazyLoading.launchpadOnDemand = onlyOpened(mark, 'app-launchpad');
    await page.keyboard.press('Escape');
    await page.locator('app-launchpad').waitFor({ state: 'detached' });

    mark = requests.length;
    await page.keyboard.press('Meta+Space');
    await page.waitForFunction(() => document.activeElement?.matches('#spot [data-sq]'));
    lazyLoading.spotlightOnDemand = onlyOpened(mark, 'app-spotlight');
    await page.keyboard.press('Escape');
    await page.locator('app-spotlight').waitFor({ state: 'detached' });

    const openPanel = async (key, selector) => {
      const button = page.locator(`#menubar [data-st="${key}"]`);
      await button.press('Enter');
      await page.waitForFunction(selector => document.activeElement?.closest(selector), selector);
      await page.keyboard.press('Escape');
      await page.locator(selector).waitFor({ state: 'detached' });
      return button.evaluate(node => node === document.activeElement);
    };
    const panelsOnDemand = [];
    for (const [key, selector] of Object.entries(PANELS)) {
      mark = requests.length;
      const refocused = await openPanel(key, selector);
      panelsOnDemand.push(onlyOpened(mark, selector) && refocused);
    }
    lazyLoading.statusPanelsOnDemand = panelsOnDemand.every(Boolean);
    mark = requests.length;
    lazyLoading.reopensWithoutRequests = (await openPanel('wifi', PANELS.wifi)) && scriptsSince(mark).length === 0;

    /* AC#5：只打开应用 A（Calculator），只加载它自己的 chunk，别的应用的组件与独有的种子都不下载。 */
    mark = requests.length;
    await page.locator('#dock .di[data-app="calculator"]').click();
    await win('calculator').waitFor();
    await page.waitForTimeout(800);
    const calculator = scriptsSince(mark);
    lazyLoading.oneAppLoadsOnlyItsChunk =
      calculator.includes(chunkOf('app-calculator')[0]) &&
      calculator.every(name => lazy.has(name)) &&
      !calculator.some(name => forbiddenFor('app-calculator').includes(name)) &&
      entriesSince(mark, isRemoteEntry) === 0 &&
      entriesSince(mark, isGameEntry) === 0;
    lazyLoading.oneAppWritesNoSeeds = (await markerKeys()).join() === startupMarkers.join();
    await closeAll();

    /* 数据域第一次被读取才种：在聚焦搜索里搜备忘录标题（备忘录应用还没打开过）——只多出备忘录的种子，不下载备忘录应用。 */
    mark = requests.length;
    await spotlight('interface');
    const noteShown = await shows(page.locator('#spot .r', { hasText: 'Interface rules' }));
    const searched = scriptsSince(mark);
    const searchMarkers = await markerKeys();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    lazyLoading.firstReadSeedsItsDomain =
      noteShown &&
      searchMarkers.includes('seed:notes') &&
      searchMarkers.every(key => [...SHELL_MARKERS, 'seed:notes'].includes(key)) &&
      searched.includes(seedChunkOf('notes')[0]) &&
      !searched.includes(chunkOf('app-notes')[0]) &&
      !searched.some(name => forbiddenFor('app-notes', 'notes').includes(name));

    /* 再打开备忘录应用：这时只下载它的组件，别的应用的组件与种子仍然没有。 */
    mark = requests.length;
    await page.locator('#dock .di[data-app="notes"]').click();
    await win('notes').waitFor();
    await page.waitForTimeout(800);
    const notes = scriptsSince(mark);
    lazyLoading.oneAppLoadsOnlyItsChunk =
      lazyLoading.oneAppLoadsOnlyItsChunk &&
      notes.includes(chunkOf('app-notes')[0]) &&
      notes.every(name => lazy.has(name)) &&
      !notes.some(name => forbiddenFor('app-notes', 'notes').includes(name));
    await closeAll();

    /* AC#6：四个小组件应用都没打开过。全新的库上打开通知中心，小组件显示内置的初始数据。 */
    const widgets = () =>
      page.evaluate(() => ({
        stocks: document.querySelectorAll('#nc .stk .row').length,
        hours: document.querySelectorAll('#nc [data-wxw] .hours > div').length,
        place: document.querySelector('#nc [data-wxw] .loc')?.textContent?.trim() ?? '',
        weatherText: document.querySelector('#nc [data-wxw]')?.textContent ?? '',
        remaining:
          [...document.querySelectorAll('#nc .wgt .wh .s')]
            .map(node => node.textContent?.trim() ?? '')
            .find(text => /remaining$/.test(text)) ?? ''
      }));
    const showsSeededWidgets = async () =>
      passes(
        page.waitForFunction(
          () =>
            /^[1-9]\d* remaining$/.test(
              document.querySelector('#nc app-reminders-widget .wh .s')?.textContent?.trim() ?? ''
            ),
          undefined,
          {
            timeout: 10_000
          }
        )
      ).then(async shown => {
        const seen = await widgets();
        return (
          shown &&
          seen.stocks === 3 &&
          seen.hours === 0 &&
          seen.place !== '' &&
          seen.weatherText.includes('No weather data') &&
          !/\d+°/.test(seen.weatherText)
        );
      });
    const databaseHoldsSeeds = async () =>
      (
        await tableCounts(
          session,
          ['calendar_event', 'reminder', 'weather_city', 'watchlist_symbol'].map(table => `desktop$${table}`)
        )
      ).every(count => count > 0);

    const remindersBefore = (await markerKeys()).includes('seed:reminders');
    mark = requests.length;
    await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
    await page.locator('#nc .wgt').first().waitFor();
    lazyLoading.widgetsShowSeededData =
      !remindersBefore &&
      (await showsSeededWidgets()) &&
      (await databaseHoldsSeeds()) &&
      (await markerKeys()).includes('seed:reminders');
    lazyLoading.notificationCentreOnDemand =
      onlyOpened(mark, 'app-notification-centre') &&
      notificationWidgets.length === 3 &&
      notificationWidgets.every(name => !before(mark).includes(name) && scriptsSince(mark).includes(name));
    const widgetScripts = scriptsSince(mark);
    await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
    await page.waitForTimeout(500);

    /* 已有数据的库：刷新后再开通知中心，小组件照样显示，种子不重写。 */
    const markersBefore = await markers();
    mark = requests.length;
    await session.reloadDesktop();
    await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
    await page.locator('#nc .wgt').first().waitFor();
    lazyLoading.widgetsOnExistingLibrary =
      (await showsSeededWidgets()) && JSON.stringify(await markers()) === JSON.stringify(markersBefore);
    const existingScripts = scriptsSince(mark);
    lazyLoading.diskImagesLoadOnlyWhenSeeded =
      diskImageChunks.length > 0 &&
      diskImageChunks.every(name => startup.includes(name) && !existingScripts.includes(name));
    await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
    await page.waitForTimeout(500);
    const widgetChunks = WIDGET_APPS.flatMap(chunkOf);
    lazyLoading.widgetsLoadNoAppChunks =
      widgetChunks.length === WIDGET_APPS.length &&
      !widgetScripts.some(name => widgetChunks.includes(name)) &&
      !existingScripts.some(name => widgetChunks.includes(name));

    /* AC#2：远程应用只在窗口打开时请求入口；最小化与还原不重复加载。 */
    await closeAll();
    const vscodeWin = win('vscode');
    const entryBefore = entriesSince(0, isRemoteEntry);
    await page.locator('#dock .di[data-app="vscode"]').click();
    const ready = await appears(vscodeWin.locator('.webapp[data-webapp-state="ready"]'), 15_000);
    lazyLoading.remoteEntryOnlyWhenOpened = entryBefore === 0 && ready && entriesSince(0, isRemoteEntry) === 1;
    await vscodeWin.locator('.tl .m').click();
    await page.waitForTimeout(700);
    await page.locator('#dock .di[data-app="vscode"]').click();
    await page.waitForTimeout(900);
    lazyLoading.remoteEntryNotReloadedByMinimize = entriesSince(0, isRemoteEntry) === 1;
    await closeAll();

    /* AC#1：同源 HTML 应用只在窗口打开时请求入口；关闭销毁 iframe，重新打开是新实例。 */
    const gameFrame = win('saltline').locator('[data-saltline-frame]');
    const gameBefore = entriesSince(0, isGameEntry);
    await launch('几猫3A大作');
    const opened = await appears(gameFrame);
    await page.waitForFunction(
      () => document.querySelector('[data-saltline-frame]')?.contentWindow?.standin,
      undefined,
      {
        timeout: 10_000
      }
    );
    lazyLoading.bundledHtmlOnlyWhenOpened = gameBefore === 0 && opened && entriesSince(0, isGameEntry) === 1;
    await closeAll();
    const removed = await disappears(page.locator('[data-saltline-frame]'), 3_000);
    await launch('几猫3A大作');
    await appears(gameFrame);
    await page.waitForFunction(
      () => document.querySelector('[data-saltline-frame]')?.contentWindow?.standin,
      undefined,
      {
        timeout: 10_000
      }
    );
    lazyLoading.bundledHtmlFreshOnReopen = removed && entriesSince(0, isGameEntry) === 2;

    await closeAll();
    mark = requests.length;
    await launch('Terminal');
    await win('terminal').locator('.xterm-helper-textarea').waitFor();
    lazyLoading.terminalRuntimeOnDemand =
      terminalRuntime.length > 0 &&
      terminalRuntime.every(name => !before(mark).includes(name) && scriptsSince(mark).includes(name));

    await closeAll();
    const forceQuit = page.locator('app-force-quit-panel');
    const openForceQuit = async () => {
      await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
      await page.getByRole('menuitem', { name: /Force Quit/ }).click();
    };
    const panelUrl = `${origin}/${chunkOf('app-force-quit-panel')[0]}`;
    const resume = Promise.withResolvers();
    await page.route(
      panelUrl,
      async route => {
        await resume.promise;
        await route.continue();
      },
      { times: 1 }
    );
    await Promise.all([page.waitForRequest(panelUrl), openForceQuit()]);
    await page.keyboard.press('Escape');
    await page.locator('#menu-shield.on').waitFor({ state: 'detached' });
    const loaded = page.waitForEvent('requestfinished', request => request.url() === panelUrl);
    resume.resolve();
    await loaded;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    lazyLoading.dismissedPanelStaysClosed =
      (await forceQuit.count()) === 0 && (await page.locator('#menu-shield.on').count()) === 0;

    await session.reloadDesktop();
    await page.route(panelUrl, route => route.abort(), { times: 1 });
    await openForceQuit();
    await page.getByRole('status').filter({ hasText: 'Could not load this panel' }).waitFor();
    lazyLoading.failedPanelReleasesDesktop =
      (await forceQuit.count()) === 0 && (await page.locator('#menu-shield.on').count()) === 0;

    return { lazyLoading };
  }
};
