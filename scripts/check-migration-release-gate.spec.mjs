import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  CHANGE_CODEC_VERSION_SOURCE,
  SYSTEM_SCHEMA_VERSION_SOURCE,
  parseVersionConstants,
  resolveReleaseTag,
  validateManifest
} from './check-migration-release-gate.mjs';

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

const normalManifest = () => ({
  $schemaVersion: 1,
  bridge: { tag: null, version: null },
  oldBundlePolicy: { strategy: null, minimumVersion: null, enforced: false },
  release: {
    kind: 'normal',
    version: '0.0.25',
    protocolVersion: 1,
    systemSchemaUpgrade: false,
    changeCodecUpgrade: false
  }
});

const migrationManifest = () => ({
  $schemaVersion: 1,
  bridge: { tag: 'v0.0.26', version: '0.0.26' },
  oldBundlePolicy: { strategy: 'force-update', minimumVersion: '0.0.26', enforced: true },
  release: {
    kind: 'migration',
    version: '0.0.27',
    protocolVersion: 1,
    systemSchemaUpgrade: true,
    changeCodecUpgrade: true
  }
});

// bridge tag 与候选发布提交上的系统版本常量：默认构造成「schema 与 codec 都恰好升了一级」。
const BRIDGE_CONSTANTS = { systemSchemaVersion: 3, changeCodecVersion: 1 };
const RELEASE_CONSTANTS = { systemSchemaVersion: 4, changeCodecVersion: 2 };

