import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { assertNoCr, sha256, VENDORED_ASSET_INTEGRITY } from './wa-sqlite-integrity.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CJS = path.join(ROOT, 'packages/rxdb-adapter-miniprogram/assets/wa-sqlite.cjs');

/** Windows `core.autocrlf=true` 把 LF 改成 CRLF 后的 SHA-256（CI 实测）。 */
const WINDOWS_CRLF_SHA256 = '2c7bf32a97451b3b2ceaff0d398768a3edcff2634c0f187aeb679aa25e5fb19f';

function toCrlf(bytes) {
  const out = [];
  for (const byte of bytes) {
    if (byte === 0x0a) out.push(0x0d, 0x0a);
    else out.push(byte);
  }
  return Buffer.from(out);
}

test('vendored .cjs 是 LF；CRLF 重写后的哈希就是 Windows CI 报的那个', () => {
  const lf = readFileSync(CJS);
  const expected = VENDORED_ASSET_INTEGRITY.find(asset => asset.path.endsWith('wa-sqlite.cjs'))?.sha256;

  assert.ok(expected);
  assert.equal(lf.includes(0x0d), false);
  assert.equal(sha256(lf), expected);
  assert.equal(sha256(toCrlf(lf)), WINDOWS_CRLF_SHA256);
});

test('含 CR 的 vendored 文本资产被拒绝，而不是报成哈希对不上', () => {
  assert.throws(() => assertNoCr(Buffer.from('factory();\r\n'), 'wa-sqlite.cjs'), /CR \(0x0d\)/);
});

test('纯 LF / 二进制 wasm 不含 CR 检查误报', () => {
  assert.doesNotThrow(() => assertNoCr(Buffer.from('factory();\n'), 'wa-sqlite.cjs'));
  assert.doesNotThrow(() => assertNoCr(Buffer.from([0x00, 0x61, 0x73, 0x6d]), 'wa-sqlite.wasm'));
});

test('.gitattributes 把 vendored 资产钉在跨平台字节级一致', () => {
  const attrs = readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');

  assert.match(attrs, /^\* text=auto eol=lf$/m);
  assert.match(attrs, /packages\/rxdb-adapter-miniprogram\/assets\/wa-sqlite\.cjs text eol=lf/);
  assert.match(attrs, /packages\/rxdb-adapter-miniprogram\/assets\/wa-sqlite\.wasm binary/);
});

test('工作区 vendored 资产当前字节与钉死的 SHA-256 一致', () => {
  for (const asset of VENDORED_ASSET_INTEGRITY) {
    const bytes = readFileSync(path.join(ROOT, asset.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.path);
  }
});
