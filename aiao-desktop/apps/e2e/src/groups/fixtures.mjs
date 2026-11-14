import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startArtifactServer } from '../fixtures/artifact-server.mjs';
import { openPages } from '../fixtures/multi-page.mjs';
import { createPersistentProfile } from '../fixtures/persistent-profile.mjs';
import { installArtifactOrigin } from '../harness/artifact-origin.mjs';
import { runGroup } from '../harness/runner.mjs';

/** 写进 localStorage 与 OPFS 的标记；在页面里读回来。 */
async function writeMarkers(page, value) {
  await page.evaluate(async marker => {
    localStorage.setItem('fixture-marker', marker);
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('fixture-marker.txt', { create: true });
    const writable = await handle.createWritable();
    await writable.write(marker);
    await writable.close();
  }, value);
}

async function readMarkers(page) {
  return page.evaluate(async () => {
    /* 标记文件不存在（另一个上下文看不到）就是 null，这正是被检查的现象。 */
    const readOpfs = async () => {
      try {
        const root = await navigator.storage.getDirectory();
        return await (await (await root.getFileHandle('fixture-marker.txt')).getFile()).text();
      } catch {
        return null;
      }
    };
    return { local: localStorage.getItem('fixture-marker'), opfs: await readOpfs() };
  });
}

const page = body =>
  `<!doctype html><html><head><meta charset="utf-8"><title>fixture</title></head><body>${body}</body></html>`;

async function staticSite(body) {
  const root = await mkdtemp(join(tmpdir(), 'aiao-desktop-fixture-'));
  await writeFile(join(root, 'index.html'), page(body));
  return root;
}

/** 多页夹具（AC#4）：同一上下文的另一个页面读得到，不同上下文读不到。 */
async function checkMultiPage(browser) {
  const root = await staticSite('multi-page');
  const site = await startArtifactServer({ root });
  const context = await browser.newContext();
  const other = await browser.newContext();
  try {
    const [first, second] = await openPages(context, 2);
    await first.goto(site.origin);
    await second.goto(site.origin);
    await writeMarkers(first, 'one');
    const same = await readMarkers(second);
    const stranger = await other.newPage();
    await stranger.goto(site.origin);
    const different = await readMarkers(stranger);
    return {
      sameContextSharesStorage: same.local === 'one' && same.opfs === 'one',
      otherContextIsIsolated: different.local === null && different.opfs === null
    };
  } finally {
    await context.close();
    await other.close();
    site.close();
    await rm(root, { recursive: true, force: true });
  }
}

