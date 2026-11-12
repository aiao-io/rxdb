import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { dashboardUrl, previewUrl, services, webUrl } from './services.mjs';

const product = path.resolve(import.meta.dirname, '../..');

async function project(relative) {
  return JSON.parse(await readFile(path.join(product, relative, 'project.json'), 'utf8'));
}

test('开发服务器、正式构建预览与开发导航的端口和固定入口一致', async () => {
  const [root, web] = await Promise.all([project('.'), project('apps/web')]);
  assert.equal(web.targets.serve.options.port, services.web.port);
  assert.equal(web.targets['serve-static'].options.env.PORT, String(services.preview.port));
  assert.equal(web.targets['serve-static'].readyWhen.url, previewUrl);
  assert.equal(root.targets['dev-dashboard'].readyWhen.url, dashboardUrl);
  assert.equal(root.targets.dev.readyWhen.url, dashboardUrl);
});

test('开发服务器启动前先检查固定端口', async () => {
  const web = await project('apps/web');
  assert.deepEqual(web.targets.serve.dependsOn, [{ projects: ['aiao-desktop'], target: 'dev-ports' }]);
});

test('正式构建预览是常驻服务：就绪不等于任务结束', async () => {
  // nx:run-commands 的 readyWhen 选项表示「任务完成」，出现就绪行后 Nx 会收尾并停掉服务；就绪要写在目标级 readyWhen。
  const web = await project('apps/web');
  assert.equal(web.targets['serve-static'].continuous, true);
  assert.equal(web.targets['serve-static'].options.readyWhen, undefined);
});

test('三个入口互不冲突，导航与预览只监听本机回环地址', () => {
  const ports = Object.values(services).map(service => service.port);
  assert.equal(new Set(ports).size, ports.length);
  assert.equal(services.dashboard.host, '127.0.0.1');
  assert.equal(services.preview.host, '127.0.0.1');
  assert.equal(webUrl, `http://localhost:${services.web.port}`);
  assert.equal(previewUrl, `http://127.0.0.1:${services.preview.port}`);
  assert.equal(dashboardUrl, `http://127.0.0.1:${services.dashboard.port}/`);
});
