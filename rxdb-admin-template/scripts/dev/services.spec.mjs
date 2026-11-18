import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { local, ports } from '../../deploy/scripts/lib/paths.mjs';
import { api, apiUrl, apps, dashboard, dashboardUrl, devOrigins, host, stack } from './services.mjs';

const product = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(product, relative), 'utf8');
const project = async relative => JSON.parse(await read(path.join(relative, 'project.json')));
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const viteApps = apps.filter(app => app.id !== 'angular');
const angular = apps.find(app => app.id === 'angular');

describe('本地开发的固定入口', () => {
  it('React / Vue 开发服务器的端口与登记一致，端口被占时直接失败、不换号', async () => {
    for (const app of viteApps) {
      const config = await read(`apps/${app.id}/vite.config.mts`);
      const server = /\n {2}server: \{\n([\s\S]*?)\n {2}\},/.exec(config)?.[1];
      assert.ok(server, `${app.id} 的 vite 配置缺少 server 段`);
      assert.match(server, new RegExp(`port: ${app.port},`));
      assert.match(server, new RegExp(`host: '${escape(host)}'`));
      assert.match(server, /strictPort: true/);
    }
  });

  it('Angular 开发服务器的端口与登记一致', async () => {
    const options = (await project('apps/angular')).targets.serve.options;
    assert.equal(options.port, angular.port);
    assert.equal(options.host, host);
  });

  it('登记的 Nx 项目名与各端 project.json 一致', async () => {
    for (const app of apps) assert.equal((await project(`apps/${app.id}`)).name, app.project);
  });

  it('三端开发服务器的 /collaboration-api 默认代理到协作命令服务', async () => {
    const configs = [...viteApps.map(app => `apps/${app.id}/vite.config.mts`), 'apps/angular/proxy.conf.cjs'];
    for (const file of configs) assert.ok((await read(file)).includes(`?? '${apiUrl}'`), file);
  });

  it('固定端口互不冲突，也不落在本地栈独占的 4500～4529', () => {
    const fixed = [...apps.map(app => app.port), api.port, dashboard.port];
    assert.equal(new Set(fixed).size, fixed.length);
    for (const port of fixed) assert.ok(port < 4500 || port > 4529, String(port));
  });

  it('本地 Supabase 栈的地址取自发布预演的登记', () => {
    assert.deepEqual(stack, {
      gateway: local.supabaseUrl,
      mail: local.mailUrl,
      collector: local.collectorUrl,
      studio: `http://127.0.0.1:${ports.studio}`,
      database: ports.database,
      pooler: ports.pooler
    });
  });

  it('浏览器来源覆盖三端开发服务器的 127.0.0.1 与 localhost 两种写法', () => {
    assert.deepEqual(
      devOrigins,
      apps.flatMap(app => [`http://127.0.0.1:${app.port}`, `http://localhost:${app.port}`])
    );
  });

  it('网关 CORS 放行三端开发服务器的全部来源', async () => {
    const kong = await read('deploy/local/kong.template.yml');
    for (const origin of devOrigins) assert.match(kong, new RegExp(`\\n\\s+- ${escape(origin)}\\n`), origin);
  });
});

describe('产品根 dev 目标的接线', () => {
  it('等开发导航、协作命令服务与三端都就绪后再打开导航', async () => {
    const { targets } = await project('.');
    assert.deepEqual(targets.dev.dependsOn, [
      { target: 'dev-dashboard', waitFor: 'ready' },
      { target: 'dev-api', waitFor: 'ready' },
      ...apps.map(app => ({ projects: [app.project], target: 'serve', waitFor: 'ready' }))
    ]);
  });

  it('先查端口、构建协作服务端，再起本地栈；导航与命令服务都排在本地栈之后', async () => {
    const { targets } = await project('.');
    assert.deepEqual(targets['dev-stack'].dependsOn, [
      'dev-ports',
      { projects: ['admin-collaboration'], target: 'build-server' }
    ]);
    assert.deepEqual(targets['dev-api'].dependsOn, ['dev-stack']);
    assert.deepEqual(targets['dev-dashboard'].dependsOn, ['dev-stack']);
  });

  it('常驻服务用目标级 readyWhen 声明就绪（选项里的 readyWhen 表示任务完成，会让服务被提前停掉）', async () => {
    const { targets } = await project('.');
    assert.deepEqual(targets['dev-dashboard'].readyWhen, { url: dashboardUrl });
    assert.deepEqual(targets['dev-api'].readyWhen, { url: `${apiUrl}/health` });
    for (const name of ['dev', 'dev-dashboard', 'dev-api']) {
      assert.equal(targets[name].continuous, true, name);
      assert.equal(targets[name].cache, false, name);
      assert.equal(targets[name].options.readyWhen, undefined, name);
    }
  });

  it('开发脚本的测试进入产品 test', async () => {
    const { targets } = await project('.');
    assert.ok(targets.test.dependsOn.includes('dev-test'));
    assert.equal(targets['dev-test'].options.command, 'node --test scripts/dev/*.spec.mjs');
  });
});
