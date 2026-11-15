import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { deployConfig } from './config.mjs';
import { parseHeadersFile } from './dist-check.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const webRoot = path.join(repoRoot, 'aiao-desktop/apps/web');

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

test('发布到哪个 Pages 项目与分支写在配置里，生产分支和 Preview 分支不同', () => {
  assert.match(deployConfig.projectName, /^[a-z0-9-]+$/);
  assert.notEqual(deployConfig.productionBranch, deployConfig.previewBranch);
  assert.match(deployConfig.wranglerVersion, /^\d+\.\d+\.\d+$/);
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
