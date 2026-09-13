/**
 * scripts/check-migration-release-gate.mjs
 *
 * bridge / migration release 清单校验器（纯函数）。
 * 输入：`requirements/migration-release.json`（由 release 流程维护）。
 *
 * 校验项：
 *   - $schemaVersion、release.kind（normal / bridge / migration）、release.version（semver）、protocolVersion；
 *   - release.version 必须同时匹配发布 tag 与 `packages/rxdb/package.json` 的 version；
 *   - systemSchemaUpgrade / changeCodecUpgrade 布尔位；normal 与 bridge 一律禁止升级；
 *   - normal 不进入 bridge 链（bridge.tag / bridge.version 必须为 null）；
 *   - migration 必须指向已发布的 bridge tag，且协议兼容；
 *   - bridge.version 必须严格新于 `LAST_INELIGIBLE_BRIDGE_VERSION`（早于该版本的 tag 不具备桥接语义）；
 *   - bridge tag 上的系统 schema / change codec 版本常量必须与本次发布声明的升级位吻合；
 *   - migration 的 oldBundlePolicy 必须启用，且 strategy 取自受支持白名单
 *     （force-update / cache-invalidation / server-version / database-namespace）。
 *
 * 外部副作用（git tag 存在性、祖先关系、协议兼容）通过 options 钩子注入，
 * 使纯函数可在单元测试里无网络运行 —— 见 `check-migration-release-gate.spec.mjs`。
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 默认读取的清单路径，CLI 入口使用；纯函数 `validateManifest` 不直接依赖。
const DEFAULT_MANIFEST_PATH = fileURLToPath(new URL('../requirements/migration-release.json', import.meta.url));

// 严格 semver（不允许前导 0，允许预发布 / 构建号）。
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

/**
 * 发布种类。`normal` 是普通发布：与 `bridge` 一样禁止 schema/codec 升级，
 * 但**不进入 bridge 链**——它不被声明为迁移锚点，不能被后续 migration
 * 引用为 `bridge.tag`。缺了 `normal` 时普通 patch 只能自称 `bridge`，
 * 「桥接版本」语义会被稀释到无法判断 `bridge.tag` 该指向哪一次发布。
 */
const RELEASE_KINDS = ['normal', 'bridge', 'migration'];

// 禁止升级系统 schema / change codec 的发布种类。
const NON_MIGRATION_KINDS = new Set(['normal', 'bridge']);

/**
 * 可作为桥接锚点的版本下限（**严格大于**，等于也不行）。
 *
 * `0.0.25` 已脱离发布主线（squash 后不在任何 ancestry 上），而 `0.0.24` 及更早的 tag 虽然是祖先、
 * 也确实含有系统迁移面的四个文件，却**早于工作树/提交图的桥接改造**——把它们填进 `bridge.tag`
 * 能骗过全部四条 tag 钩子（存在性 / 祖先性 / 路径探测 / 版本常量吻合），却给出一个空的桥。
 * 最后一条尤其指望不上：实测 `v0.0.24` 与 `v0.0.25` 的两个常量都是 `{3, 1}`，与今天的 HEAD 完全相同，
 * 所以在 `systemSchemaUpgrade: false` 的发布里它对空桥恒真。**挡空桥的只有这个下限**，
 * 它是 epic-006 发布门禁 1「且不是 v0.0.25」的可执行形式：任何真实的新桥接 tag 都必然大于它，
 * 因此下限只挡错误、不挡正常发布。
 */
const LAST_INELIGIBLE_BRIDGE_VERSION = '0.0.25';

// 系统版本常量的声明位置与取值口径；`bridgeTagVersionConstants` 钩子按同一口径从 tag 上读。
export const SYSTEM_SCHEMA_VERSION_SOURCE = 'packages/rxdb/src/system/migration.ts';
export const CHANGE_CODEC_VERSION_SOURCE = 'packages/rxdb/src/system/change-codec.ts';
const SYSTEM_SCHEMA_VERSION_PATTERN = /export const RXDB_SYSTEM_SCHEMA_VERSION\s*=\s*(\d+)/;
const CHANGE_CODEC_VERSION_PATTERN = /export const RXDB_CHANGE_CODEC_VERSION\s*=\s*(\d+)/;

/**
 * 从两份源码文本里解析系统版本常量。
 * @param {string | null} schemaSource `migration.ts` 的内容
 * @param {string | null} codecSource `change-codec.ts` 的内容
 * @returns {{ systemSchemaVersion: number, changeCodecVersion: number } | null} 任一解析不出即 null
 */
