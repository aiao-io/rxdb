import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanPackages } from './audit/lib/package-discovery.mjs';
import { resolvePackageRoot } from './audit/link-release-peers.mjs';

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

function digestDirectory(root) {
  if (!existsSync(root)) return `missing:${root}`;
  const digest = createHash('sha256');
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      const relativePath = relative(root, path);
      digest.update(`${relativePath}\0`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isSymbolicLink()) digest.update(`link:${readlinkSync(path)}`);
      else digest.update(readFileSync(path));
    }
  };
  visit(root);
  return digest.digest('hex');
}

export function collectArtifactDigest(cwd = process.cwd()) {
  const digest = createHash('sha256');
  const packages = scanPackages(join(cwd, 'packages'));
  for (const record of packages) {
    const directory = relative(cwd, record.directory);
    const packageRoot = resolve(cwd, resolvePackageRoot(cwd, directory));
    const artifactRoot = packageRoot === resolve(cwd, directory) ? join(packageRoot, 'dist') : packageRoot;
    if (!existsSync(join(packageRoot, 'package.json')) || !existsSync(artifactRoot)) {
      throw new Error(`发布产物缺失：${relative(cwd, artifactRoot)}`);
    }
    digest.update(
      `${record.name}\0${sha256(readFileSync(join(packageRoot, 'package.json')))}\0${digestDirectory(artifactRoot)}\n`
    );
  }
  return digest.digest('hex');
}

export function collectSnapshot(cwd = process.cwd(), { includeArtifacts = true } = {}) {
  const snapshot = {
    head: runGit(cwd, ['rev-parse', 'HEAD']),
    status: runGit(cwd, ['status', '--porcelain=v1']),
    migrationManifestDigest: sha256(readFileSync(join(cwd, RELEASE_MANIFEST))),
    packageVersion: readJson(join(cwd, RXDB_PACKAGE)).version,
    releaseProjectsDigest: sha256(readFileSync(join(cwd, RELEASE_PROJECTS)))
  };
  if (includeArtifacts) snapshot.artifactDigest = collectArtifactDigest(cwd);
  return snapshot;
}

export function assertCleanSnapshot(snapshot) {
  if (snapshot.status) {
    throw new Error('发布前工作区必须干净；请先提交或清理以下改动：\n' + snapshot.status);
  }
}

export function assertStableInputs(before, after) {
  const fields = [
    ['head', '提交'],
    ['status', '工作区'],
    ['migrationManifestDigest', '迁移清单'],
    ['packageVersion', 'RxDB 版本'],
    ['releaseProjectsDigest', '发布项目配置'],
    ['artifactDigest', '发布产物']
  ];
  const changed = fields
    .filter(([field]) => field in before && field in after && before[field] !== after[field])
    .map(([, label]) => label);
  if (changed.length > 0) {
    throw new Error(`发布校验期间发生变化：${changed.join('、')}；请重新运行发布前置校验`);
  }
}

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

export function normalizeRegistryArgs(args) {
  const registryArgs = args.filter(argument => argument.startsWith('--registry='));
  if (registryArgs.length < 2) return args;
  const lastRegistry = registryArgs.at(-1);
  return [...args.filter(argument => !argument.startsWith('--registry=')), lastRegistry];
}

export function normalizeDryRunArgs(command) {
  if (command.includes('--dry-run')) return command;
  const publishes = command.some(argument => argument === 'publish' || /(?:^|[/\\])publish[^/\\]*$/.test(argument));
  return publishes ? [...command, '--dry-run'] : command;
}

const CHECKS = [
  [
    'pnpm',
    ['nx', 'run-many', '-t', 'build', '--projects=packages/*', '--skipNxCache', '--output-style=static', '--parallel=4', '--nxBail'],
    '全量包构建'
  ],
  ['pnpm', ['test-packages'], '全量包校验'],
  ['pnpm', ['nx', 'run', '@aiao/source:migration-release-gate'], '迁移发布清单'],
  ['pnpm', ['nx', 'run', '@aiao/source:audit-package-graph'], '包组合清单']
];

function defaultRunner(command, args, cwd) {
  return spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

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

  const after = snapshot(cwd, { includeArtifacts: false });
  assertStableInputs(before, after);
  const validated = snapshot(cwd);
  assertStableInputs(after, validated);
  return validated;
}

const USAGE = `用法：
  pnpm run release:preflight
  node scripts/release-preflight.mjs -- pnpm exec nx release publish --registry=<url>

无命令时只执行发布前置；传入 -- 后会在校验通过后执行发布命令。
发布入口可用 pnpm run publish -- --registry=<url> 覆盖默认 registry。
--dry-run 跳过发布前置，并强制发布命令使用 dry-run。`;

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (options.command.length === 0) {
    runPreflight();
    console.log('发布前置校验通过；当前提交、清单、产物和工作树在校验期间保持一致。');
    return;
  }
  if (!options.dryRun) {
    const validated = runPreflight();
    assertStableInputs(validated, collectSnapshot());
  } else {
    console.log('dry-run：跳过发布前置，不写入 registry。');
  }

  const [command, ...args] = options.dryRun ? normalizeDryRunArgs(options.command) : options.command;
  const commandArgs = args;
  const result = defaultRunner(command, normalizeRegistryArgs(commandArgs), process.cwd());
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
