import { surgery } from '../harness/database.mjs';
import { passes } from '../harness/helpers.mjs';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** 同时刷新两个页面的轮数：启动期的冲突是概率性的，一轮看不出来（实测同时刷新两个页面约三十分之一出现过「找不到文件或目录」）。 */
const RELOAD_ROUNDS = 8;

/** 页面里桌面起来了：磁盘种好、桌面图标出现，且没有「本地数据不可用 / 磁盘不可用」的提示。 */
const started = async (page, timeout = 60_000) => {
  const iconShown = await passes(
    page.locator('.dicon[data-id="file:prasenx.txt"]').waitFor({ state: 'attached', timeout })
  );
  const unavailable = await page.evaluate(() =>
    /is unavailable|Local storage is unavailable/.test(document.body.innerText)
  );
  return iconShown && !unavailable;
};

/**
 * 两个标签页同时打开桌面（ADESK-US-105 阶段 A 的启动期并发）：库的连接、建表、升级、首次复制内置内容与应用目录对账、
 * 数据域的种子，都是「查了再写」的复合操作，两个标签页交错执行会撞上唯一索引或同时初始化 OPFS 里的库文件，
 * 表现为其中一个标签页的磁盘或本地数据打不开（需要刷新）。这些步骤都在跨标签页的锁里，一个接一个来。
 */
export const multiTabStartup = {
  name: 'multi-tab-startup',
  description:
    '两个标签页同时启动：全新的库两页都起得来、已有数据时同时刷新两页也都起得来、两页同时第一次读同一个数据域只种一次、没有页面错误',
  timeout: 600_000,
  keys: [
    'multiTabStartup.freshLibraryBothStart',
    'multiTabStartup.reloadBothStart',
    'multiTabStartup.sameDomainSeededOnce',
    'multiTabStartup.noPageErrors'
  ],
  async run(session) {
    const { page: A, helpers: hA, origin } = session;
    const multiTabStartup = {};

    /* 全新的库（本检查组的上下文是新的，没有任何站点数据）：两个页面在同一时刻开始加载桌面。 */
    const pendingB = session.openDesktopPage({ waitForFinder: false });
    await Promise.all([A.goto(`${origin}/?boot=0`, { waitUntil: 'load' }), pendingB]);
    const { page: B, helpers: hB } = await pendingB;
    const [firstA, firstB] = await Promise.all([started(A), started(B)]);
    multiTabStartup.freshLibraryBothStart = firstA && firstB;

    /* 已有数据的库：同时刷新两个页面，多轮。 */
    let everyRound = true;
    for (let round = 0; round < RELOAD_ROUNDS; round++) {
      await Promise.all([A.reload({ waitUntil: 'load' }), B.reload({ waitUntil: 'load' })]);
      const [okA, okB] = await Promise.all([started(A), started(B)]);
      everyRound &&= okA && okB;
      await sleep(300);
    }
    multiTabStartup.reloadBothStart = everyRound;

    /* 两个页面同一时刻第一次读同一个数据域（备忘录）：先拿到锁的种，另一个看到标记就跳过；两边的列表一致且非空。 */
    const before = session.errors.length;
    await Promise.all([hA.closeAll(), hB.closeAll()]);
    await Promise.all([A, B].map(page => page.locator('#dock .di[data-app="notes"]').click()));
    await Promise.all([hA.win('notes').waitFor(), hB.win('notes').waitFor()]);
    await sleep(2_500);
    const lists = await Promise.all(
      [A, B].map(page =>
        page.evaluate(() => document.querySelector('.win[data-app="notes"] [data-items]')?.textContent?.trim() ?? '')
      )
    );
    const markers = await surgery(session, db => db.markers());
    multiTabStartup.sameDomainSeededOnce =
      lists[0] !== '' && lists[0] === lists[1] && 'seed:notes' in markers && session.errors.length === before;

    multiTabStartup.noPageErrors = session.errors.length === 0;
    return { multiTabStartup };
  }
};
