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
 * Validate the checked-in release manifest without making network calls.
 * @param {unknown} manifest
 * @param {{ bridgeTagExists?: (tag: string) => boolean, bridgeTagIsAncestor?: (tag: string) => boolean, bridgeTagSupportsProtocol?: (tag: string) => boolean, releaseTag?: string, packageVersion?: string }} [options]
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

const loadManifest = async manifestPath => JSON.parse(await readFile(manifestPath, 'utf8'));

// 清单声明的版本必须与真正被发布的 `@aiao/rxdb` 版本一致。
const PACKAGE_JSON_PATH = fileURLToPath(new URL('../packages/rxdb/package.json', import.meta.url));
const loadPackageVersion = async () => JSON.parse(await readFile(PACKAGE_JSON_PATH, 'utf8')).version;

const run = async () => {
  const args = process.argv.slice(2);
  if (!args.includes('--check')) {
    throw new Error('Usage: node scripts/check-migration-release-gate.mjs --check [manifest-path]');
  }
  const manifestArgument = args.find(arg => !arg.startsWith('--'));
  const releaseTagArgument = args.find(arg => arg.startsWith('--release-tag='));
  const releaseTag = releaseTagArgument?.slice('--release-tag='.length) || process.env.GITHUB_REF_NAME;
  const manifestPath = path.resolve(manifestArgument ?? DEFAULT_MANIFEST_PATH);
  const manifest = await loadManifest(manifestPath);
  const errors = validateManifest(manifest, {
    bridgeTagExists: gitTagExists,
    bridgeTagIsAncestor: gitTagIsAncestor,
    bridgeTagSupportsProtocol: gitTagSupportsProtocol,
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
