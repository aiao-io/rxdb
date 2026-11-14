import { startArtifactServer } from '../fixtures/artifact-server.mjs';
import { previousBuildSource } from '../fixtures/previous-build.mjs';
import { openSqliteShell } from '../fixtures/sqlite-shell.mjs';
import { schemaVersionOf } from '../harness/database.mjs';
import { createHelpers } from '../harness/helpers.mjs';
import { readUserData, userDataIntact, writeUserData } from '../harness/user-data.mjs';

/**
 * 真实的上一版产物升级到当前构建（ADESK-US-106 AC#1）：同一个来源先托管「升级起点」的产物建库、写数据，
 * 再切到当前产物打开。起点登记在故事的「升级起点」表里；产物用环境变量 `AIAO_DESKTOP_PREVIOUS_DIST` 指向
 * （在起点提交上跑一次 `pnpm nx run aiao-desktop-web:build`，把 `dist/aiao-desktop/apps/web/browser` 留下来）。
 *
 * 也可用 `AIAO_DESKTOP_PREVIOUS_URL` 指向固定生产部署：先通过真实网络加载旧构建建库，
 * 再在相同 HTTPS 来源下拦截为当前正式构建；不发布、不修改线上资源。
 *
 * 默认不随全量冒烟运行：起点产物不在仓库里，CI 里没有。`upgrade-legacy` 用夹具改库模拟同一个状态
 * （此前发布的构建建的库只是少了版本记录），这一组是拿真产物再对照一次。
 */
export const upgradePrevious = {
  name: 'upgrade-previous',
  default: false,
  description:
    '真实的上一版产物建库 → 同一来源切到当前产物打开（需要 AIAO_DESKTOP_PREVIOUS_DIST 或 AIAO_DESKTOP_PREVIOUS_URL）',
  keys: [
    'upgradePrevious.previousBuildWritesNoRecord',
    'upgradePrevious.originStaysTheSame',
    'upgradePrevious.dataSurvivesUpgrade',
    'upgradePrevious.versionRecordWritten'
  ],
  async run(session) {
    const previous = previousBuildSource(process.env);
    const current = session.distRoot;
    const server = await startArtifactServer({ root: previous.dist ?? current });
    const origin = previous.url ?? server.origin;
    const context = await session.browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block'
    });
    context.on('page', page => page.on('pageerror', error => session.errors.push(error.message)));
    await context.route(
      url => url.origin !== origin,
      route => route.abort()
    );
    try {
      let page = await context.newPage();
      await page.goto(`${origin}/?boot=0`);
      let helpers = createHelpers(page);
      await helpers.win('finder').waitFor();
      await writeUserData(page, helpers);
      await page.close();
      if (previous.url) {
        await context.route(
          url => url.origin === origin,
          async route => {
            const request = new URL(route.request().url());
            const response = await route.fetch({ url: `${server.origin}${request.pathname}${request.search}` });
            await route.fulfill({ response });
          }
        );
      }
      const shell = await openSqliteShell(context, { origin, distRoot: previous.dist ?? current });
      const recordBefore = await shell.rows(
        `SELECT "value" FROM "desktop$system_preference" WHERE "key" = 'schema:desktop'`
      );
      await shell.close();

      server.switchTo(current);
      page = await context.newPage();
      await page.goto(`${origin}/?boot=0`);
      helpers = createHelpers(page);
      await helpers.win('finder').waitFor();
      const kept = await readUserData(page, helpers);
      await page.close();
      const after = await openSqliteShell(context, { origin, distRoot: current });
      const recordAfter = await after.rows(
        `SELECT "value" FROM "desktop$system_preference" WHERE "key" = 'schema:desktop'`
      );
      await after.close();
      return {
        upgradePrevious: {
          previousBuildWritesNoRecord: recordBefore.length === 0,
          originStaysTheSame: new URL(page.url()).origin === origin,
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