export const parseVersionConstants = (schemaSource, codecSource) => {
  const schema = typeof schemaSource === 'string' ? schemaSource.match(SYSTEM_SCHEMA_VERSION_PATTERN) : null;
  const codec = typeof codecSource === 'string' ? codecSource.match(CHANGE_CODEC_VERSION_PATTERN) : null;
  if (!schema || !codec) return null;
  return { systemSchemaVersion: Number(schema[1]), changeCodecVersion: Number(codec[1]) };
};

// 旧 bundle 处置策略白名单：migration 发布必须从中选一项，未列出的值一律拒绝。
const SUPPORTED_OLD_BUNDLE_STRATEGIES = new Set([
  'force-update',
  'cache-invalidation',
  'server-version',
  'database-namespace'
]);

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const isSemver = value => typeof value === 'string' && SEMVER_PATTERN.test(value);

const semverParts = value => {
  const match = typeof value === 'string' ? value.match(SEMVER_PATTERN) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/**
 * semver 三段数字比较，返回 left - right 的符号。
 * 任一输入非 semver 返回 null，调用方需要兜底处理。
 * @param {unknown} left
 * @param {unknown} right
 * @returns {number | null} 负 / 零 / 正；非法输入为 null
 */
const compareVersions = (left, right) => {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
};

/**
 * bridge tag 与本次发布之间的版本常量一致性。
 *
 * 这条比 `bridgeTagSupportsProtocol` 强：后者只探测四个文件路径是否还在，证明不了那个 tag 真的是
 * 「升级前的那一版」。声明了升级就必须严格更旧，没声明升级就必须完全相等——后半条同时挡住
 * 「悄悄抬了 schema 却把升级位写成 false」这种会绕开 `oldBundlePolicy` 的形态。
 *
 * @param {string} tag bridge tag
 * @param {{ systemSchemaVersion: number, changeCodecVersion: number } | null | undefined} bridgeConstants
 * @param {{ systemSchemaVersion: number, changeCodecVersion: number }} releaseConstants
 * @param {Record<string, unknown>} release 清单的 release 段
 * @returns {string[]}
 */
const collectVersionConstantErrors = (tag, bridgeConstants, releaseConstants, release) => {
  if (!bridgeConstants) {
    return [
      `bridge.tag ${tag} does not declare readable system version constants in ${SYSTEM_SCHEMA_VERSION_SOURCE} / ${CHANGE_CODEC_VERSION_SOURCE}`
    ];
  }
  const axes = [
    ['systemSchemaUpgrade', 'systemSchemaVersion', 'system schema'],
    ['changeCodecUpgrade', 'changeCodecVersion', 'change codec']
  ];
  const errors = [];
  for (const [flag, field, label] of axes) {
    const before = bridgeConstants[field];
    const after = releaseConstants[field];
    if (release[flag] === true && !(before < after)) {
      errors.push(
        `release.${flag} is true but ${label} version did not advance past bridge.tag ${tag} (${before} -> ${after})`
      );
    }
    if (release[flag] === false && before !== after) {
      errors.push(
        `release.${flag} is false but ${label} version changed from ${before} (bridge.tag ${tag}) to ${after}`
      );
    }
  }
  return errors;
};

/**
 * Validate the checked-in release manifest without making network calls.
 * @param {unknown} manifest
 * @param {{ bridgeTagExists?: (tag: string) => boolean, bridgeTagIsAncestor?: (tag: string) => boolean, bridgeTagSupportsProtocol?: (tag: string) => boolean, bridgeTagVersionConstants?: (tag: string) => ({ systemSchemaVersion: number, changeCodecVersion: number } | null), releaseVersionConstants?: ({ systemSchemaVersion: number, changeCodecVersion: number } | null), releaseTag?: string, packageVersion?: string }} [options]
 * @returns {string[]}
 */
export const validateManifest = (manifest, options = {}) => {
  const errors = [];
  if (!isRecord(manifest)) return ['manifest must be a JSON object'];
  if (manifest.$schemaVersion !== 1) errors.push('$schemaVersion must be 1');

  const release = manifest.release;
  if (!isRecord(release)) return ['release must be an object'];
  if (!RELEASE_KINDS.includes(release.kind)) {
    errors.push(`release.kind must be ${RELEASE_KINDS.slice(0, -1).join(', ')} or ${RELEASE_KINDS.at(-1)}`);
  }
  if (!isSemver(release.version)) errors.push('release.version must be a semver version');
  if (options.releaseTag && options.releaseTag !== `v${release.version}`) {
    errors.push(`release.version ${release.version} does not match tag ${options.releaseTag}`);
  }
  // 清单版本必须与发布产物同步推进；只改其一会让清单长期停在陈旧值而无人察觉。
  if (options.packageVersion && options.packageVersion !== release.version) {
    errors.push(
      `release.version ${release.version} does not match packages/rxdb/package.json version ${options.packageVersion}`
    );
  }
  if (!Number.isInteger(release.protocolVersion) || release.protocolVersion < 1) {
    errors.push('release.protocolVersion must be a positive integer');
  }
  if (typeof release.systemSchemaUpgrade !== 'boolean') errors.push('release.systemSchemaUpgrade must be boolean');
  if (typeof release.changeCodecUpgrade !== 'boolean') errors.push('release.changeCodecUpgrade must be boolean');

  const bridge = manifest.bridge;
  if (!isRecord(bridge)) {
    errors.push('bridge must be an object');
  } else if (release.kind === 'migration') {
    if (typeof bridge.tag !== 'string' || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(bridge.tag)) {
      errors.push('bridge.tag is required for migration releases');
    }
    if (!isSemver(bridge.version)) errors.push('bridge.version is required for migration releases');
    if (
      isSemver(release.version) &&
      isSemver(bridge.version) &&
      compareVersions(bridge.version, release.version) >= 0
    ) {
      errors.push('bridge.version must be older than release.version');
    }
    if (isSemver(bridge.version) && compareVersions(bridge.version, LAST_INELIGIBLE_BRIDGE_VERSION) <= 0) {
      errors.push(
        `bridge.version must be newer than ${LAST_INELIGIBLE_BRIDGE_VERSION}: anchors at or before it predate the working-tree bridging change`
      );
    }
    if (
      typeof bridge.tag === 'string' &&
      typeof bridge.version === 'string' &&
      bridge.tag.slice(1) !== bridge.version
    ) {
      errors.push('bridge.tag must match bridge.version');
    }
    if (typeof bridge.tag === 'string' && options.bridgeTagExists && !options.bridgeTagExists(bridge.tag)) {
      errors.push(`bridge.tag ${bridge.tag} does not exist in the repository`);
    }
    if (typeof bridge.tag === 'string' && options.bridgeTagIsAncestor && !options.bridgeTagIsAncestor(bridge.tag)) {
      errors.push(`bridge.tag ${bridge.tag} is not an ancestor of the release commit`);
    }
    if (
      typeof bridge.tag === 'string' &&
      options.bridgeTagSupportsProtocol &&
      !options.bridgeTagSupportsProtocol(bridge.tag)
    ) {
      errors.push(`bridge.tag ${bridge.tag} does not contain the system migration surface`);
    }
    if (typeof bridge.tag === 'string' && options.bridgeTagVersionConstants) {
      const releaseConstants = options.releaseVersionConstants;
      const bridgeConstants = options.bridgeTagVersionConstants(bridge.tag);
      errors.push(
        ...(releaseConstants ?
          collectVersionConstantErrors(bridge.tag, bridgeConstants, releaseConstants, release)
        : [
            `release does not declare readable system version constants in ${SYSTEM_SCHEMA_VERSION_SOURCE} / ${CHANGE_CODEC_VERSION_SOURCE}`
          ])
      );
    }
  } else if (release.kind === 'normal' && (bridge.tag !== null || bridge.version !== null)) {
    errors.push('normal releases must leave bridge.tag and bridge.version null');
  }

  const policy = manifest.oldBundlePolicy;
  if (!isRecord(policy)) {
    errors.push('oldBundlePolicy must be an object');
  } else if (release.kind === 'migration') {
    if (!SUPPORTED_OLD_BUNDLE_STRATEGIES.has(policy.strategy)) {
      errors.push(`oldBundlePolicy.strategy must be one of ${Array.from(SUPPORTED_OLD_BUNDLE_STRATEGIES).join(', ')}`);
    }
    if (!isSemver(policy.minimumVersion))
      errors.push('oldBundlePolicy.minimumVersion is required for migration releases');
    if (policy.enforced !== true) errors.push('oldBundlePolicy.enforced must be true for migration releases');
    if (
      isSemver(policy.minimumVersion) &&
      isSemver(bridge?.version) &&
      compareVersions(policy.minimumVersion, bridge.version) < 0
    ) {
      errors.push('oldBundlePolicy.minimumVersion must be at least bridge.version');
    }
  }

  if (NON_MIGRATION_KINDS.has(release.kind) && (release.systemSchemaUpgrade || release.changeCodecUpgrade)) {
    errors.push(`${release.kind} releases cannot upgrade system schema or change codec`);
  }
  if (release.kind === 'migration' && !release.systemSchemaUpgrade && !release.changeCodecUpgrade) {
    errors.push('migration releases must upgrade system schema or change codec');
  }

  return errors;
};

const gitTagExists = tag => {
  try {
    execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const gitTagIsAncestor = tag => {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', `${tag}^{commit}`, 'HEAD'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/**
 * 读取某个 tag 上的一份文件内容；tag 或文件不存在时返回 null。
 * @param {string} tag
 * @param {string} file 仓库相对路径
 * @returns {string | null}
 */
const gitFileAtTag = (tag, file) => {
  try {
    return execFileSync('git', ['show', `${tag}^{commit}:${file}`], { encoding: 'utf8' });
  } catch {
    return null;
  }
};

const gitTagVersionConstants = tag =>
  parseVersionConstants(
    gitFileAtTag(tag, SYSTEM_SCHEMA_VERSION_SOURCE),
    gitFileAtTag(tag, CHANGE_CODEC_VERSION_SOURCE)
  );

const gitTagSupportsProtocol = tag => {
  const requiredFiles = [
    'packages/rxdb/src/RxDB.ts',
    'packages/rxdb/src/rxdb-adapter.ts',
    'packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts',
    'packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts'
  ];
  return requiredFiles.every(file => {
    try {
      execFileSync('git', ['cat-file', '-e', `${tag}^{commit}:${file}`], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
};

/**
 * 解析本次校验要比对的发布 tag。
 *
 * 显式 `--release-tag=` 优先；没有传时**只在打 tag 的 workflow 里**回落到 `GITHUB_REF_NAME`。
 * 这道 `GITHUB_REF_TYPE` 判断是把本门禁挂进 PR CI 的前提：PR 事件下 `GITHUB_REF_NAME`
 * 是 `42/merge` 这类 refs/pull 名字，当成发布 tag 会让每个 PR 都红在
 * `release.version 0.0.25 does not match tag 42/merge` —— 一条与发布无关的假失败。
 * 分支 push（`GITHUB_REF_TYPE=branch`）同理。
 *
 * @param {string[]} args 命令行参数（不含 node 与脚本路径）
 * @param {Record<string, string | undefined>} env 进程环境变量
 * @returns {string | undefined} 要比对的 tag；无从判定时为 undefined（跳过 tag 比对）
 */
export const resolveReleaseTag = (args, env) => {
  const explicit = args.find(arg => arg.startsWith('--release-tag='))?.slice('--release-tag='.length);
  if (explicit) return explicit;
  return env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : undefined;
};

const loadManifest = async manifestPath => JSON.parse(await readFile(manifestPath, 'utf8'));

// 清单声明的版本必须与真正被发布的 `@aiao/rxdb` 版本一致。
const PACKAGE_JSON_PATH = fileURLToPath(new URL('../packages/rxdb/package.json', import.meta.url));
const loadPackageVersion = async () => JSON.parse(await readFile(PACKAGE_JSON_PATH, 'utf8')).version;

// 工作树（= 候选发布提交）上的系统版本常量；读不到时返回 null 交给纯函数报错，不静默跳过。
const readRepoFile = async file => {
  try {
    return await readFile(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
  } catch {
    return null;
  }
};
const loadReleaseVersionConstants = async () =>
  parseVersionConstants(
    await readRepoFile(SYSTEM_SCHEMA_VERSION_SOURCE),
    await readRepoFile(CHANGE_CODEC_VERSION_SOURCE)
  );

const run = async () => {
  const args = process.argv.slice(2);
  if (!args.includes('--check')) {
    throw new Error('Usage: node scripts/check-migration-release-gate.mjs --check [manifest-path]');
  }
  const manifestArgument = args.find(arg => !arg.startsWith('--'));
  const releaseTag = resolveReleaseTag(args, process.env);
  const manifestPath = path.resolve(manifestArgument ?? DEFAULT_MANIFEST_PATH);
  const manifest = await loadManifest(manifestPath);
  const errors = validateManifest(manifest, {
    bridgeTagExists: gitTagExists,
    bridgeTagIsAncestor: gitTagIsAncestor,
    bridgeTagSupportsProtocol: gitTagSupportsProtocol,
    bridgeTagVersionConstants: gitTagVersionConstants,
    releaseVersionConstants: await loadReleaseVersionConstants(),
    releaseTag,
    packageVersion: await loadPackageVersion()
  });
  if (errors.length > 0) {
    console.error(`Migration release gate blocked ${manifestPath}:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Migration release gate passed for ${manifest.release.kind} ${manifest.release.version}.`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
