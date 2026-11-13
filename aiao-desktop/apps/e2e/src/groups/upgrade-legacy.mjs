import { PREFERENCES, schemaVersionOf, surgery } from '../harness/database.mjs';
import { readUserData, userDataIntact, writeUserData } from '../harness/user-data.mjs';

/** 数据域 clock 的世界时钟表：用来模拟「当前版本新增的数据域」（删表、删种子标记）。 */
const CLOCK_TABLE = 'desktop$world_clock';
const INTERRUPT_AFTER = [400, 900, 1_500, 2_400];

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withoutClock = markers => Object.fromEntries(Object.entries(markers).filter(([key]) => key !== 'seed:clock'));
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));

/**
 * 旧库升级（ADESK-US-106 AC#1、#2、#4、#6）：用夹具把库改成此前发布的构建建出来的样子（删掉版本记录），
 * 再用当前构建打开，核对数据保留、版本记录写入、新数据域补种子一次、升级被打断后的完整性与可重复。
 * 此前所有发布的构建建的库都没有版本记录，删掉记录就是它们的状态；真实的旧产物另在验收台账里手工对照一次。
 */
export const upgradeLegacy = {
  name: 'upgrade-legacy',
  description: '旧库升级：没有版本记录的库、新增数据域补种子、升级中途被打断、重复升级',
  keys: [
    'upgradeLegacy.freshDatabaseGetsRecord',
    'upgradeLegacy.legacyKeepsData',
    'upgradeLegacy.legacyGetsVersionRecord',
    'upgradeLegacy.seedsNotRewritten',
    'upgradeLegacy.newDomainSeededOnce',
    'upgradeLegacy.existingDomainsNotOverwritten',
    'upgradeLegacy.notReseededOnReload',
    'upgradeLegacy.upgradeIsRepeatable',
    'upgradeLegacy.interruptedStateIsWhole',
    'upgradeLegacy.interruptedUpgradeRecovers',
    'upgradeLegacy.noDuplicateSeedsAfterInterrupt'
  ],
  async run(session) {
    const current = schemaVersionOf(session.distRoot);
    await session.page.close();
    const result = {};

    /* 全新的库：建库后就带着当前版本的记录，再写下用户数据。 */
    let desktop = await session.openDesktopPage();
    await writeUserData(desktop.page, desktop.helpers);
    await desktop.page.close();
    const fresh = await surgery(session, async db => ({
      record: await db.record(),
      markers: await db.markers(),
      noteRows: await db.count('desktop$note')
    }));
    result.freshDatabaseGetsRecord = fresh.record?.version === current;

    /* 1) 此前发布的构建建的库（没有版本记录）：当前构建打开，数据都在，记录补上，种子标记原样。 */
    await surgery(session, db => db.deleteRecord());
    desktop = await session.openDesktopPage();
    const keptLegacy = await readUserData(desktop.page, desktop.helpers);
    await desktop.page.close();
    const afterLegacy = await surgery(session, async db => ({
      record: await db.record(),
      markers: await db.markers()
    }));
    result.legacyKeepsData = userDataIntact(keptLegacy);
    result.legacyGetsVersionRecord = afterLegacy.record?.version === current;
    result.seedsNotRewritten = sameJson(afterLegacy.markers, fresh.markers);

    /* 2) 当前版本新增了一个数据域（模拟：删掉 clock 的表与种子标记，并去掉版本记录）：补建表、补种子一次，别的域不动。 */
    await surgery(session, async db => {
      await db.deleteRecord();
      await db.deleteMarker('clock');
      await db.dropTable(CLOCK_TABLE);
    });
    desktop = await session.openDesktopPage();
    const keptAfterDomain = await readUserData(desktop.page, desktop.helpers);
    await desktop.page.close();
    const seeded = await surgery(session, async db => ({
      record: await db.record(),
      markers: await db.markers(),
      clockRows: await db.count(CLOCK_TABLE),
      noteRows: await db.count('desktop$note')
    }));
    result.newDomainSeededOnce = seeded.clockRows > 0 && 'seed:clock' in seeded.markers;
    result.existingDomainsNotOverwritten =
      userDataIntact(keptAfterDomain) &&
      seeded.noteRows === fresh.noteRows &&
      sameJson(withoutClock(seeded.markers), withoutClock(fresh.markers));

    /* 刷新（重开）后不重写：行数与标记都不变。 */
    desktop = await session.openDesktopPage();
    await desktop.page.close();
    const reopened = await surgery(session, async db => ({
      record: await db.record(),
      markers: await db.markers(),
      clockRows: await db.count(CLOCK_TABLE)
    }));
    result.notReseededOnReload =
      reopened.clockRows === seeded.clockRows &&
      sameJson(reopened.markers, seeded.markers) &&
      reopened.record?.version === current;

    /* 重复升级：再回到「没有版本记录」的状态升一次，数据与种子仍然完整（同一份升级可重复执行）。 */
    await surgery(session, db => db.deleteRecord());
    desktop = await session.openDesktopPage();
    const keptAgain = await readUserData(desktop.page, desktop.helpers);
    await desktop.page.close();
    const again = await surgery(session, async db => ({
      record: await db.record(),
      markers: await db.markers(),
      clockRows: await db.count(CLOCK_TABLE)
    }));
    result.upgradeIsRepeatable =
      userDataIntact(keptAgain) &&
      again.record?.version === current &&
      again.clockRows === seeded.clockRows &&
      sameJson(again.markers, seeded.markers);

    /* 3) 升级中途关闭标签页：库要么还是升级前（没有记录），要么是升级后的完整状态（有记录、表在、种子完整）。 */
    const wholeStates = [];
    for (const delay of INTERRUPT_AFTER) {
      await surgery(session, async db => {
        await db.deleteRecord();
        await db.deleteMarker('clock');
        await db.dropTable(CLOCK_TABLE);
      });
      const interrupted = await session.openPage();
      void interrupted.goto(`${session.origin}/?boot=0`).catch(() => undefined);
      await interrupted.waitForTimeout(delay);
      await interrupted.close();
      await pause(400);
      const state = await surgery(session, async db => {
        const tables = await db.tables();
        const hasClock = tables.includes(CLOCK_TABLE);
        const record = await db.record();
        const markers = await db.markers();
        return {
          record,
          hasClock,
          marked: 'seed:clock' in markers,
          rows: hasClock ? await db.count(CLOCK_TABLE) : 0,
          preferencesTable: tables.includes(PREFERENCES)
        };
      });
      /* 升级前：没有记录。升级后：有记录，clock 表已补建；种子标记存在就必须带着完整的种子行（种子与标记同一个事务）。 */
      const before = state.record === undefined;
      const after =
        state.record?.version === current && state.hasClock && (!state.marked || state.rows === seeded.clockRows);
      wholeStates.push(
        state.preferencesTable && (before || after) && (!state.marked || state.rows === seeded.clockRows)
      );
    }
    result.interruptedStateIsWhole = wholeStates.every(Boolean);

    /* 被打断之后再正常打开：升级完成，数据完整，种子行数与单次种子一致，没有重复。 */
    desktop = await session.openDesktopPage();
    const keptAfterInterrupts = await readUserData(desktop.page, desktop.helpers);
    await desktop.page.close();
    const recovered = await surgery(session, async db => ({
      record: await db.record(),
      markers: await db.markers(),
      clockRows: await db.count(CLOCK_TABLE)
    }));
    result.interruptedUpgradeRecovers = userDataIntact(keptAfterInterrupts) && recovered.record?.version === current;
    result.noDuplicateSeedsAfterInterrupt =
      recovered.clockRows === seeded.clockRows && 'seed:clock' in recovered.markers;

    return { upgradeLegacy: result };
  }
};
