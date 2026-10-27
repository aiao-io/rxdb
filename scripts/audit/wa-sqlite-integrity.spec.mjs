import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  assertEqual,
  packageResolution,
  SUBFRAME_GLUE_FILE,
  SUBFRAME_GLUE_SOURCE,
  SUBFRAME_INTEGRITY,
  SUBFRAME_VERSION,
  verifyLockfile,
  verifyManifestDependencies,
  verifySubframeSqliteWasm
} from './wa-sqlite-integrity.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MINIPROGRAM_MANIFEST = path.join(ROOT, 'packages/rxdb-adapter-miniprogram/package.json');

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

test('工作区当前状态过得了供应链门禁', () => {
  assert.doesNotThrow(() => verifyManifestDependencies());
  assert.doesNotThrow(() => verifyLockfile());
  assert.doesNotThrow(() => verifySubframeSqliteWasm());
});

test('@subframe7536/sqlite-wasm 钉的是精确版本而不是范围', () => {
  const dependency = readJson(MINIPROGRAM_MANIFEST).dependencies['@subframe7536/sqlite-wasm'];

  assert.equal(dependency, SUBFRAME_VERSION);
  assert.doesNotMatch(dependency, /^[\^~><=]/);
});

test('锁文件里的 integrity 与钉死值一致', () => {
  const lockfile = readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8');

  assert.ok(lockfile.includes(`'@subframe7536/sqlite-wasm@${SUBFRAME_VERSION}':`));
  assert.ok(lockfile.includes(`integrity: ${SUBFRAME_INTEGRITY}`));
});

test('pnpm 12 的双文档锁文件：只在工作区文档的 packages 段取解析结果', () => {
  const packageKey = `  '@subframe7536/sqlite-wasm@${SUBFRAME_VERSION}':`;
  // 第一个文档是 packageManagerDependencies，自带 packages 段；patchedDependencies 改成了单行 `键: hash`。
  const lockfile = [
    '---',
    "lockfileVersion: '9.0'",
    '',
    'packages:',
    '',
    '  pnpm@12.15.0:',
    '    resolution: {integrity: sha512-pnpm}',
    '',
    '---',
    "lockfileVersion: '9.0'",
    '',
    'patchedDependencies:',
    `${packageKey} 88b43a0359a3e4ca`,
    '',
    'packages:',
    '',
    packageKey,
    `    resolution: {integrity: ${SUBFRAME_INTEGRITY}}`,
    ''
  ].join('\n');

  assert.ok(packageResolution(lockfile, packageKey).includes(`integrity: ${SUBFRAME_INTEGRITY}`));
});

test('源码 import 的 glue 文件名与钉死的内容哈希一致', () => {
  const source = readFileSync(path.join(ROOT, SUBFRAME_GLUE_SOURCE), 'utf8');

  assert.ok(source.includes(`@subframe7536/sqlite-wasm/dist/${SUBFRAME_GLUE_FILE}`));
});

test('assertEqual 把实际值一起报出来，而不是只说不相等', () => {
  assert.throws(() => assertEqual('^1.3.1', '1.3.1', 'dependency'), /must be "1\.3\.1", got "\^1\.3\.1"/);
});

test('.gitattributes 把换行钉在 LF，锁文件跨平台字节一致', () => {
  const attrs = readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');

  assert.match(attrs, /^\* text=auto eol=lf$/m);
  assert.match(attrs, /^\*\.wasm binary$/m);
});
