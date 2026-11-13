import { schemaVersionOf, surgery } from '../harness/database.mjs';
import { passes } from '../harness/helpers.mjs';
import { readUserData, userDataIntact, writeUserData } from '../harness/user-data.mjs';

const CLOCK_TABLE = 'desktop$world_clock';
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 阻断界面的文字与按钮（`components/data-problem.html` 里的钩子）。 */
const problemOf = page => ({
  screen: page.locator('[data-data-problem]'),
  title: page.locator('[data-dp-title]'),
  details: page.locator('[data-dp-details]'),
  reload: page.locator('[data-dp-reload]'),
  askErase: page.locator('[data-dp-ask-erase]'),
  confirm: page.locator('[data-dp-confirm]'),
  erase: page.locator('[data-dp-erase]')
});

/** 等阻断界面出现并读出标题；等不到返回空串。 */
async function problemTitle(page) {
  const problem = problemOf(page);
  const shown = await problem.screen.waitFor({ state: 'visible', timeout: 10_000 }).then(
    () => true,
    () => false
  );
  return shown ? ((await problem.title.textContent()) ?? '').trim() : '';
}

/**
 * 降级保护、并存的新旧标签页与损坏的库（ADESK-US-106 AC#3、#5、#7）：库被更新的构建升级过，当前构建拒绝打开且不写库；
 * 开着的页面发现库被别处升级就拒绝写入；库损坏时不静默修补，给出明确说明与恢复入口。
 */