// migration 分支默认放行全部 git 钩子，单独的用例再逐个置为 false / 改成不一致的常量。
const passingHooks = {
  bridgeTagExists: () => true,
  bridgeTagIsAncestor: () => true,
  bridgeTagSupportsProtocol: () => true,
  bridgeTagVersionConstants: () => BRIDGE_CONSTANTS,
  releaseVersionConstants: RELEASE_CONSTANTS
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

test('release.kind 只接受 normal / bridge / migration', () => {
  const manifest = bridgeManifest();
  manifest.release.kind = 'patch';

  assert.ok(validateManifest(manifest).includes('release.kind must be normal, bridge or migration'));
});

test('合法的 normal 清单没有错误', () => {
  assert.deepEqual(validateManifest(normalManifest()), []);
});

// normal 是为了让普通 patch 发布不必自称 bridge：bridge 的语义是「被声明为迁移锚点、
// 可被后续 migration 引用为 bridge.tag」，普通发布不该混进这条链。
test('normal 发布不得声明系统 schema 或 change codec 升级', () => {
  for (const field of ['systemSchemaUpgrade', 'changeCodecUpgrade']) {
    const manifest = normalManifest();
    manifest.release[field] = true;

    assert.ok(
      validateManifest(manifest).includes('normal releases cannot upgrade system schema or change codec'),
      `expected ${field} to be rejected`
    );
  }
});

test('normal 发布不得进入 bridge 链', () => {
  const expected = 'normal releases must leave bridge.tag and bridge.version null';

  for (const bridge of [
    { tag: 'v0.0.24', version: '0.0.24' },
    { tag: 'v0.0.24', version: null },
    { tag: null, version: '0.0.24' }
  ]) {
    const manifest = normalManifest();
    manifest.bridge = bridge;

    assert.ok(validateManifest(manifest).includes(expected), `expected ${JSON.stringify(bridge)} to be rejected`);
  }
});

test('normal 发布不校验 oldBundlePolicy 内容', () => {
  const manifest = normalManifest();
  manifest.oldBundlePolicy = { strategy: 'ignore', minimumVersion: null, enforced: false };

  assert.deepEqual(validateManifest(manifest), []);
});

// 0.0.24 事故的同类形态：清单长期停在陈旧版本而无人察觉。清单版本必须与
// `packages/rxdb/package.json` 同步推进，不允许只改其中一处。
test('release.version 必须与 packages/rxdb/package.json 一致', () => {
  const manifest = bridgeManifest();

  assert.deepEqual(validateManifest(manifest, { packageVersion: '0.0.25' }), []);
  assert.ok(
    validateManifest(manifest, { packageVersion: '0.0.24' }).includes(
      'release.version 0.0.25 does not match packages/rxdb/package.json version 0.0.24'
    )
  );
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
  for (const version of ['0.0.27', '0.0.28']) {
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
  manifest.bridge.tag = 'v0.0.28';

  assert.ok(validateManifest(manifest, passingHooks).includes('bridge.tag must match bridge.version'));
});

// v0.0.24 是祖先、四个文件也都在，三道 git 钩子全过——但它早于工作树桥接改造，是个空桥。
// v0.0.25 已脱离发布主线。两者都必须被版本下限挡住，否则「满足依赖顺序第 1 步」可以纯靠改清单伪造。
test('bridge.version 必须严格新于最后一个不合格锚点', () => {
  const expected =
    'bridge.version must be newer than 0.0.25: anchors at or before it predate the working-tree bridging change';

  for (const version of ['0.0.23', '0.0.24', '0.0.25']) {
    const manifest = migrationManifest();
    manifest.bridge = { tag: `v${version}`, version };
    manifest.oldBundlePolicy.minimumVersion = version;

    assert.ok(
      validateManifest(manifest, passingHooks).includes(expected),
      `expected bridge ${version} to be rejected as an anchor`
    );
  }
});

test('0.0.26 起的锚点不受版本下限影响', () => {
  assert.ok(!validateManifest(migrationManifest(), passingHooks).some(error => error.includes('must be newer than')));
});

test('声明了升级位就要求 bridge tag 上的版本常量严格更旧', () => {
  const manifest = migrationManifest();
  const errors = validateManifest(manifest, {
    ...passingHooks,
    bridgeTagVersionConstants: () => RELEASE_CONSTANTS
  });

  assert.ok(
    errors.includes(
      'release.systemSchemaUpgrade is true but system schema version did not advance past bridge.tag v0.0.26 (4 -> 4)'
    )
  );
  assert.ok(
    errors.includes(
      'release.changeCodecUpgrade is true but change codec version did not advance past bridge.tag v0.0.26 (2 -> 2)'
    )
  );
});

// 悄悄抬了 schema 却把升级位写成 false，会让发布绕开整个 oldBundlePolicy 分支。
test('没声明升级位就要求版本常量完全相等', () => {
  const manifest = migrationManifest();
  manifest.release.changeCodecUpgrade = false;

  assert.ok(
    validateManifest(manifest, passingHooks).includes(
      'release.changeCodecUpgrade is false but change codec version changed from 1 (bridge.tag v0.0.26) to 2'
    )
  );
});

test('bridge tag 上读不出版本常量即失败', () => {
  const errors = validateManifest(migrationManifest(), { ...passingHooks, bridgeTagVersionConstants: () => null });

  assert.ok(
    errors.includes(
      'bridge.tag v0.0.26 does not declare readable system version constants in ' +
        'packages/rxdb/src/system/migration.ts / packages/rxdb/src/system/change-codec.ts'
    )
  );
});

// 常量声明位置被改名 / 挪走时必须红，不能因为读不到就静默跳过这道检查。
test('候选发布提交上读不出版本常量即失败', () => {
  const errors = validateManifest(migrationManifest(), { ...passingHooks, releaseVersionConstants: null });

  assert.ok(
    errors.includes(
      'release does not declare readable system version constants in ' +
        'packages/rxdb/src/system/migration.ts / packages/rxdb/src/system/change-codec.ts'
    )
  );
});

test('bridge.tag 必须存在、是祖先提交且包含系统迁移面', () => {
  const cases = [
    ['bridgeTagExists', 'bridge.tag v0.0.26 does not exist in the repository'],
    ['bridgeTagIsAncestor', 'bridge.tag v0.0.26 is not an ancestor of the release commit'],
    ['bridgeTagSupportsProtocol', 'bridge.tag v0.0.26 does not contain the system migration surface']
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
  manifest.oldBundlePolicy.minimumVersion = '0.0.25';

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

// --- resolveReleaseTag -------------------------------------------------------
// 门禁挂进 PR CI 的前提。此前 tag 直接取 `GITHUB_REF_NAME`，在 PR 事件下那是
// `42/merge`，会让每个 PR 都红在一条与发布无关的假失败上。

test('parseVersionConstants 按真实声明取值，缺任一份即 null', () => {
  const schema = 'export const RXDB_SYSTEM_SCHEMA_VERSION = 3 as const;';
  const codec = 'export const RXDB_CHANGE_CODEC_VERSION = 1 as const;';

  assert.deepEqual(parseVersionConstants(schema, codec), { systemSchemaVersion: 3, changeCodecVersion: 1 });
  assert.equal(parseVersionConstants(schema, null), null);
  assert.equal(parseVersionConstants(null, codec), null);
  assert.equal(parseVersionConstants('export const SOMETHING_ELSE = 3;', codec), null);
});

// 仓库里真实的两份声明必须能被同一个正则读出来——否则 CLI 侧会静默退化。
test('仓库工作树上的版本常量可被解析', async () => {
  const constants = parseVersionConstants(
    await readFile(new URL(`../${SYSTEM_SCHEMA_VERSION_SOURCE}`, import.meta.url), 'utf8'),
    await readFile(new URL(`../${CHANGE_CODEC_VERSION_SOURCE}`, import.meta.url), 'utf8')
  );

  assert.ok(Number.isInteger(constants?.systemSchemaVersion));
  assert.ok(Number.isInteger(constants?.changeCodecVersion));
});

test('显式 --release-tag 优先于环境变量', () => {
  assert.equal(
    resolveReleaseTag(['--check', '--release-tag=v0.0.26'], { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.0.25' }),
    'v0.0.26'
  );
});

test('打 tag 的 workflow 回落到 GITHUB_REF_NAME', () => {
  assert.equal(resolveReleaseTag(['--check'], { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.0.25' }), 'v0.0.25');
});

test('PR 与分支 push 不把 ref 名当发布 tag', () => {
  for (const env of [
    { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: '42/merge' },
    { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' },
    {}
  ]) {
    assert.equal(resolveReleaseTag(['--check'], env), undefined, `expected ${JSON.stringify(env)} to skip tag check`);
  }
});

// 回归：仓库里签入的清单一度长期处于 kind=migration + bridge.tag=null 的
// 恒定 fail-closed 状态，直到发布时才暴露。结构校验放在单测里，git 相关的
// 存在性/祖先/协议检查仍由 CI 的真实门禁执行。
test('签入的 migration-release.json 通过结构校验', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../requirements/migration-release.json', import.meta.url), 'utf8')
  );
  const { version } = JSON.parse(await readFile(new URL('../packages/rxdb/package.json', import.meta.url), 'utf8'));

  assert.deepEqual(validateManifest(manifest, { ...passingHooks, packageVersion: version }), []);
});
