import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { desktopHeaders, isolationHeaders } from '../../apps/e2e/src/fixtures/artifact-server.mjs';
import { staticHeaders } from '../../apps/web/tools/serve-static.mjs';
import { deployConfig } from './config.mjs';
import { parseHeadersFile } from './dist-check.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const productRoot = path.join(repoRoot, 'aiao-desktop');
const webRoot = path.join(productRoot, 'apps/web');

test('产物目录就是 web 构建的输出目录', async () => {
  const project = JSON.parse(await readFile(path.join(webRoot, 'project.json'), 'utf8'));
  const outputPath = project.targets.build.options.outputPath;
  assert.equal(deployConfig.distDir, path.join(repoRoot, outputPath, 'browser'));
});

test('随构建发布的 _headers 满足发布配置要求的跨源隔离响应头（D-05）', async () => {
  const text = await readFile(path.join(webRoot, 'public/_headers'), 'utf8');
  const rootRule = parseHeadersFile(text).get('/*');
  assert.ok(rootRule, '_headers 需要全站规则 /*');
  for (const [name, value] of Object.entries(deployConfig.requiredHeaders)) {
    assert.ok(
      rootRule.some(header => header.name === name && header.value === value),
      `/* 缺少 ${name}: ${value}`
    );
  }
});

test('托管必需的响应头：跨源隔离（D-05）加防嵌入（D-16）', () => {
  assert.deepEqual(deployConfig.requiredHeaders, {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'X-Frame-Options': 'SAMEORIGIN'
  });
});

test('全站规则 /* 的响应头不在其他规则里重复：Pages 会把同名响应头拼成无效值（例如 oauth 返回页自带的 CSP）', async () => {
  const rules = parseHeadersFile(await readFile(path.join(webRoot, 'public/_headers'), 'utf8'));
  const sitewide = new Set(rules.get('/*').map(header => header.name.toLowerCase()));
  for (const [rule, headers] of rules) {
    if (rule === '/*') continue;
    for (const { name } of headers) assert.ok(!sitewide.has(name.toLowerCase()), `${rule} 重复了 /* 的 ${name}`);
  }
});

test('预览服务与冒烟的静态服务器都返回 requiredHeaders，与生产的 _headers 一致', () => {
  assert.deepEqual({ ...staticHeaders }, deployConfig.requiredHeaders);
  assert.deepEqual({ ...desktopHeaders }, deployConfig.requiredHeaders);
});

test('开发服务器只带跨源隔离，不带防嵌入：IDE 内置预览用 iframe 打开 localhost', async () => {
  const { targets } = JSON.parse(await readFile(path.join(webRoot, 'project.json'), 'utf8'));
  assert.deepEqual(targets.serve.configurations.development.headers, { ...isolationHeaders });
  const { 'X-Frame-Options': frameOptions, ...isolation } = deployConfig.requiredHeaders;
  assert.equal(frameOptions, 'SAMEORIGIN');
  assert.deepEqual(isolation, { ...isolationHeaders });
});

test('集成应用的冒烟服务器只带跨源隔离：桌面要嵌入它，不能带防嵌入响应头', () => {
  assert.deepEqual(Object.keys(isolationHeaders).sort(), [
    'Cross-Origin-Embedder-Policy',
    'Cross-Origin-Opener-Policy'
  ]);
});

test('发布到哪个 Pages 项目与分支写在配置里，生产分支和 Preview 分支不同', () => {
  assert.match(deployConfig.projectName, /^[a-z0-9-]+$/);
  assert.notEqual(deployConfig.productionBranch, deployConfig.previewBranch);
  assert.match(deployConfig.wranglerVersion, /^\d+\.\d+\.\d+$/);
});

