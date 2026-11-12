import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const outputRoot = resolve(process.cwd(), '../../dist/apps/aiao-desktop/browser');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

/** 启动台里的应用：[应用 id, 显示名]。 */
const APPS = [
  ['finder', 'Finder'],
  ['safari', 'Safari'],
  ['mail', 'Mail'],
  ['messages', 'Messages'],
  ['maps', 'Maps'],
  ['photos', 'Photos'],
  ['facetime', 'FaceTime'],
  ['calendar', 'Calendar'],
  ['contacts', 'Contacts'],
  ['reminders', 'Reminders'],
  ['notes', 'Notes'],
  ['freeform', 'Freeform'],
  ['voice', 'Voice Memos'],
  ['appstore', 'App Store'],
  ['podcasts', 'Podcasts'],
  ['music', 'Music'],
  ['tv', 'TV'],
  ['books', 'Books'],
  ['stocks', 'Stocks'],
  ['weather', 'Weather'],
  ['clock', 'Clock'],
  ['terminal', 'Terminal'],
  ['activity', 'Activity Monitor'],
  ['diskutil', 'Disk Utility'],
  ['fontbook', 'Font Book'],
  ['calculator', 'Calculator'],
  ['textedit', 'TextEdit'],
  ['preview', 'Preview'],
  ['settings', 'System Settings']
];

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relativePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = normalize(join(outputRoot, relativePath));
  if (!filePath.startsWith(`${outputRoot}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  });
  createReadStream(filePath).pipe(response);
});

await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Failed to start the smoke test server');
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
/* 只验证本地行为：外网资源（壁纸、地图瓦片、天气）一律拦掉，结果稳定。 */
await context.route(
  url => !url.href.startsWith(origin),
  route => route.abort()
);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(message.text()))
    errors.push(message.text());
});

const win = id => page.locator(`.win[data-app="${id}"]:not(.closing)`);
const closeAll = async () => {
  for (let guard = 0; guard < 40; guard++) {
    const close = page.locator('.win:not(.closing) .tl .c');
    if ((await close.count()) === 0) return;
    await close.first().dispatchEvent('click');
    await page.waitForTimeout(240);
  }
};
const launch = async name => {
  await page.locator('#dock .di[data-app="launchpad"]').click();
  await page.waitForSelector('#lpad:not(.out) [data-lq]');
  await page.locator('#lpad [data-lq]').fill(name);
  await page.locator('#lpad [data-lq]').press('Enter');
};
/** 等元素可见；弹出层先隐藏测量、下一帧才定位显示。 */
const shows = locator =>
  locator.waitFor({ state: 'visible', timeout: 3_000 }).then(
    () => true,
    () => false
  );
const xtermText = () =>
  page.evaluate(() => document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? '');

try {
  await page.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
  await win('finder').waitFor();

  const shell = await page.evaluate(() => ({
    stage: Boolean(document.querySelector('#stage')),
    menubar: Boolean(document.querySelector('#menubar')),
    dock: document.querySelectorAll('#dock .di').length === 14,
    /* 运行时已全部变成 Angular 组件：不再有全局入口，也不再往页面注入脚本。 */
    noRuntimeGlobals: ['WM', 'APPS', 'Pop', 'SYS', 'Bus', '__aiaoRuntimeBridge', '__aiaoTerminalBridge'].every(
      name => !(name in window)
    ),
    noInlineScripts: [...document.scripts].every(script => script.src !== '')
  }));

  /* Finder：双击文件夹进入，标题与路径栏跟着变。 */
  await win('finder').locator('.fitem[data-name="Documents"]').dblclick();
  await page.waitForTimeout(150);
  const finderNavigates = (await win('finder').locator('[data-title]').textContent())?.trim() === 'Documents';

  await closeAll();
  await page.locator('#dock .di[data-app="calculator"]').click();
  await win('calculator').waitFor();
  for (const key of ['ac', 'n1', 'n2', 'add', 'n3', 'eq'])
    await win('calculator').locator(`.ck[data-k="${key}"]`).click();
  await page.waitForTimeout(80);
  const calculatorWorks = (await win('calculator').locator('.calc-out').textContent())?.replace(/\s/g, '') === '15';

  /* 菜单栏：Apple 菜单与前台应用菜单。 */
  await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
  const appleMenu = await shows(page.locator('#layer-menu .pop .mi', { hasText: 'About This Mac' }));
  await page.keyboard.press('Escape');
  const appMenu = (await page.locator('#menubar .mb-item.app').textContent())?.trim() === 'Calculator';

  /* 最小化进 Dock，再从 Dock 还原。 */
  await win('calculator').locator('.tl .m').click();
  await page.waitForTimeout(600);
  const minimized = await win('calculator').evaluate(node => node.style.visibility === 'hidden');
  await page.locator('#dock .di[data-app="calculator"]').click();
  await page.waitForTimeout(700);
  const restored = await win('calculator').evaluate(
    node => node.style.visibility === '' && !node.classList.contains('mini')
  );

  await closeAll();
  await page.locator('#dock .di[data-app="terminal"]').click();
  await page.waitForSelector('.win[data-app="terminal"] .xterm', { timeout: 15_000 });
  await page.waitForTimeout(1_500);
  await page.locator('.win[data-app="terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type('echo VIVARI_SMOKE');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      /VIVARI_SMOKE[\s\S]*VIVARI_SMOKE/.test(
        document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? ''
      ),
    undefined,
    { timeout: 15_000 }
  );
  const terminalState = {
    crossOriginIsolated: await page.evaluate(() => window.crossOriginIsolated),
    xterm: (await page.locator('.win[data-app="terminal"] .xterm').count()) === 1,
    helperInput: (await page.locator('.win[data-app="terminal"] .xterm-helper-textarea').count()) === 1,
    vivariShell: (await xtermText()).includes('VIVARI_SMOKE')
  };

  await page.locator('#dock .di[data-app="launchpad"]').click();
  await page.waitForSelector('#lpad');
  const launchpadOpens = (await page.locator('#lpad').count()) === 1;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(650);
  const launchpadCloses = (await page.locator('#lpad').count()) === 0;

  await page.keyboard.press('Meta+Space');
  await page.waitForFunction(() => document.activeElement?.matches('#spot [data-sq]'));
  await page.keyboard.type('calc');
  const spotlightFinds = await shows(page.locator('#spot .r.on', { hasText: 'Calculator' }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
  await page.waitForTimeout(500);
  const notificationsOpen = await shows(page.locator('#nc .wgt').first());
  await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
  await page.waitForTimeout(500);
  const notificationsClose = (await page.locator('#nc').count()) === 0;

  await closeAll();
  await page.locator('#dock .di[data-app="notes"]').click();
  await win('notes').waitFor();
  const notesWorks = (await win('notes').locator('input').count()) > 0;

  /* 每个应用都能从启动台打开，且不产生错误。 */
  const unopened = [];
  for (const [id, name] of APPS) {
    await closeAll();
    await launch(name);
    try {
      await win(id).waitFor({ timeout: 3_000 });
    } catch {
      unopened.push(id);
    }
  }
  await closeAll();
  const everyAppOpens = unopened.length === 0;

  const finalChecks = {
    shell,
    finderNavigates,
    calculatorWorks,
    appleMenu,
    appMenu,
    minimized,
    restored,
    terminalState,
    launchpadOpens,
    launchpadCloses,
    spotlightFinds,
    notificationsOpen,
    notificationsClose,
    notesWorks,
    everyAppOpens,
    unopened
  };

  if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  const failed =
    Object.values(finalChecks.shell).some(check => !check) ||
    Object.values(finalChecks.terminalState).some(check => !check) ||
    Object.values(finalChecks).some(check => check === false);
  if (failed) throw new Error(`Smoke checks failed: ${JSON.stringify(finalChecks)}`);
  console.log(JSON.stringify(finalChecks));
} finally {
  await browser.close();
  server.close();
}
