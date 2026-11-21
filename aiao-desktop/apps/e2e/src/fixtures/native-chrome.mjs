import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';

/** 临时独立 Chrome：CDP 的 noDefaults 保留真实焦点与页面可见性，不连接用户日常配置。 */
export async function launchNativeChrome() {
  const profile = await mkdtemp(join(tmpdir(), 'aiao-desktop-native-chrome-'));
  const executable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const child = spawn(
    executable,
    [
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-background-networking',
      '--disable-backgrounding-occluded-windows',
      '--use-mock-keychain',
      '--password-store=basic',
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  const exited = once(child, 'exit').catch(() => undefined);
  let browser;
  const close = async () => {
    await browser?.close();
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      const forced = setTimeout(() => child.kill('SIGKILL'), 5_000);
      await exited;
      clearTimeout(forced);
    }
    await rm(profile, { recursive: true, force: true });
  };
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(
        () => reject(new Error('Chrome did not expose its debugging endpoint within 20 seconds')),
        20_000
      );
      const read = chunk => {
        output += chunk.toString();
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (!match) return;
        clearTimeout(timeout);
        child.stderr.removeListener('data', read);
        resolve(match[1]);
      };
      child.stderr.on('data', read);
      child.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', code => {
        clearTimeout(timeout);
        reject(new Error(`Chrome exited before connection (${code})`));
      });
    });
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    const activate = () => {
      const activated = execFileSync(
        'osascript',
        [
          '-l',
          'JavaScript',
          '-e',
          `ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}).activateWithOptions(3)`
        ],
        { timeout: 5_000, encoding: 'utf8' }
      ).trim();
      if (activated !== 'true') throw new Error('The dedicated Chrome window could not become active');
    };
    const focusState = () =>
      JSON.parse(
        execFileSync(
          'osascript',
          [
            '-l',
            'JavaScript',
            '-e',
            `ObjC.import('AppKit'); JSON.stringify({pid:${child.pid},active:$.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}).active,frontmost:$.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier})`
          ],
          { timeout: 5_000, encoding: 'utf8' }
        )
      );
    return { browser, context: browser.contexts()[0], activate, focusState, close };
  } catch (error) {
    await close();
    throw error;
  }
}