test('时限、传播等待与自定义域名登记在配置里，取值合理', () => {
  const { wranglerTimeoutMs, propagation, customDomains } = deployConfig;
  for (const value of [
    wranglerTimeoutMs.query,
    wranglerTimeoutMs.upload,
    propagation.timeoutMs,
    propagation.intervalMs
  ])
    assert.ok(Number.isInteger(value) && value > 0, `时限必须是正整数毫秒：${value}`);
  assert.ok(wranglerTimeoutMs.upload > wranglerTimeoutMs.query, '上传的时限要比查询长');
  assert.ok(propagation.timeoutMs > propagation.intervalMs, '传播等待至少要能再试一次');
  assert.ok(customDomains.length > 0);
  for (const domain of customDomains) assert.match(domain, /^[a-z0-9.-]+\.[a-z]{2,}$/, domain);
  assert.ok(
    customDomains.every(domain => !domain.endsWith('.pages.dev')),
    '自定义域名不含 pages.dev 地址'
  );
});

test('域名只登记在 config.mjs：发布脚本里不再写死自定义域名（换域名只改一处）', async () => {
  const directory = path.join(productRoot, 'scripts/deploy');
  const scripts = (await readdir(directory)).filter(name => name.endsWith('.mjs') && !name.endsWith('.spec.mjs'));
  assert.ok(scripts.includes('inspect-live.mjs'));
  for (const name of scripts.filter(name => name !== 'config.mjs')) {
    const source = await readFile(path.join(directory, name), 'utf8');
    for (const domain of deployConfig.customDomains) assert.ok(!source.includes(domain), `${name} 写死了 ${domain}`);
  }
});

test('deploy 门禁接线：先正式构建 web、再扫密钥，且从不命中缓存（删掉任何一项都要红）', async () => {
  const { targets } = JSON.parse(await readFile(path.join(productRoot, 'project.json'), 'utf8'));
  const { deploy } = targets;
  assert.ok(
    deploy.dependsOn.some(
      dependency => dependency.projects?.join() === 'aiao-desktop-web' && dependency.target === 'build'
    ),
    'deploy 要依赖 aiao-desktop-web:build，上传的才是最新的正式构建'
  );
  assert.ok(deploy.dependsOn.includes('audit-secrets'), 'deploy 要依赖 audit-secrets：发布前必须扫过密钥（D-03）');
  assert.equal(deploy.cache, false, 'deploy 不能命中缓存：缓存会让 Nx 跳过真正的发布');
  assert.equal(deploy.options.cwd, 'aiao-desktop');
  assert.equal(deploy.options.command, 'node scripts/deploy/deploy.mjs');

  const audit = targets['audit-secrets'];
  assert.ok(
    audit.dependsOn.some(
      dependency => dependency.projects?.join() === 'aiao-desktop-web' && dependency.target === 'build'
    ),
    'audit-secrets 要依赖 web 的构建：扫描的就是要上传的产物'
  );
  assert.equal(audit.options.command, 'node scripts/check-web-secrets.mjs');
});

test('构建与开发都先准备包管理器资源，并将生成目录托管到 /vendor/', async () => {
  const { targets } = JSON.parse(await readFile(path.join(webRoot, 'project.json'), 'utf8'));
  assert.ok(targets.build.dependsOn.includes('prepare-vendor'));
  assert.ok(targets.serve.dependsOn.includes('prepare-vendor'));
  const asset = targets.build.options.assets.find(item => item.output === 'vendor');
  assert.equal(asset.input, 'node_modules/.cache/aiao-desktop/vivari/vendor');
  assert.equal(asset.glob, '**/*');
  assert.deepEqual(asset.ignore, ['**/*.tmp']);
  assert.ok(targets['prepare-vendor'].inputs.includes('{workspaceRoot}/aiao-desktop/scripts/vivari/**/*'));
  for (const target of ['build', 'prepare-vendor'])
    assert.ok(targets[target].inputs.includes('{workspaceRoot}/patches/@vivari__core@1.3.0.patch'));

  assert.deepEqual(targets['prepare-vendor'].outputs, ['{workspaceRoot}/' + asset.input]);
});