export const upgradeProtection = {
  name: 'upgrade-protection',
  description: '降级保护、新旧标签页并存拒绝写入、损坏的库不静默修补、抹掉本地数据后重新开始',
  keys: [
    'upgradeProtection.newerDataShowsUpdateNotice',
    'upgradeProtection.newerDataOffersNoErase',
    'upgradeProtection.newerDataNotWritten',
    'upgradeProtection.dataIntactAfterReturning',
    'upgradeProtection.staleTabRefusesWrite',
    'upgradeProtection.staleTabAsksReload',
    'upgradeProtection.staleWriteNotInDatabase',
    'upgradeProtection.dataIntactAfterReload',
    'upgradeProtection.brokenRecordShowsProblem',
    'upgradeProtection.incompatibleShowsProblem',
    'upgradeProtection.damagedShowsProblem',
    'upgradeProtection.damagedNotPatched',
    'upgradeProtection.damagedOffersRecovery',
    'upgradeProtection.eraseRestartsFresh'
  ],
  async run(session) {
    const current = schemaVersionOf(session.distRoot);
    await session.page.close();
    const result = {};

    let desktop = await session.openDesktopPage();
    await writeUserData(desktop.page, desktop.helpers);
    await desktop.page.close();

    /* 降级保护：库被更新的构建升过（版本记录更高），当前构建拒绝打开、不写库、不给「抹掉」；记录回到当前版本后数据完整。 */
    const untouched = await surgery(session, async db => {
      await db.setRecord({ version: current + 1, build: '', upgradedAt: 1 });
      return { preferences: await db.preferences(), files: await db.count('desktop$desktop_file') };
    });
    desktop = await session.openDesktopPage({ waitForFinder: false });
    result.newerDataShowsUpdateNotice = (await problemTitle(desktop.page)).includes('needs to be updated');
    const newer = problemOf(desktop.page);
    result.newerDataOffersNoErase = (await newer.askErase.count()) === 0 && (await newer.reload.isVisible());
    await desktop.page.close();
    const afterNewer = await surgery(session, async db => ({
      preferences: await db.preferences(),
      files: await db.count('desktop$desktop_file')
    }));
    result.newerDataNotWritten = sameJson(afterNewer, untouched);
    await surgery(session, db => db.setRecord({ version: current, build: '', upgradedAt: 1 }));
    desktop = await session.openDesktopPage();
    result.dataIntactAfterReturning = userDataIntact(await readUserData(desktop.page, desktop.helpers));
    await desktop.page.close();

    /* 新旧版本的标签页并存：页面 A 开着（当前构建），另一个标签页把库升到更高的版本，A 里再写就被拒绝并提示刷新。 */
    const stale = await session.openDesktopPage();
    const { page: tabA, helpers: helpersA } = stale;
    /* 窗口布局也要写库（ADESK-US-104）：开关窗口、换目录都会写回。库被升级之后任何一次写入都会被拒绝，
     * 提示盖住整个桌面——所以先把窗口摆好（Finder 停在 Desktop）、等布局写完，升级之后只剩要验证的那一次写入：新建文件夹。 */
    await helpersA.closeAll();
    await tabA.locator('#dock .di[data-app="finder"]').click();
    await helpersA.win('finder').last().locator('[data-place="Desktop"]').click();
    await tabA.waitForTimeout(1_500);
    const filesBefore = await surgery(session, async db => {
      const count = await db.count('desktop$desktop_file');
      await db.setRecord({ version: current + 1, build: '', upgradedAt: 2 });
      return count;
    });
    await helpersA.win('finder').last().locator('[data-more]').click();
    await tabA.locator('#layer-menu .pop .mi', { hasText: 'New Folder' }).click();
    const staleTitle = await problemTitle(tabA);
    result.staleTabRefusesWrite = staleTitle.includes('updated in another tab');
    result.staleTabAsksReload = await problemOf(tabA).reload.isVisible();
    await tabA.close();
    const filesAfter = await surgery(session, async db => {
      const count = await db.count('desktop$desktop_file');
      await db.setRecord({ version: current, build: '', upgradedAt: 3 });
      return count;
    });
    result.staleWriteNotInDatabase = filesAfter === filesBefore;
    desktop = await session.openDesktopPage();
    result.dataIntactAfterReload = userDataIntact(await readUserData(desktop.page, desktop.helpers));
    await desktop.page.close();

    /* 损坏的库：版本记录不是版本记录（值列有 JSON_VALID 约束，所以只能是形状不对的合法 JSON）；版本记录是个没有迁移路径的旧版本。不静默修补，说明原因。 */
    await surgery(session, db => db.setRecord('"not a schema record"'));
    desktop = await session.openDesktopPage({ waitForFinder: false });
    result.brokenRecordShowsProblem = (await problemTitle(desktop.page)).includes('damaged');
    await desktop.page.close();
    await surgery(session, db => db.setRecord({ version: 5, build: '', upgradedAt: 1 }));
    desktop = await session.openDesktopPage({ waitForFinder: false });
    result.incompatibleShowsProblem = (await problemTitle(desktop.page)).includes('can’t be upgraded');
    await desktop.page.close();

    /* 版本记录等于当前版本但缺了一张表：报出缺的表，不静默补建，给出恢复入口。 */
    await surgery(session, async db => {
      await db.setRecord({ version: current, build: '', upgradedAt: 1 });
      await db.dropTable(CLOCK_TABLE);
    });
    desktop = await session.openDesktopPage({ waitForFinder: false });
    const damaged = problemOf(desktop.page);
    result.damagedShowsProblem =
      (await problemTitle(desktop.page)).includes('damaged') &&
      ((await damaged.details.textContent()) ?? '').includes(CLOCK_TABLE);
    result.damagedOffersRecovery = (await damaged.askErase.isVisible()) && (await damaged.reload.isVisible());
    const afterDamage = await surgery(session, async db => ({
      tables: await db.tables(),
      record: await db.record()
    }));
    result.damagedNotPatched = !afterDamage.tables.includes(CLOCK_TABLE) && afterDamage.record?.version === current;

    /* 恢复：抹掉本地数据要再确认一次，之后是一份全新的桌面（用户数据没了，内置内容回来了）。 */
    await damaged.askErase.click();
    const confirming = await passes(damaged.confirm.waitFor({ state: 'visible', timeout: 3_000 }));
    await Promise.all([desktop.page.waitForEvent('load', { timeout: 30_000 }), damaged.erase.click()]);
    await desktop.helpers.win('finder').waitFor();
    const fresh = await desktop.helpers.appears(desktop.helpers.desktopIcon('prasenx.txt'), 30_000);
    const gone = (await desktop.helpers.desktopIcon('untitled folder').count()) === 0;
    await desktop.page.close();
    const rebuilt = await surgery(session, async db => ({ record: await db.record(), tables: await db.tables() }));
    result.eraseRestartsFresh =
      confirming && fresh && gone && rebuilt.record?.version === current && rebuilt.tables.includes(CLOCK_TABLE);

    return { upgradeProtection: result };
  }
};
