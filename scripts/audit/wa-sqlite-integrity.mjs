/**
 * wa-sqlite 供应链完整性验证：校验 vendor 资产和 tarball 的 SHA-256/512 哈希，
 * 确保 miniprogram 适配器中引用的 wa-sqlite 二进制未被篡改。
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const WA_SQLITE_COMMIT = 'b9ddadce32480857cde28e7b1512cf45fa08ab73';
const WA_SQLITE_TARBALL = `https://codeload.github.com/rhashimoto/wa-sqlite/tar.gz/${WA_SQLITE_COMMIT}`;
const WA_SQLITE_INTEGRITY =
  'sha512-BJz302d7tvcbe83MUepicweNgNo330Y4rENDo9C5SeNXkAGGhMwaQRXqkp2lJmlxUcOnOHL7B9SwcaYo4Tv7mw==';
const VENDORED_ASSET_INTEGRITY = [
  {
    path: 'packages/rxdb-adapter-miniprogram/assets/wa-sqlite.cjs',
    sha256: '0315bd7ab59cf919893b1d5ed2788c6f39e45b6a46f861c9e92908f07b73ab9f'
  },
  {
    path: 'packages/rxdb-adapter-miniprogram/assets/wa-sqlite.wasm',
    sha256: 'aa0c2e6f606d49ecb276808bfd9f31176ecc73b5d9c9a80dd15c615fa801846c'
  }
];

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

function assertEqual(actual, expected, label) {
  if (actual === expected) return;
  throw new Error(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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

function verifyManifestDependencies() {
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

function verifyLockfile() {
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

function verifyArchive(path) {
  if (!path) return;
  const archive = readFileSync(resolve(path));
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
  assertEqual(integrity, WA_SQLITE_INTEGRITY, 'wa-sqlite archive integrity');
}

function verifyVendoredAssets() {
  for (const asset of VENDORED_ASSET_INTEGRITY) {
    const integrity = createHash('sha256')
      .update(readFileSync(resolve(ROOT, asset.path)))
      .digest('hex');
    assertEqual(integrity, asset.sha256, `${asset.path} SHA-256 integrity`);
  }
}

const archiveIndex = process.argv.indexOf('--archive');
verifyManifestDependencies();
verifyLockfile();
verifyVendoredAssets();
verifyArchive(archiveIndex < 0 ? undefined : process.argv[archiveIndex + 1]);
console.log(`wa-sqlite supply-chain pin OK: ${WA_SQLITE_COMMIT}`);
