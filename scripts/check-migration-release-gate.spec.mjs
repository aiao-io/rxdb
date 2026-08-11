import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { validateManifest } from './check-migration-release-gate.mjs';

const bridgeManifest = () => ({
  $schemaVersion: 1,
  bridge: { tag: null, version: null },
  oldBundlePolicy: { strategy: null, minimumVersion: null, enforced: false },
  release: {
    kind: 'bridge',
    version: '0.0.25',
    protocolVersion: 1,
    systemSchemaUpgrade: false,
    changeCodecUpgrade: false
  }
});

const migrationManifest = () => ({
  $schemaVersion: 1,
  bridge: { tag: 'v0.0.24', version: '0.0.24' },
  oldBundlePolicy: { strategy: 'force-update', minimumVersion: '0.0.24', enforced: true },
  release: {
    kind: 'migration',
    version: '0.0.25',
    protocolVersion: 1,
    systemSchemaUpgrade: true,
    changeCodecUpgrade: true
  }
});

// migration 分支默认放行三个 git 钩子，单独的用例再逐个置为 false。
const passingHooks = {
  bridgeTagExists: () => true,
  bridgeTagIsAncestor: () => true,
  bridgeTagSupportsProtocol: () => true
};

test('合法的 bridge 清单没有错误', () => {
  assert.deepEqual(validateManifest(bridgeManifest()), []);
});

test('合法的 migration 清单没有错误', () => {
  assert.deepEqual(validateManifest(migrationManifest(), passingHooks), []);
});

test('非对象清单直接拒绝', () => {
  assert.deepEqual(validateManifest(null), ['manifest must be a JSON object']);
  assert.deepEqual(validateManifest([]), ['manifest must be a JSON object']);
});

test('$schemaVersion 必须是 1', () => {
  const manifest = bridgeManifest();
  manifest.$schemaVersion = 2;

  assert.deepEqual(validateManifest(manifest), ['$schemaVersion must be 1']);
});

test('release 缺失时短路返回', () => {
  assert.deepEqual(validateManifest({ $schemaVersion: 1 }), ['release must be an object']);
});

test('release.kind 只接受 bridge 或 migration', () => {
  const manifest = bridgeManifest();
  manifest.release.kind = 'patch';

  assert.ok(validateManifest(manifest).includes('release.kind must be bridge or migration'));
});

test('release.version 必须是严格 semver', () => {
  for (const version of ['0.0', 'v0.0.25', '0.01.0', 1]) {
    const manifest = bridgeManifest();
    manifest.release.version = version;

    assert.ok(
      validateManifest(manifest).includes('release.version must be a semver version'),
      `expected ${String(version)} to be rejected`
    );
  }
});

test('release.version 必须与发布 tag 一致', () => {
  const manifest = bridgeManifest();

  assert.deepEqual(validateManifest(manifest, { releaseTag: 'v0.0.25' }), []);
  assert.ok(
    validateManifest(manifest, { releaseTag: 'v0.0.26' }).includes('release.version 0.0.25 does not match tag v0.0.26')
  );
});

test('protocolVersion 必须是正整数', () => {
  for (const protocolVersion of [0, -1, 1.5, '1']) {
    const manifest = bridgeManifest();
    manifest.release.protocolVersion = protocolVersion;

    assert.ok(validateManifest(manifest).includes('release.protocolVersion must be a positive integer'));
  }
});

test('升级布尔位必须是布尔值', () => {
  const manifest = bridgeManifest();
  manifest.release.systemSchemaUpgrade = 'false';
  manifest.release.changeCodecUpgrade = 0;

  const errors = validateManifest(manifest);

  assert.ok(errors.includes('release.systemSchemaUpgrade must be boolean'));
  assert.ok(errors.includes('release.changeCodecUpgrade must be boolean'));
});

test('bridge 发布不得声明系统 schema 或 change codec 升级', () => {
  const manifest = bridgeManifest();
  manifest.release.systemSchemaUpgrade = true;

  assert.ok(validateManifest(manifest).includes('bridge releases cannot upgrade system schema or change codec'));
});

test('migration 发布必须至少升级其一', () => {
  const manifest = migrationManifest();
  manifest.release.systemSchemaUpgrade = false;
  manifest.release.changeCodecUpgrade = false;

  assert.ok(
    validateManifest(manifest, passingHooks).includes('migration releases must upgrade system schema or change codec')
  );
});

