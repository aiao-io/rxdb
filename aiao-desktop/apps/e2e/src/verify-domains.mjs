/** 真实 HTTPS 入口的数据隔离验收（US-004 #3）：新建独立浏览器上下文，不接触用户的浏览器配置。 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { platform, release } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { createHelpers } from './harness/helpers.mjs';
import { NOTE_BODY, readUserData, userDataIntact, writeUserData } from './harness/user-data.mjs';

const { values } = parseArgs({ options: { output: { type: 'string' } }, strict: true });
const legacy = 'https://aiao-desktop.pages.dev';
const custom = 'https://desktop.aiao.io';
const userFile = 'domain-check.txt';
const expect = playwrightExpect.configure({ timeout: 15_000 });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
await context.route(
  url => ![legacy, custom].includes(url.origin),
  route => route.abort()
);
const page = await context.newPage();
const report = {
  format: 'aiao-desktop.verify-domains',
  version: 1,
  measuredAt: new Date().toISOString(),
  source: `${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()}+workspace`,
  environment: {
    os: platform(),
    release: release(),
    node: process.version,
    chromium: browser.version(),
    headless: true
  },
  method: '真实 HTTPS 入口；同一空上下文、不同 Origin；屏蔽外网内容，允许两个真实站点的构建资源；不发布、不迁移数据。',
  entries: [],
  checks: {},
  pageErrors: [],
  diagnostics: []
};
page.on('pageerror', error => report.pageErrors.push(error.message));
const helpers = createHelpers(page);
const open = async origin => {
  const response = await page.goto(`${origin}/?boot=0`);
  report.entries.push({
    requestedOrigin: origin,
    actualOrigin: new URL(page.url()).origin,
    status: response.status(),
    indexSha256: createHash('sha256')
      .update(await response.body())
      .digest('hex')
  });
  await helpers.win('finder').waitFor();
};
const textFile = async (name = userFile) => {
  await helpers.closeAll();
  await helpers.desktopIcon(name).dblclick();
  const editor = helpers.win('textedit').locator('[data-te-doc]');
  await expect(editor)
    .not.toBeEmpty()
    .catch(async error => {
      report.diagnostics.push(
        await page.evaluate(() => ({
          phase: 'open-text-file',
          url: location.href,
          windows: [...document.querySelectorAll('.win')].map(win => ({
            app: win.getAttribute('data-app'),
            text: win.innerText
          })),
          toast: document.querySelector('#toast')?.textContent
        }))
      );
      throw error;
    });
  return editor;
};
try {
  await open(legacy);
  await writeUserData(page, helpers);
  await helpers.openTerminal();
  const command = `cp ~/Desktop/prasenx.txt ~/Desktop/${userFile}`;
  await helpers.runInShell(command);
  await page.waitForFunction(input => {
    const text = document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? '';
    return text.includes(input) && /~\$\s*$/.test(text);
  }, command);
  await helpers.desktopIcon(userFile).waitFor();
  await helpers.runInShell(`open ~/Desktop/${userFile}`);
  const original = helpers.win('textedit').locator('[data-te-doc]');
  await expect(original).toContainText('Scratchpad');
  const originalBody = await original.innerText();
  report.userFile = { name: userFile, sha256: createHash('sha256').update(originalBody).digest('hex') };
  await helpers.closeAll();

  await open(custom);
  report.checks.customOriginNotRedirected = new URL(page.url()).origin === custom;
  report.checks.noUserFolderInCustomOrigin = (await helpers.desktopIcon('untitled folder').count()) === 0;
  report.checks.noUserFileInCustomOrigin = (await helpers.desktopIcon(userFile).count()) === 0;
  await helpers.closeAll();
  await page.locator('#dock .di[data-app="notes"]').click();
  await helpers.win('notes').locator('[data-items]').waitFor();
  report.checks.noUserNoteInCustomOrigin = !(await helpers.win('notes').locator('[data-items]').innerText()).includes(
    NOTE_BODY
  );
  const fresh = await textFile('prasenx.txt');
  report.checks.customFileIsSeedContent =
    (await fresh.innerText()).includes('Scratchpad');
  await helpers.closeAll();

  await open(legacy);
  report.checks.legacyOriginNotRedirected = new URL(page.url()).origin === legacy;
  report.checks.legacyFolderNoteAndSettingsSurvive = userDataIntact(await readUserData(page, helpers));
  const kept = await textFile();
  report.checks.legacyFileBodySurvives = (await kept.innerText()) === originalBody;
  report.checks.noPageErrors = report.pageErrors.length === 0;
} catch (error) {
  report.error = String(error);
  report.diagnostics.push(
    await page.evaluate(() => ({
      phase: 'failure',
      url: location.href,
      windows: [...document.querySelectorAll('.win')].map(win => ({
        app: win.getAttribute('data-app'),
        text: win.innerText
      })),
      toast: document.querySelector('#toast')?.textContent
    }))
  );
} finally {
  await browser.close();
}
report.passed =
  !report.error && Object.values(report.checks).length === 9 && Object.values(report.checks).every(Boolean);
const json = `${JSON.stringify(report, null, 2)}\n`;
if (values.output) writeFileSync(resolve(values.output), json);
console.log(json);
if (!report.passed) process.exitCode = 1;
