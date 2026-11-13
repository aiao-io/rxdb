import { resolve } from 'node:path';

import { startArtifactServer } from '../fixtures/artifact-server.mjs';
import { openSqliteShell } from '../fixtures/sqlite-shell.mjs';
import { schemaVersionOf } from '../harness/database.mjs';
import { createHelpers } from '../harness/helpers.mjs';
import { readUserData, userDataIntact, writeUserData } from '../harness/user-data.mjs';

/**
 * 真实的上一版产物升级到当前构建（ADESK-US-106 AC#1）：同一个来源先托管「升级起点」的产物建库、写数据，
 * 再切到当前产物打开。起点登记在故事的「升级起点」表里；产物用环境变量 `AIAO_DESKTOP_PREVIOUS_DIST` 指向
 * （在起点提交上跑一次 `pnpm nx run aiao-desktop-web:build`，把 `dist/aiao-desktop/apps/web/browser` 留下来）。
 *
 * 默认不随全量冒烟运行：起点产物不在仓库里，CI 里没有。`upgrade-legacy` 用夹具改库模拟同一个状态
 * （此前发布的构建建的库只是少了版本记录），这一组是拿真产物再对照一次。
 */
export const upgradePrevious = {
  name: 'upgrade-previous',
  default: false,
  description: '真实的上一版产物建库 → 同一来源切到当前产物打开（需要环境变量 AIAO_DESKTOP_PREVIOUS_DIST）',
  keys: [
    'upgradePrevious.previousBuildWritesNoRecord',
    'upgradePrevious.originStaysTheSame',
    'upgradePrevious.dataSurvivesUpgrade',
    'upgradePrevious.versionRecordWritten'
  ],
  async run(session) {
    const previousDist = process.env.AIAO_DESKTOP_PREVIOUS_DIST;
    if (!previousDist) throw new Error('缺少环境变量 AIAO_DESKTOP_PREVIOUS_DIST：指向升级起点产物的 browser 目录');
    const previous = resolve(previousDist);
    const current = session.distRoot;
    const server = await startArtifactServer({ root: previous });
    const context = await session.browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route(
      url => !url.href.startsWith(server.origin),
      route => route.abort()
    );
    try {
      let page = await context.newPage();
      await page.goto(`${server.origin}/?boot=0`);
      let helpers = createHelpers(page);
      await helpers.win('finder').waitFor();
      await writeUserData(page, helpers);
      await page.close();
      const shell = await openSqliteShell(context, { origin: server.origin, distRoot: previous });
      const recordBefore = await shell.rows(
        `SELECT "value" FROM "desktop$system_preference" WHERE "key" = 'schema:desktop'`
      );
      await shell.close();

      const origin = server.origin;
      server.switchTo(current);
      page = await context.newPage();
      await page.goto(`${server.origin}/?boot=0`);
      helpers = createHelpers(page);
      await helpers.win('finder').waitFor();
      const kept = await readUserData(page, helpers);
      await page.close();
      const after = await openSqliteShell(context, { origin: server.origin, distRoot: current });
      const recordAfter = await after.rows(
        `SELECT "value" FROM "desktop$system_preference" WHERE "key" = 'schema:desktop'`
      );
      await after.close();
      return {
        upgradePrevious: {
          previousBuildWritesNoRecord: recordBefore.length === 0,
          originStaysTheSame: server.origin === origin,
          dataSurvivesUpgrade: userDataIntact(kept),
          versionRecordWritten:
            recordAfter.length === 1 && JSON.parse(recordAfter[0][0]).version === schemaVersionOf(current)
        }
      };
    } finally {
      await context.close();
      server.close();
    }
  }
};
