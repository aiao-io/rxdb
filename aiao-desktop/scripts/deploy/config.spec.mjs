import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { deployConfig } from './config.mjs';
import { checkDist, parseHeadersFile } from './dist-check.mjs';

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

test('_headers 拷进 dist 后通过发布前的产物检查', async () => {
  const text = await readFile(path.join(webRoot, 'public/_headers'), 'utf8');
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const distDir = await mkdtemp(path.join(tmpdir(), 'aiao-desktop-config-'));
  try {
    await writeFile(path.join(distDir, 'index.html'), '<app-root></app-root>');
    await writeFile(path.join(distDir, '_headers'), text);
    const { problems } = await checkDist({ distDir, requiredHeaders: deployConfig.requiredHeaders });
    assert.deepEqual(problems, []);
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
