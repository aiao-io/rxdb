import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const outputRoot = resolve(process.cwd(), '../../dist/apps/aiao-desktop/browser');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ico': 'image/x-icon'
};

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relativePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = normalize(join(outputRoot, relativePath));
  if (!filePath.startsWith(`${outputRoot}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
});

await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Failed to start the smoke test server');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto(`http://127.0.0.1:${address.port}/?boot=0`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#stage') && typeof WM !== 'undefined' && WM.list.length > 0);

  const checks = await page.evaluate(async () => {
    const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
    const closeAll = () => WM.list.slice().forEach(windowItem => WM.close(windowItem.id));
    const front = () => document.querySelector('.win.front');

    const shell = {
      stage: Boolean(document.querySelector('#stage')),
      menubar: Boolean(document.querySelector('#menubar')),
      dock: Boolean(document.querySelector('#dock')),
      runtime: typeof WM === 'object' && typeof APPS === 'object' && typeof Pop === 'object'
    };

    closeAll();
    WM.open('calculator', { force: true });
    await sleep(250);
    const calculator = front();
    const press = key =>
      calculator?.querySelector(`.ck[data-k="${key}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    press('ac');
    for (const key of ['n1', 'n2', 'add', 'n3', 'eq']) press(key);
    await sleep(80);
    const calculatorWorks = calculator?.querySelector('.calc-out')?.textContent?.replace(/\s/g, '') === '15';

    closeAll();
    return { shell, calculatorWorks };
  });

  const launchpad = page.locator('#dock .di[data-app="launchpad"]');
  await launchpad.click();
  await page.waitForSelector('#lpad');
  const launchpadOpens = await page.locator('#lpad').count() === 1;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(650);
  const launchpadCloses = await page.locator('#lpad').count() === 0;

  await page.evaluate(() => WM.open('notes', { force: true }));
  await page.waitForTimeout(250);
  const notesWorks = await page.locator('.win.front input').count() > 0;
  const finalChecks = { ...checks, launchpadOpens, launchpadCloses, notesWorks };

  if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  if (Object.values(finalChecks.shell).some(check => !check) || Object.values(finalChecks).some(check => check === false)) {
    throw new Error(`Smoke checks failed: ${JSON.stringify(finalChecks)}`);
  }
  console.log(JSON.stringify(finalChecks));
} finally {
  await browser.close();
  server.close();
}
