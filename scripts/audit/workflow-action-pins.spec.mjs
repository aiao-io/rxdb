import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { auditGithubDir, findUnpinnedUses } from './workflow-action-pins.mjs';

const PINNED = 'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6';

test('可变 tag 被抓出来', () => {
  const offenders = findUnpinnedUses('ci.yml', ['jobs:', '  a:', '    steps:', '      - uses: codecov/codecov-action@v7']);

  assert.deepEqual(offenders, ['ci.yml:4 -> codecov/codecov-action@v7']);
});

test('分支名、语义化版本、`stable` 这类可变引用一并被抓', () => {
  const offenders = findUnpinnedUses('ci.yml', [
    '      - uses: foo/bar@main',
    '      - uses: foo/bar@v1.2.3',
    '      - uses: dtolnay/rust-toolchain@stable'
  ]);

  assert.equal(offenders.length, 3);
});

test('40 位十六进制 SHA 通过', () => {
  assert.deepEqual(findUnpinnedUses('ci.yml', [`      - uses: ${PINNED}`]), []);
});

test('短 SHA 不算钉住 —— 它可以被后续碰撞的新对象抢走', () => {
  const offenders = findUnpinnedUses('ci.yml', ['      - uses: actions/checkout@d23441a']);

  assert.deepEqual(offenders, ['ci.yml:1 -> actions/checkout@d23441a']);
});

// 本仓库自己的 reusable workflow 不是第三方代码，它跟着同一个 commit 走，
// 钉 SHA 反而会让每次改 ci-template.yml 都要同步改调用方。
test('本仓库的 reusable workflow（./.github/…）豁免', () => {
  const offenders = findUnpinnedUses('pr.yml', ['    uses: ./.github/workflows/ci-template.yml']);

  assert.deepEqual(offenders, []);
});

test('docker:// 形式的 uses 不适用 commit SHA 规则', () => {
  assert.deepEqual(findUnpinnedUses('ci.yml', ['      - uses: docker://alpine:3.20']), []);
});

test('完全没有 ref 的 uses 也是可变引用', () => {
  const offenders = findUnpinnedUses('ci.yml', ['      - uses: foo/bar']);

  assert.deepEqual(offenders, ['ci.yml:1 -> foo/bar']);
});

test('注释掉的 uses 不算', () => {
  assert.deepEqual(findUnpinnedUses('ci.yml', ['      # - uses: foo/bar@v1']), []);
});

// 复合 action（.github/actions/*/action.yml）里也 `uses:` 第三方 action，
// 只扫 workflows/ 会漏掉半个供应链面，所以审计入口取整个 .github。
test('仓库现状：.github 下全部 workflow 与复合 action 通过（回归护栏）', async () => {
  const githubDir = path.resolve(import.meta.dirname, '../../.github');

  assert.deepEqual(await auditGithubDir(githubDir), []);
});
