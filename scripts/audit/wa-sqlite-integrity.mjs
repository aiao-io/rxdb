/**
 * wa-sqlite 供应链完整性验证：校验 vendor 资产和 tarball 的 SHA-256/512 哈希，
 * 确保 miniprogram 适配器中引用的 wa-sqlite 二进制未被篡改。
 *
 * Windows runner 默认 `core.autocrlf=true`。vendored `.cjs` 一旦被转成 CRLF，
 * SHA-256 会从钉死值变成另一个稳定哈希，看起来像供应链被改，其实是换行。
 * `.gitattributes` 负责 checkout 侧钉 LF；这里再拒 CR，避免误报成哈希对不上。
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
export const VENDORED_ASSET_INTEGRITY = [
  {
    path: 'packages/rxdb-adapter-miniprogram/assets/wa-sqlite.cjs',
    sha256: '0315bd7ab59cf919893b1d5ed2788c6f39e45b6a46f861c9e92908f07b73ab9f'
  },
  {
    path: 'packages/rxdb-adapter-miniprogram/assets/wa-sqlite.wasm',
    sha256: 'aa0c2e6f606d49ecb276808bfd9f31176ecc73b5d9c9a80dd15c615fa801846c'
  }
];

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertEqual(actual, expected, label) {
  if (actual === expected) return;
  throw new Error(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/**
 * vendored 文本资产禁止 CR。Windows checkout 把 LF 改成 CRLF 后，哈希会变成
 * 另一个稳定值，看起来像文件被换过。先拦换行，再比 SHA。
 */
export function assertNoCr(bytes, label) {
  if (!bytes.includes(0x0d)) return;
  throw new Error(`${label} contains CR (0x0d); Windows autocrlf rewrote the file. Pin LF via .gitattributes`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

function packageResolution(lockfile) {
  const packageKey = `  wa-sqlite@${WA_SQLITE_TARBALL}:`;
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
  const resolution = packageResolution(lockfile);
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

export function verifyVendoredAssets() {
  for (const asset of VENDORED_ASSET_INTEGRITY) {
    const bytes = readFileSync(resolve(ROOT, asset.path));
    if (asset.path.endsWith('.cjs')) assertNoCr(bytes, asset.path);
    assertEqual(sha256(bytes), asset.sha256, `${asset.path} SHA-256 integrity`);
  }
}

export function verify() {
  const archiveIndex = process.argv.indexOf('--archive');
  verifyManifestDependencies();
  verifyLockfile();
  verifyVendoredAssets();
  verifyArchive(archiveIndex < 0 ? undefined : process.argv[archiveIndex + 1]);
  console.log(`wa-sqlite supply-chain pin OK: ${WA_SQLITE_COMMIT}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verify();
}
