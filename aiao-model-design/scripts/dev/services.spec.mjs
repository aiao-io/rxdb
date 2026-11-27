import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { dashboardUrl, services, webUrl, workerUrl } from './services.mjs';

const product = path.resolve(import.meta.dirname, '../..');

async function project(relative) {
  return JSON.parse(await readFile(path.join(product, relative, 'project.json'), 'utf8'));
}

test('dev 目标的端口与就绪探测和固定入口一致', async () => {
  const [root, web, api] = await Promise.all([project('.'), project('apps/web'), project('apps/api')]);
  assert.equal(web.targets.dev.options.port, services.web.port);
  assert.equal(web.targets.dev.readyWhen.url, webUrl);
  assert.equal(api.targets.dev.readyWhen.url, `${workerUrl}/health`);
  assert.match(api.targets.dev.options.command, new RegExp(`--port ${services.worker.port}(?:\\s|$)`));
  assert.equal(root.targets.dev.readyWhen.url, dashboardUrl);
});

test('Worker 只监听本机回环地址，Web 开发代理默认转发到它', async () => {
  assert.equal(services.worker.host, '127.0.0.1');
  const proxy = await readFile(path.join(product, 'apps/web/proxy.conf.cjs'), 'utf8');
  assert.ok(proxy.includes(`'${workerUrl}'`), proxy);
});

test('本地 Auth 的站点地址指向 Web 入口', async () => {
  const compose = await readFile(path.join(product, 'infra/supabase/docker-compose.yml'), 'utf8');
  assert.match(compose, new RegExp(`GOTRUE_SITE_URL: ${webUrl}\\n`));
});