test('migration 发布必须填写 bridge tag 与 version', () => {
  const manifest = migrationManifest();
  manifest.bridge = { tag: null, version: null };

  const errors = validateManifest(manifest, passingHooks);

  assert.ok(errors.includes('bridge.tag is required for migration releases'));
  assert.ok(errors.includes('bridge.version is required for migration releases'));
});

test('bridge 发布不要求 bridge tag', () => {
  const manifest = bridgeManifest();

  assert.ok(!validateManifest(manifest).some(error => error.startsWith('bridge.tag')));
});

test('bridge.version 必须早于 release.version', () => {
  for (const version of ['0.0.25', '0.0.26']) {
    const manifest = migrationManifest();
    manifest.bridge = { tag: `v${version}`, version };
    manifest.oldBundlePolicy.minimumVersion = version;

    assert.ok(
      validateManifest(manifest, passingHooks).includes('bridge.version must be older than release.version'),
      `expected bridge ${version} to be rejected`
    );
  }
});

test('bridge.tag 必须与 bridge.version 对应', () => {
  const manifest = migrationManifest();
  manifest.bridge.tag = 'v0.0.23';

  assert.ok(validateManifest(manifest, passingHooks).includes('bridge.tag must match bridge.version'));
});

test('bridge.tag 必须存在、是祖先提交且包含 writer lease 协议', () => {
  const cases = [
    ['bridgeTagExists', 'bridge.tag v0.0.24 does not exist in the repository'],
    ['bridgeTagIsAncestor', 'bridge.tag v0.0.24 is not an ancestor of the release commit'],
    ['bridgeTagSupportsProtocol', 'bridge.tag v0.0.24 does not contain the writer lease protocol']
  ];

  for (const [hook, expected] of cases) {
    const errors = validateManifest(migrationManifest(), { ...passingHooks, [hook]: () => false });

    assert.ok(errors.includes(expected), `expected ${hook} to report: ${expected}`);
  }
});

test('oldBundlePolicy.strategy 只接受白名单内的策略', () => {
  const expected =
    'oldBundlePolicy.strategy must be one of force-update, cache-invalidation, server-version, database-namespace';

  for (const strategy of ['force-update', 'cache-invalidation', 'server-version', 'database-namespace']) {
    const manifest = migrationManifest();
    manifest.oldBundlePolicy.strategy = strategy;

    assert.deepEqual(validateManifest(manifest, passingHooks), [], `expected ${strategy} to be accepted`);
  }

  for (const strategy of [null, 'ignore', '']) {
    const manifest = migrationManifest();
    manifest.oldBundlePolicy.strategy = strategy;

    assert.ok(
      validateManifest(manifest, passingHooks).includes(expected),
      `expected ${String(strategy)} to be rejected`
    );
  }
});

test('migration 发布必须启用 oldBundlePolicy 并声明最低版本', () => {
  const manifest = migrationManifest();
  manifest.oldBundlePolicy.enforced = false;
  manifest.oldBundlePolicy.minimumVersion = null;

  const errors = validateManifest(manifest, passingHooks);

  assert.ok(errors.includes('oldBundlePolicy.minimumVersion is required for migration releases'));
  assert.ok(errors.includes('oldBundlePolicy.enforced must be true for migration releases'));
});

test('oldBundlePolicy.minimumVersion 不得低于 bridge.version', () => {
  const manifest = migrationManifest();
  manifest.oldBundlePolicy.minimumVersion = '0.0.23';

  assert.ok(
    validateManifest(manifest, passingHooks).includes('oldBundlePolicy.minimumVersion must be at least bridge.version')
  );
});

test('bridge 发布不校验 oldBundlePolicy 内容', () => {
  const manifest = bridgeManifest();
  manifest.oldBundlePolicy = { strategy: null, minimumVersion: null, enforced: false };

  assert.deepEqual(validateManifest(manifest), []);
});

test('bridge 与 oldBundlePolicy 必须是对象', () => {
  const manifest = bridgeManifest();
  manifest.bridge = null;
  manifest.oldBundlePolicy = null;

  const errors = validateManifest(manifest);

  assert.ok(errors.includes('bridge must be an object'));
  assert.ok(errors.includes('oldBundlePolicy must be an object'));
});

// 回归：仓库里签入的清单一度长期处于 kind=migration + bridge.tag=null 的
// 恒定 fail-closed 状态，直到发布时才暴露。结构校验放在单测里，git 相关的
// 存在性/祖先/协议检查仍由 CI 的真实门禁执行。
test('签入的 migration-release.json 通过结构校验', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../requirements/migration-release.json', import.meta.url), 'utf8')
  );

  assert.deepEqual(validateManifest(manifest, passingHooks), []);
});
