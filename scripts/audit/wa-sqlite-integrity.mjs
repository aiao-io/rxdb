/**
 * SQLite 供应链完整性验证：把 miniprogram / wa-sqlite 适配器依赖的 SQLite 二进制
 * 来源钉死，确保 `pnpm install` 拉到的东西没被换过。
 *
 * 两条来源各有各的钉法：
 * - `wa-sqlite`（JS API 层 `sqlite-api.js`）走不可变 tarball，钉 commit + SHA-512；
 * - `@subframe7536/sqlite-wasm`（编入 FTS5 的 glue + wasm）走 npm，钉精确版本 +
 *   锁文件 integrity。它的 glue 只在 `./dist/*` 下暴露，文件名带内容哈希，所以
 *   版本号与源码里写的 glue 文件名必须成对更新，否则运行时才会炸。
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = resolve(import.meta.dirname, '../..');
export const WA_SQLITE_COMMIT = '2bf1c59d89eb6497535a4217bc62fec68a0bb994';
export const WA_SQLITE_TARBALL = `https://codeload.github.com/rhashimoto/wa-sqlite/tar.gz/${WA_SQLITE_COMMIT}`;
export const WA_SQLITE_INTEGRITY =
  'sha512-aF923cT8vn7YQ/DuEqconOCe47peo8CmG0Cp28pFqASwYznZhidx5E5w8f0UkhfNjEaM7rNxmykIDrqtL7kC4g==';
export const SUBFRAME_VERSION = '1.3.1';
export const SUBFRAME_INTEGRITY =
  'sha512-0Xlapt/w6tzEjxPsjPSnIEcrgfJfDESYbkEf8gyPCU7HrM0Qcdd/ooXvkK6ZaMtx6aBdsABTBqC77fa2Sk1xsA==';
/** `@subframe7536/sqlite-wasm@1.3.1` 里 Emscripten glue 的内容哈希文件名。 */
export const SUBFRAME_GLUE_FILE = 'wa-sqlite-DfKPyFeY.js';
export const SUBFRAME_GLUE_SOURCE = 'packages/rxdb-adapter-miniprogram/src/subframe-glue.ts';

export function assertEqual(actual, expected, label) {
  if (actual === expected) return;
  throw new Error(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

function packageResolution(lockfile, packageKey) {
  const start = lockfile.indexOf(packageKey);
  if (start < 0) throw new Error(`pnpm-lock.yaml is missing ${packageKey.trim()}`);
  const remainder = lockfile.slice(start + packageKey.length);
  const nextPackage = /\n {2}\S[^\n]*:\n/.exec(remainder);
  const end = nextPackage ? start + packageKey.length + nextPackage.index : undefined;
  return lockfile.slice(start, end);
}

export function verifyManifestDependencies() {
  const manifests = [
    'package.json',
    'benchmarks/package.json',
    'examples/angular-todo/package.json',
    'packages/rxdb-adapter-wa-sqlite/package.json',
    'packages/rxdb-adapter-miniprogram/package.json'
  ];
  for (const manifest of manifests) {
    const dependency = readJson(manifest).dependencies?.['wa-sqlite'];
    assertEqual(dependency, WA_SQLITE_TARBALL, `${manifest} wa-sqlite dependency`);
  }
}

export function verifyLockfile() {
  const lockfile = readFileSync(resolve(ROOT, 'pnpm-lock.yaml'), 'utf8');
  const resolution = packageResolution(lockfile, `  wa-sqlite@${WA_SQLITE_TARBALL}:`);
  if (!resolution.includes(`tarball: ${WA_SQLITE_TARBALL}`)) {
    throw new Error('wa-sqlite lock resolution is missing the immutable tarball URL');
  }
  if (!resolution.includes(`integrity: ${WA_SQLITE_INTEGRITY}`)) {
    throw new Error('wa-sqlite lock resolution is missing the audited SHA-512 integrity');
  }
  if (lockfile.includes('codeload.github.com/rhashimoto/wa-sqlite/tar.gz/refs/tags/')) {
    throw new Error('pnpm-lock.yaml still contains a mutable wa-sqlite tag URL');
  }
}

export function verifyArchive(path) {
  if (!path) return;
  const archive = readFileSync(resolve(path));
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
  assertEqual(integrity, WA_SQLITE_INTEGRITY, 'wa-sqlite archive integrity');
}

/**
 * `@subframe7536/sqlite-wasm` 必须锁精确版本：glue 文件名带内容哈希，`^` 放进来一次
 * 小版本升级就会让 `subframe-glue.ts` 的 import 指向不存在的文件。
 */
export function verifySubframeSqliteWasm() {
  const manifest = 'packages/rxdb-adapter-miniprogram/package.json';
  const dependency = readJson(manifest).dependencies?.['@subframe7536/sqlite-wasm'];
  assertEqual(dependency, SUBFRAME_VERSION, `${manifest} @subframe7536/sqlite-wasm dependency`);

  const lockfile = readFileSync(resolve(ROOT, 'pnpm-lock.yaml'), 'utf8');
  const resolution = packageResolution(lockfile, `  '@subframe7536/sqlite-wasm@${SUBFRAME_VERSION}':`);
  if (!resolution.includes(`integrity: ${SUBFRAME_INTEGRITY}`)) {
    throw new Error('@subframe7536/sqlite-wasm lock resolution is missing the audited SHA-512 integrity');
  }

  const source = readFileSync(resolve(ROOT, SUBFRAME_GLUE_SOURCE), 'utf8');
  if (!source.includes(`@subframe7536/sqlite-wasm/dist/${SUBFRAME_GLUE_FILE}`)) {
    throw new Error(
      `${SUBFRAME_GLUE_SOURCE} must import the glue pinned for ${SUBFRAME_VERSION} (dist/${SUBFRAME_GLUE_FILE})`
    );
  }
}

export function verify() {
  const archiveIndex = process.argv.indexOf('--archive');
  verifyManifestDependencies();
  verifyLockfile();
  verifySubframeSqliteWasm();
  verifyArchive(archiveIndex < 0 ? undefined : process.argv[archiveIndex + 1]);
  console.log(`sqlite supply-chain pin OK: wa-sqlite ${WA_SQLITE_COMMIT} / sqlite-wasm ${SUBFRAME_VERSION}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verify();
}
