import { _electron as electron } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = '/Users/jimmy/Documents/aiao/rxdb/dist/apps/dev-rxdb-electron/release/mac-arm64/DevRxDBElectron.app/Contents/MacOS/DevRxDBElectron';
const userDataDir = mkdtempSync(join(tmpdir(), 'repro2-'));
const env = {};
for (const [k, v] of Object.entries(process.env)) if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v;
env.DEV_RXDB_ELECTRON_HIDE_WINDOW = '1';

const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userDataDir}`], env });
app.process().stdout.on('data', d => process.stdout.write('[out] ' + d));
app.process().stderr.on('data', d => process.stdout.write('[err] ' + d));
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
for (let i = 0; i < 60; i++) {
  const t = await page.getByTestId('desktop-status').textContent().catch(() => null);
  if (t && !/连接中/.test(t)) { console.log('desktop-status=', t.trim()); break; }
  await new Promise(r => setTimeout(r, 500));
}

await app.evaluate(({ app: a, BrowserWindow }) => {
  a.on('before-quit', () => console.log('[probe] before-quit'));
  a.on('window-all-closed', () => console.log('[probe] window-all-closed, windows=' + BrowserWindow.getAllWindows().length));
  a.on('will-quit', () => console.log('[probe] will-quit (after app handler)'));
  a.on('quit', () => console.log('[probe] quit'));
  console.log('[probe] installed. windows=' + BrowserWindow.getAllWindows().length);
});

console.log('--- calling app.quit() via evaluate ---');
await app.evaluate(({ app: a }) => { a.quit(); }).catch(e => console.log('evaluate err', e.message));
const t0 = Date.now();
const timer = setInterval(() => console.log('waiting', Date.now() - t0, 'exitCode=', app.process().exitCode), 3000);
await new Promise(r => setTimeout(r, 20000));
clearInterval(timer);
console.log('exitCode=', app.process().exitCode);
app.process().kill('SIGKILL');
process.exit(0);
