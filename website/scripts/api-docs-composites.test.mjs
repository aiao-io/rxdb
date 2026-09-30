import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { repoRoot } from './build-website.mjs';

const require = createRequire(import.meta.url);
const typedocConfig = require('../typedoc.config.cjs');

const websiteRoot = join(repoRoot, 'website');
const apiDocs = JSON.parse(readFileSync(join(websiteRoot, 'project.json'), 'utf8')).targets['api-docs'];
const apiDocsCommand = apiDocs.options.command;

/**
 * typedoc 入口里「tsconfig.lib.json 产物落在 dist/out-tsc」的 Angular 包。
 *
 * 这些包的声明产物不随任何构建链产出（ng-packagr 写 dist/packages/），只有
 * `tsc --build` 才会写到 dist/out-tsc；因此它们必须出现在 api-docs 的预构建列表里。
 */
function angularEntryPackages() {
  const names = [];

  for (const entryPoint of typedocConfig.entryPoints) {
    const packageDir = resolve(websiteRoot, entryPoint);
    const libConfig = join(packageDir, 'tsconfig.lib.json');

    if (!existsSync(libConfig)) continue;

    const outDir = JSON.parse(readFileSync(libConfig, 'utf8')).compilerOptions?.outDir;

    if (outDir && resolve(packageDir, outDir).startsWith(join(repoRoot, 'dist', 'out-tsc'))) {
      names.push(relative(websiteRoot, libConfig));
    }
  }

  return names;
}

test('typedoc 入口里的每个 Angular 包都进了 api-docs 的复合产物预构建', () => {
  // 漏掉任何一个，净树（Netlify / CI runner 都没有 dist/out-tsc）上 typedoc 都会在
  // 引用它的包里报 TS6305；本地因为历史 tsc --build 残留而察觉不到。
  const missing = angularEntryPackages().filter(path => !apiDocsCommand.includes(path));

  assert.deepEqual(missing, []);
});

test('api-docs 先补复合产物、后跑 typedoc，且只发声明', () => {
  const tscBuild = apiDocsCommand.indexOf('tsc --build');
  const typedoc = apiDocsCommand.indexOf('typedoc');

  assert.ok(tscBuild !== -1, 'missing composite pre-build');
  assert.ok(tscBuild < typedoc, 'composite pre-build must run before typedoc');
  assert.match(apiDocsCommand, /--emitDeclarationOnly/);
});

test('预构建列表里不存在没有 README.md 入口的幽灵路径', () => {
  // 命令里每条 tsconfig.lib.json 都必须是仓库里真实存在的文件；
  // 手改列表拼错目录名时在这里拦下，而不是留给 CI 的 tsc 去报 ENOENT。
  const relativePaths = apiDocsCommand.match(/\.\.\/packages\/[\w-]+\/tsconfig\.lib\.json/g) ?? [];

  for (const path of relativePaths) {
    assert.ok(existsSync(join(websiteRoot, path)), `${path} does not exist`);
  }
});
