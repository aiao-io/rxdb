import { compareApps, readLaunchpadEntries } from '../harness/apps.mjs';

/** 由本组逐个从启动台打开的应用（登记表的 id）。 */
export const OPENED_APPS = [
  'finder',
  'safari',
  'mail',
  'messages',
  'maps',
  'photos',
  'facetime',
  'calendar',
  'contacts',
  'reminders',
  'notes',
  'freeform',
  'voice',
  'appstore',
  'podcasts',
  'music',
  'tv',
  'books',
  'saltline',
  'stocks',
  'weather',
  'clock',
  'terminal',
  'activity',
  'diskutil',
  'fontbook',
  'calculator',
  'textedit',
  'preview',
  'settings'
];

/**
 * 启动台里有、但由别的检查组覆盖的应用：`vscode`（Aiao Code）在 `integrated-app` 与 `transparent-window`；
 * `about`（关于本机）显示名和 Finder 相同，从启动台按名字搜只会命中 Finder，它由 Apple 菜单进入。
 */
export const COVERED_ELSEWHERE = ['vscode', 'about'];

/** 每个应用都能从启动台打开，且不产生错误；应用清单由启动台的实际条目与登记表核对，不再手写第二份。 */
export const apps = {
  name: 'apps',
  description: '启动台里的每个应用都能打开；启动台条目与冒烟声明的应用逐项核对',
  standins: ['game'],
  keys: ['everyAppOpens', 'unopened'],
  async run(session) {
    const { page } = session;
    const { win, closeAll, launch } = session.helpers;
    await session.openDesktop();
    await closeAll();

    await page.locator('#dock .di[data-app="launchpad"]').click();
    await page.waitForFunction(() => document.activeElement?.matches('#lpad [data-lq]'));
    const entries = await readLaunchpadEntries(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#lpad'));

    const { uncovered, unknown } = compareApps(entries, { opened: OPENED_APPS, elsewhere: COVERED_ELSEWHERE });
    const unopened = [...uncovered.map(id => `uncovered:${id}`), ...unknown.map(id => `unknown:${id}`)];
    for (const entry of entries.filter(item => OPENED_APPS.includes(item.id))) {
      await closeAll();
      await launch(entry.name);
      try {
        /* 应用按需加载：第一次打开要先下载它的 chunk，负载高（并行跑多个检查组）时 3 秒不够。 */
        await win(entry.id).waitFor({ timeout: 10_000 });
      } catch {
        unopened.push(entry.id);
      }
    }
    await closeAll();
    return { everyAppOpens: unopened.length === 0, unopened };
  }
};
