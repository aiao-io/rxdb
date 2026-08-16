import { _electron as electron } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = '/Users/jimmy/Documents/aiao/rxdb/dist/apps/dev-rxdb-electron/release/mac-arm64/DevRxDBElectron.app/Contents/MacOS/DevRxDBElectron';
const userDataDir = mkdtempSync(join(tmpdir(), 'repro-'));
const env = {};
for (const [k, v] of Object.entries(process.env)) if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v;
env.DEV_RXDB_ELECTRON_HIDE_WINDOW = '1';

const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userDataDir}`], env });
app.process().stdout.on('data', d => process.stdout.write('[main-out] ' + d));
app.process().stderr.on('data', d => process.stdout.write('[main-err] ' + d));
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
console.log('url=', page.url());
// 等桌面卡片进入终态，确保 desktopHost 真的被创建
try {
  await page.getByTestId('desktop-status').waitFor({ state: 'visible', timeout: 30000 });
  for (let i = 0; i < 60; i++) {
    const t = await page.getByTestId('desktop-status').textContent();
    console.log('desktop-status=', t?.trim());
    if (!/连接中/.test(t ?? '')) break;
    await new Promise(r => setTimeout(r, 1000));
  }
} catch (e) { console.log('no desktop-status:', e.message); }

console.log('closing...');
const t0 = Date.now();
const timer = setInterval(() => console.log('still closing', Date.now() - t0, 'ms; alive=', !app.process().killed, 'exitCode=', app.process().exitCode), 5000);
await Promise.race([app.close(), new Promise(r => setTimeout(() => r('TIMEOUT'), 60000))]).then(v => console.log('close result:', v ?? 'closed', Date.now() - t0, 'ms'));
clearInterval(timer);
console.log('process exitCode=', app.process().exitCode);
process.exit(0);