/** 持久 profile 夹具（AC#5）：关闭浏览器后用同一个 profile 再启动，数据仍在。 */
async function checkPersistentProfile(engine) {
  const root = await staticSite('persistent-profile');
  const site = await startArtifactServer({ root });
  const profile = await createPersistentProfile({ engine });
  try {
    const first = await profile.open();
    const writer = first.pages()[0] ?? (await first.newPage());
    await writer.goto(site.origin);
    await writeMarkers(writer, 'persisted');
    await first.close();
    const second = await profile.open();
    const reader = second.pages()[0] ?? (await second.newPage());
    await reader.goto(site.origin);
    const seen = await readMarkers(reader);
    await second.close();
    return { dataSurvivesRestart: seen.local === 'persisted' && seen.opfs === 'persisted' };
  } finally {
    site.close();
    await profile.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

/** 新旧产物服务器夹具（AC#6）：同一个来源先托管 A 再切到 B，刷新后加载到 B，A 时代写入的数据仍在。 */
async function checkArtifactSwitch(browser) {
  const before = await staticSite('artifact A');
  const after = await staticSite('artifact B');
  const site = await startArtifactServer({ root: before });
  const context = await browser.newContext();
  try {
    const tab = await context.newPage();
    await tab.goto(site.origin);
    const firstText = await tab.evaluate(() => document.body.textContent);
    const firstOrigin = await tab.evaluate(() => location.origin);
    await writeMarkers(tab, 'from-A');
    site.switchTo(after);
    await tab.reload();
    const secondText = await tab.evaluate(() => document.body.textContent);
    const secondOrigin = await tab.evaluate(() => location.origin);
    const seen = await readMarkers(tab);
    return {
      servesSwitchedArtifact: firstText === 'artifact A' && secondText === 'artifact B',
      keepsOrigin: firstOrigin === secondOrigin && firstOrigin === site.origin,
      keepsStorage: seen.local === 'from-A' && seen.opfs === 'from-A'
    };
  } finally {
    await context.close();
    site.close();
    await rm(before, { recursive: true, force: true });
    await rm(after, { recursive: true, force: true });
  }
}

/** 同站不同源的 HTTPS 转送保留隔离、可信键盘输入、独立存储与刷新，避免 Firefox 跨站驱动缺口。 */
async function checkArtifactOrigin(browser) {
  const APP_ORIGIN = 'https://code.aiao.invalid';
  const root = await mkdtemp(join(tmpdir(), 'aiao-artifact-origin-'));
  await writeFile(
    join(root, 'index.html'),
    `<div id="host"></div><script src="/asset.js?check=relative"></script><script>
      document.querySelector('#host').attachShadow({mode:'open'}).innerHTML =
        '<iframe src="${APP_ORIGIN}" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" allow="cross-origin-isolated"></iframe>';
    </script>`
  );
  await writeFile(join(root, 'asset.js'), 'window.assetLoaded = true;');
  const site = await startArtifactServer({ root });
  const context = await browser.newContext();
  try {
    await context.route('**/*', route => route.abort());
    const artifact = await installArtifactOrigin(context, site.origin, APP_ORIGIN);
    await context.route(`${APP_ORIGIN}/**`, route =>
      route.fulfill({
        headers: {
          'Content-Type': 'text/html',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'cross-origin'
        },
        body: '<textarea id="input"></textarea>'
      })
    );
    const page = await context.newPage();
    await page.goto(artifact.origin);
    const input = page.frameLocator('iframe').locator('#input');
    await input.click();
    await page.keyboard.type('cross-origin');
    const keyboardReachesFrame = (await input.inputValue()) === 'cross-origin';
    const hostIsolated = await page.evaluate(() => crossOriginIsolated);
    const relativeAssetsServed = await page.evaluate(() => window.assetLoaded === true);
    const child = page.frames().find(frame => frame.url().startsWith(APP_ORIGIN));
    const childIsolated = await child.evaluate(() => crossOriginIsolated);
    await page.evaluate(() => localStorage.setItem('artifact-origin-check', 'parent'));
    const storageIsolated = (await child.evaluate(() => localStorage.getItem('artifact-origin-check'))) === null;
    const resourceMappingKeepsQuery =
      artifact.resourceUrl(`${artifact.origin}/asset.js?check=relative`) === `${site.origin}/asset.js?check=relative`;
    assert.throws(() => artifact.resourceUrl('https://external.invalid/'), /请求不属于被测桌面/);
    await page.reload({ timeout: 5_000 });
    return {
      crossOrigin: artifact.origin !== APP_ORIGIN,
      crossOriginIsolated: hostIsolated && childIsolated,
      keyboardReachesFrame,
      storageIsolated,
      relativeAssetsServed,
      reloadKeepsStorage: (await page.evaluate(() => localStorage.getItem('artifact-origin-check'))) === 'parent',
      resourceMappingKeepsQuery,
      rejectsOtherSources: true
    };
  } finally {
    await context.close();
    site.close();
    await rm(root, { recursive: true, force: true });
  }
}

/** 前一个检查组写磁盘和系统设置，后一个检查组各自独立的上下文里看不到（AC#3）。 */
const writer = {
  name: 'isolation-writer',
  keys: ['wrote'],
  async run(session) {
    const { page } = session;
    const { win, closeAll, spotlight, appears, desktopIcon } = session.helpers;
    await session.openDesktop();
    await closeAll();
    await page.locator('#dock .di[data-app="finder"]').click();
    await win('finder').last().locator('[data-place="Desktop"]').click();
    await win('finder').last().locator('[data-more]').click();
    await page.locator('#layer-menu .pop .mi', { hasText: 'New Folder' }).click();
    const folder = await appears(desktopIcon('untitled folder'));
    await closeAll();
    await spotlight('dark mode');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', undefined, { timeout: 3_000 });
    await page.waitForTimeout(1_000);
    return { wrote: folder };
  }
};

const reader = {
  name: 'isolation-reader',
  keys: ['desktopLoaded', 'sawFolder', 'sawDarkTheme'],
  async run(session) {
    const { page } = session;
    const { desktopIcon, appears } = session.helpers;
    await session.openDesktop();
    /* 桌面图标来自磁盘：等内置的图标出现，说明磁盘已挂载，此时再看有没有前一个检查组写的文件夹。 */
    const desktopLoaded = await appears(desktopIcon('prasenx.txt'));
    return {
      desktopLoaded,
      sawFolder: (await desktopIcon('untitled folder').count()) > 0,
      sawDarkTheme: await page.evaluate(() => document.documentElement.dataset.theme === 'dark')
    };
  }
};

async function checkGroupIsolation(session) {
  const environment = { browser: session.browser, origin: session.origin, engine: session.engine };
  const first = await runGroup(writer, environment);
  const second = await runGroup(reader, environment);
  const problems = [...first.problems, ...second.problems.filter(problem => !problem.includes('检查项未通过'))];
  if (problems.length) throw new Error(`隔离自检的前置步骤失败：${problems.join('；')}`);
  return {
    nextGroupSeesNoDiskChange: first.result.wrote === true && second.result.desktopLoaded && !second.result.sawFolder,
    nextGroupSeesNoSettingChange: !second.result.sawDarkTheme
  };
}

/**
 * 夹具自检（ADESK-US-008 AC#3～#6）：不依赖桌面功能，证明冒烟用到的夹具本身可靠。
 * 默认不随全量冒烟运行（它不是桌面行为），用 `--group=fixtures` 单独跑。
 */
export const fixtures = {
  name: 'fixtures',
  default: false,
  description:
    '夹具自检（不验桌面行为）：检查组隔离、同上下文多页、持久 profile、新旧产物服务器、同站不同源 HTTPS 转送',
  keys: [
    'groupIsolation.nextGroupSeesNoDiskChange',
    'groupIsolation.nextGroupSeesNoSettingChange',
    'multiPage.sameContextSharesStorage',
    'multiPage.otherContextIsIsolated',
    'persistentProfile.dataSurvivesRestart',
    'artifactSwitch.servesSwitchedArtifact',
    'artifactSwitch.keepsOrigin',
    'artifactSwitch.keepsStorage',
    'artifactOrigin.crossOrigin',
    'artifactOrigin.crossOriginIsolated',
    'artifactOrigin.keyboardReachesFrame',
    'artifactOrigin.storageIsolated',
    'artifactOrigin.relativeAssetsServed',
    'artifactOrigin.reloadKeepsStorage',
    'artifactOrigin.resourceMappingKeepsQuery',
    'artifactOrigin.rejectsOtherSources'
  ],
  async run(session) {
    return {
      groupIsolation: await checkGroupIsolation(session),
      multiPage: await checkMultiPage(session.browser),
      persistentProfile: await checkPersistentProfile(session.engine),
      artifactSwitch: await checkArtifactSwitch(session.browser),
      artifactOrigin: await checkArtifactOrigin(session.browser)
    };
  }
};
