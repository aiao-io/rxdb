import { createPersistentProfile } from '../fixtures/persistent-profile.mjs';
import { PREFERENCES, surgery } from '../harness/database.mjs';
import { createHelpers } from '../harness/helpers.mjs';

const APP_ORIGIN_PATTERN = /^https?:\/\//;
const RESUME_KEY = 'windows:resume';

async function appIds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.win:not(.closing)[data-app]')]
      .map(node => node.getAttribute('data-app'))
      .filter(Boolean)
  );
}

async function openProfilePage(profile, origin, restored = false) {
  const context = await profile.open();
  await context.route(
    url => {
      if (!APP_ORIGIN_PATTERN.test(url)) return false;
      return new URL(url).origin !== origin;
    },
    route => route.abort()
  );
  const page = context.pages()[0] ?? (await context.newPage());
  const helpers = createHelpers(page);
  await page.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
  if (restored) await helpers.restored();
  else await helpers.win('finder').waitFor();
  return { context, page, helpers };
}

async function openOnly(page, helpers, name, id) {
  await helpers.closeAll();
  await helpers.launch(name);
  await helpers.win(id).waitFor();
  await page.waitForTimeout(700);
}

async function closeProfilePage(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(700);
  await page.close();
}

async function updateResumeSnapshot(context, origin, distRoot, update) {
  await surgery({ context, origin, distRoot }, async db => {
    const rows = await db.shell.rows(`SELECT "value" FROM "${PREFERENCES}" WHERE "key" = ?`, [RESUME_KEY]);
    if (!rows[0]) throw new Error('浏览器会话快照不存在');
    const current = JSON.parse(rows[0][0]);
    const next = update(current);
    await db.shell.execute(`UPDATE "${PREFERENCES}" SET "value" = ? WHERE "key" = ?`, [
      JSON.stringify(next),
      RESUME_KEY
    ]);
  });
}

async function runCheck(task) {
  try {
    return await task();
  } catch {
    return false;
  }
}

/** 浏览器会话恢复的正式 Chromium 持久 profile 验收。 */
export const browserSessionRestore = {
  name: 'browser-session-restore',
  description: '持久 Chromium profile、浏览器重启恢复、活跃标签页竞争、显式关闭和恢复失败边界',
  engines: ['chromium'],
  keys: [
    'sessionRestore.browserProcessRestartRestoresWindows',
    'sessionRestore.recentActiveTabWins',
    'sessionRestore.activeTabDoesNotDuplicateResume',
    'sessionRestore.explicitCloseNotRestored',
    'sessionRestore.corruptSnapshotStartsFresh',
    'sessionRestore.failedWindowDoesNotBlock',
    'sessionRestore.persistentChromiumProfile'
  ],
  async run(session, server) {
    const origin = server?.origin ?? session.origin;
    const result = {};

    const restartProfile = await createPersistentProfile({ engine: session.engine });
    try {
      const first = await openProfilePage(restartProfile, origin);
      await openOnly(first.page, first.helpers, 'Notes', 'notes');
      await first.helpers.launch('Calculator');
      await first.helpers.win('calculator').waitFor();
      await first.page.waitForTimeout(700);
      const before = await appIds(first.page);
      await closeProfilePage(first.page);
      await first.context.close();

      const restored = await openProfilePage(restartProfile, origin, true);
      const after = await appIds(restored.page);
      result.browserProcessRestartRestoresWindows =
        before.includes('notes') &&
        before.includes('calculator') &&
        after.includes('notes') &&
        after.includes('calculator') &&
        !after.includes('finder');
      result.persistentChromiumProfile = result.browserProcessRestartRestoresWindows;
      await closeProfilePage(restored.page);
      await updateResumeSnapshot(restored.context, origin, session.distRoot, () => ({ version: 999 }));
      await restored.context.close();

      const corrupt = await openProfilePage(restartProfile, origin, true);
      const corruptApps = await appIds(corrupt.page);
      result.corruptSnapshotStartsFresh =
        corruptApps.includes('finder') && !corruptApps.includes('notes') && !corruptApps.includes('calculator');
      await corrupt.context.close();
    } finally {
      await restartProfile.dispose();
    }

    result.recentActiveTabWins = await runCheck(async () => {
      const profile = await createPersistentProfile({ engine: session.engine });
      try {
        const first = await openProfilePage(profile, origin);
        await openOnly(first.page, first.helpers, 'Notes', 'notes');
        const secondPage = await first.context.newPage();
        const secondHelpers = createHelpers(secondPage);
        await secondPage.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
        await secondHelpers.win('finder').waitFor();
        await secondPage.bringToFront();
        await secondPage.evaluate(() => window.dispatchEvent(new Event('focus')));
        await openOnly(secondPage, secondHelpers, 'Calculator', 'calculator');
        await closeProfilePage(first.page);
        await closeProfilePage(secondPage);
        await first.context.close();

        const restored = await openProfilePage(profile, origin, true);
        const apps = await appIds(restored.page);
        await restored.context.close();
        return apps.includes('calculator') && !apps.includes('notes');
      } finally {
        await profile.dispose();
      }
    });

    result.activeTabDoesNotDuplicateResume = await runCheck(async () => {
      const profile = await createPersistentProfile({ engine: session.engine });
      try {
        const first = await openProfilePage(profile, origin);
        await openOnly(first.page, first.helpers, 'Notes', 'notes');
        const secondPage = await first.context.newPage();
        const secondHelpers = createHelpers(secondPage);
        await secondPage.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
        await secondHelpers.win('finder').waitFor();
        const apps = await appIds(secondPage);
        await closeProfilePage(first.page);
        await first.context.close();
        return apps.includes('finder') && !apps.includes('notes');
      } finally {
        await profile.dispose();
      }
    });

    result.explicitCloseNotRestored = await runCheck(async () => {
      const profile = await createPersistentProfile({ engine: session.engine });
      try {
        const first = await openProfilePage(profile, origin);
        await openOnly(first.page, first.helpers, 'Notes', 'notes');
        await first.helpers.closeAll();
        await first.page.waitForFunction(() => document.querySelectorAll('.win:not(.closing)').length === 0);
        await first.page.waitForTimeout(700);
        await closeProfilePage(first.page);
        await first.context.close();

        const reopened = await openProfilePage(profile, origin);
        const apps = await appIds(reopened.page);
        await reopened.context.close();
        return apps.includes('finder') && !apps.includes('notes');
      } finally {
        await profile.dispose();
      }
    });

    result.failedWindowDoesNotBlock = await runCheck(async () => {
      const profile = await createPersistentProfile({ engine: session.engine });
      try {
        const first = await openProfilePage(profile, origin);
        await openOnly(first.page, first.helpers, 'Notes', 'notes');
        await first.helpers.launch('Calculator');
        await first.helpers.win('calculator').waitFor();
        await first.page.waitForTimeout(700);
        await closeProfilePage(first.page);
        await updateResumeSnapshot(first.context, origin, session.distRoot, current => ({
          ...current,
          windows: [
            ...current.windows,
            {
              ...current.windows[0],
              appId: 'retired-window-app',
              name: 'Retired app'
            }
          ]
        }));
        await first.context.close();

        const restored = await openProfilePage(profile, origin, true);
        const apps = await appIds(restored.page);
        await restored.context.close();
        return apps.includes('notes') && apps.includes('calculator') && !apps.includes('retired-window-app');
      } finally {
        await profile.dispose();
      }
    });

    return { sessionRestore: result };
  }
};
