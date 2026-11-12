import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { createFile } from '../src/core/files.js';
import { grantPermission } from '../src/core/permissions.js';
import { createState } from '../src/core/state.js';

const legacyWorker = `
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type === 'status') event.ports[0]?.postMessage({ version: 'legacy', complete: true });
  if (event.data?.type === 'activate-confirmed') event.waitUntil(self.skipWaiting());
});`;

async function deployment(legacy: boolean) {
  let generation = 0;
  let overrideRoot = false;
  const currentWorker = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      response.setHeader('cache-control', 'no-store');
      if (path === '/bootstrap.html') {
        response.setHeader('content-type', 'text/html');
        return response.end('<!doctype html><title>旧桌面数据</title>');
      }
      if (path === '/sw.js') {
        response.setHeader('content-type', 'text/javascript');
        return response.end(
          legacy ? legacyWorker : (
            currentWorker.replace(/"version":"[a-f0-9]{16}"/u, `"version":"deployment-${generation}"`)
          )
        );
      }
      if (path === '/' && overrideRoot) {
        response.setHeader('content-type', 'text/html');
        return response.end('<!doctype html><h1>未确认的新外壳</h1>');
      }
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.ico': 'image/x-icon'
      };
      const file = path === '/' ? 'index.html' : path.slice(1);
      response.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(new URL(`../dist/${file}`, import.meta.url)));
    })().catch(() => {
      response.statusCode = 404;
      response.end();
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试部署未启动');
  return {
    url: `http://127.0.0.1:${address.port}`,
    advance: () => {
      legacy = false;
      generation++;
    },
    replaceRoot: () => {
      overrideRoot = true;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  };
}

async function legacyState(page: Page, url: string) {
  const state = createState('windows');
  state.profile.guided = true;
  const file = createFile(state, { name: '升级前.txt', bytes: Buffer.from('旧版桌面保留的正文').toString('base64') });
  grantPermission(
    state,
    { appId: 'editor', instanceId: 'legacy', origin: url, capabilities: ['files'] },
    'files',
    file.id,
    true
  );
  state.session = [
    {
      appId: 'editor',
      fileId: file.id,
      route: '',
      workspaceId: 'first',
      bounds: { x: 80, y: 50, width: 640, height: 450 },
      state: 'normal'
    }
  ];
  state.navigation.activeWindows['first'] = 0;
  await page.goto(`${url}/bootstrap.html`);
  await page.evaluate(
    async state => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('orbit-desktop', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('state', 'readwrite');
          transaction.objectStore('state').put(state, 'desktop');
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      });
    },
    {
      ...state,
      schemaVersion: 2,
      installations: state.installations.map(({ appId, version, previousVersion }) => ({
        appId,
        version,
        previousVersion
      }))
    }
  );
}

test('DESKTOP-US-502：旧 Worker 明确要求升级，确认后恢复旧数据和窗口', async ({ page }) => {
  const site = await deployment(true);
  try {
    await legacyState(page, site.url);
    site.advance();
    await page.goto(site.url);
    await expect(page.getByRole('heading', { name: '桌面需要完成更新' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: '保存工作并更新', exact: true })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.getByRole('button', { name: '保存工作并更新', exact: true }).click();
    const editor = page.frameLocator('iframe[title="文本编辑器"]');
    await expect(editor.getByLabel('文档内容')).toHaveValue('旧版桌面保留的正文');
    await expect(editor.getByLabel('文件名', { exact: true })).toHaveValue('升级前.txt');
    await expect(page.getByRole('navigation', { name: '应用栏' })).toBeVisible();
  } finally {
    await site.close();
  }
});

test('DESKTOP-US-502：根导航保留完整外壳，取消升级保留工作，保存新文件后恢复窗口', async ({ page }) => {
  const site = await deployment(false);
  try {
    await page.goto(site.url);
    await page.getByRole('button', { name: /^Windows 风格/ }).click();
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    await expect(page.getByText('离线已就绪', { exact: true })).toBeVisible();
    site.advance();
    site.replaceRoot();
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await expect(page.getByRole('button', { name: '保存工作并更新', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('navigation', { name: '应用栏' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '未确认的新外壳' })).toHaveCount(0);
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    const editor = page.frameLocator('iframe[title="文本编辑器"]');
    await editor.getByLabel('文件名', { exact: true }).fill('更新时首次保存.txt');
    await editor.getByLabel('文档内容').fill('升级前尚未保存的正文');
    await page.getByRole('button', { name: '保存工作并更新', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(editor.getByLabel('文档内容')).toHaveValue('升级前尚未保存的正文');
    await page.getByRole('button', { name: '保存工作并更新', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    await expect(editor.getByLabel('文档内容')).toHaveValue('升级前尚未保存的正文');
    await expect(page.getByRole('button', { name: '保存工作并更新', exact: true })).toHaveCount(0);
    await expect(editor.getByRole('status')).toContainText('已打开');
    await page.reload();
    await expect(editor.getByLabel('文档内容')).toHaveValue('升级前尚未保存的正文');
    await expect(editor.getByLabel('文件名', { exact: true })).toHaveValue('更新时首次保存.txt');
  } finally {
    await site.close();
  }
});
