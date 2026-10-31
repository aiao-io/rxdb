/**
 * 手工发布前置校验（US-603）。
 *
 * 发布入口只接受当前干净工作树的校验结果，并在同一进程里继续发布。
 * 不接收外部 tarball；真实发布没有跳过校验的参数。
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RELEASE_MANIFEST = 'requirements/migration-release.json';
const RXDB_PACKAGE = 'packages/rxdb/package.json';
const RELEASE_PROJECTS = 'nx.json';

const sha256 = value => createHash('sha256').update(value).digest('hex');

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失败：${(result.stderr ?? '').trim()}`);
  }
  return result.stdout.trim();
}

/**
 * 读取发布前后需要保持一致的工作树快照。
 *
 * @param {string} cwd 工作区根目录
 */
export function collectSnapshot(cwd = process.cwd()) {
  const manifestPath = join(cwd, RELEASE_MANIFEST);
  const packagePath = join(cwd, RXDB_PACKAGE);
  return {
    head: runGit(cwd, ['rev-parse', 'HEAD']),
    status: runGit(cwd, ['status', '--porcelain=v1']),
    migrationManifestDigest: sha256(readFileSync(manifestPath)),
    packageVersion: readJson(packagePath).version,
    releaseProjectsDigest: sha256(readFileSync(join(cwd, RELEASE_PROJECTS)))
  };
}

/** 拒绝带有已跟踪或未跟踪改动的发布工作树。 */
export function assertCleanSnapshot(snapshot) {
  if (snapshot.status) {
    throw new Error('发布前工作区必须干净；请先提交或清理以下改动：\n' + snapshot.status);
  }
}

/** 确认门禁运行前后的发布输入完全一致。 */
export function assertStableInputs(before, after) {
  const fields = [
    ['head', '提交'],
    ['status', '工作区'],
    ['migrationManifestDigest', '迁移清单'],
    ['packageVersion', 'RxDB 版本'],
    ['releaseProjectsDigest', '发布项目配置']
  ];
  const changed = fields.filter(([field]) => before[field] !== after[field]).map(([, label]) => label);
  if (changed.length > 0) {
    throw new Error(`发布校验期间发生变化：${changed.join('、')}；请重新运行发布前置校验`);
  }
}

/** 解析前置参数，并把 `--` 后的发布命令原样保留。 */
export function parseArgs(argv) {
  const separator = argv.indexOf('--');
  const ownArgs = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  const options = { help: false, dryRun: false, command };
  for (const argument of ownArgs) {
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else throw new Error(`未知参数：${argument}`);
  }
  if (command.includes('--dry-run')) options.dryRun = true;
  return options;
}

/** 让命令行最后一个 registry 参数覆盖入口中的默认值。 */
export function normalizeRegistryArgs(args) {
  const registryArgs = args.filter(argument => argument.startsWith('--registry='));
  if (registryArgs.length < 2) return args;
  const lastRegistry = registryArgs.at(-1);
  return [...args.filter(argument => !argument.startsWith('--registry=')), lastRegistry];
}

const CHECKS = [
  ['pnpm', ['test-all'], '全量校验'],
  ['pnpm', ['nx', 'run', '@aiao/source:migration-release-gate'], '迁移发布清单'],
  ['pnpm', ['nx', 'run', '@aiao/source:audit-package-graph'], '包组合清单']
];

function defaultRunner(command, args, cwd) {
  return spawnSync(command, args, { cwd, stdio: 'inherit' });
}

/**
 * 在当前干净提交上执行所有发布前置，并确认校验期间输入没有变化。
 *
 * @param {{ cwd?: string, runCommand?: Function, snapshot?: Function }} options
 */
export function runPreflight({ cwd = process.cwd(), runCommand = defaultRunner, snapshot = collectSnapshot } = {}) {
  const before = snapshot(cwd, { includeArtifacts: false });
  assertCleanSnapshot(before);

  for (const [command, args, label] of CHECKS) {
    const result = runCommand(command, args, cwd);
    if (!result || result.error || result.status === null) {
      throw new Error(`${label}无法启动，已停止发布`);
    }
    const status = result.status ?? result.code ?? 0;
    if (status !== 0) throw new Error(`${label}失败（exit ${status}），已停止发布`);
  }

  const after = snapshot(cwd);
  assertStableInputs(before, after);
  return after;
}

const USAGE = `用法：
  pnpm run release:preflight
  node scripts/release-preflight.mjs -- pnpm exec nx release publish --registry=<url>

无命令时只执行发布前置；传入 -- 后会在校验通过后执行发布命令。
发布入口可用 pnpm run publish -- --registry=<url> 覆盖默认 registry。
--dry-run 只执行传入命令，不运行发布前置。`;

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (options.command.length === 0) {
    runPreflight();
    console.log('发布前置校验通过；当前提交、清单和工作树在校验期间保持一致。');
    return;
  }
  if (!options.dryRun) runPreflight();
  else console.log('dry-run：跳过发布前置，不写入 registry。');

  const [command, ...args] = options.command;
  const result = defaultRunner(command, normalizeRegistryArgs(args), process.cwd());
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
