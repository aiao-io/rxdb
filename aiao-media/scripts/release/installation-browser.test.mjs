import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { startNodeServer } from '../../apps/api/src/node-server.ts';

const root = resolve(import.meta.dirname, '../../apps/web/dist/browser');
const password = 'browser-owner-password';
const actor = '12345678-1234-4234-8234-123456789012';
const types = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.wasm': 'application/wasm',
  '.json': 'application/json'
};
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(managed) {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-install-browser-'));
  const apiBase = { value: '' };
  let granted = false;
  const user = { id: actor, email: 'owner@example.test' };
  const front = createServer((incoming, outgoing) => {
    void (async () => {
      const path = new URL(incoming.url, 'http://localhost').pathname;
      if (path.startsWith('/auth/') || path.startsWith('/rest/')) {
        let value = [];
        if (path.endsWith('/media_bootstrap_admin')) {
          granted = true;
          value = actor;
        }
        if (path.endsWith('/media_admin_authorized')) value = granted;
        if (path.endsWith('/auth/v1/admin/users')) value = { users: [user], total: 1 };
        if (path.endsWith('/auth/v1/user')) value = user;
        if (path.endsWith('/auth/v1/token')) value = { access_token: 'browser-session', expires_in: 3600, user };
        outgoing.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value));
        return;
      }
      if (path.startsWith('/api/')) {
        const chunks = [];
        for await (const chunk of incoming) chunks.push(chunk);
        const headers = {};
        for (const key of ['origin', 'content-type', 'authorization'])
          if (incoming.headers[key]) headers[key] = incoming.headers[key];
        const response = await fetch(`${apiBase.value}${incoming.url}`, {
          method: incoming.method,
          headers,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {})
        });
        outgoing
          .writeHead(response.status, Object.fromEntries(response.headers))
          .end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const file =
        path === '/admin/' ? '/admin/index.html'
        : ['/', '/create', '/images', '/providers'].includes(path) ? '/index.html'
        : path;
      outgoing
        .writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
        .end(await readFile(join(root, file)));
    })().catch(() => outgoing.writeHead(404).end());
  });
  const origin = await listen(front);
  const api = await startNodeServer({
    MEDIA_DATA_DIRECTORY: directory,
    MEDIA_PUBLIC_ORIGIN: origin,
    PORT: '0',
    ...(managed ?
      {
        MEDIA_SUPABASE_URL: origin,
        MEDIA_SUPABASE_ANON_KEY: 'sb_publishable_fixture',
        MEDIA_SUPABASE_SERVICE_ROLE_KEY: 'private-server-key'
      }
    : {})
  });
  if (!api.server.listening) await once(api.server, 'listening');
  apiBase.value = `http://127.0.0.1:${api.server.address().port}`;
  return {
    origin,
    async close() {
      await api.close();
      await new Promise(resolveClose => front.close(resolveClose));
      await rm(directory, { recursive: true, force: true });
    }
  };
}

for (const managed of [true, false])
  test(`浏览器完成${managed ? '预置服务' : '向导配置服务'}的初始化、登录和退出`, async () => {
    const server = await fixture(managed);
    const browser = await chromium.launch({ headless: true, channel: process.env.AIAO_PLAYWRIGHT_CHANNEL || 'chrome' });
    const page = await browser.newPage();
    try {
      await page.goto(server.origin);
      await page.getByRole('heading', { name: '首次初始化', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/admin/');
      assert.equal(await page.getByLabel('安装凭据', { exact: true }).count(), 0);
      if (!managed) {
        await page.getByLabel('Supabase URL', { exact: true }).fill(server.origin);
        await page.getByLabel('公开 Key', { exact: true }).fill('sb_publishable_fixture');
        await page.getByLabel('服务端密钥', { exact: true }).fill('private-server-key');
      }
      await page.getByLabel('管理员邮箱', { exact: true }).fill('owner@example.test');
      await page.getByLabel('管理员密码', { exact: true }).fill(password);
      await page.getByLabel('确认密码', { exact: true }).fill(password);
      await page.screenshot({
        path: `/tmp/aiao-installation-${managed ? 'managed' : 'configured'}.png`,
        fullPage: true
      });
      await page.getByRole('button', { name: '完成初始化', exact: true }).click();
      await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor();
      await page.getByLabel('邮箱', { exact: true }).fill('owner@example.test');
      await page.getByLabel('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: '登录后台', exact: true }).click();
      await page.getByRole('heading', { name: '用户列表', exact: true }).waitFor();
      await page.getByRole('button', { name: '退出登录', exact: true }).click();
      await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor();
      const status = await (await page.request.get(`${server.origin}/api/installation`)).json();
      assert.equal(status.initialized, true);
      assert.equal(status.auth.url, server.origin);
      assert.ok(!JSON.stringify(status).includes('private-server-key'));
    } finally {
      await browser.close();
      await server.close();
    }
  });
