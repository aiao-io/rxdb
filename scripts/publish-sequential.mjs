/**
 * 顺序发布 `packages/*`：按依赖拓扑序逐个 `pnpm publish`，把 stdin/stdout 留给 npm 12 的网页 2FA。
 *
 * 为什么需要它：`nx release publish` 非交互地跑 `pnpm publish`，遇到开启 2FA 的账号
 * 会退回「Open this URL」的网页验证，而那个流程拿不到交互终端，直接失败（EOTP）。
 * 本脚本用 `spawnSync(..., { stdio: 'inherit' })` 逐个发布，第一个包触发网页验证时，
 * 你在浏览器里认证并勾「5 分钟内不再验证」，之后 5 分钟内的其余包都不再要 2FA。
 *
 * 与 `nx release publish` 的差异：
 *   - 顺序（依赖先于依赖者），不是并行；
 *   - 发布前用 `linkReleasePeers` 给 `dist/packages/*`（Angular 系）补 `@aiao/*` 兄弟链接，
 *     否则 `pnpm publish` 改写在 dist 根里的 `workspace:^` 会抛 `ERR_PNPM_CANNOT_RESOLVE_WORKSPACE_PROTOCOL`；
 *   - 已发布的版本自动跳过（并行预检一次 registry），中途失败后重跑即可续上（幂等）。
 *
 * @example
 * ```bash
 * pnpm publish:sequential                         # 正式发布到 npmjs
 * pnpm publish:sequential --dry-run               # 只列出将要发布/跳过的包，不发
 * pnpm publish:sequential --otp=123456            # 认证器 App 的 6 位码（30 秒过期，不推荐批量用）
 * pnpm publish:sequential --registry=http://localhost:4873
 * ```
 */

import { execFile, spawnSync } from 'node:child_process';
import { resolve, relative, join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { dependencyEdges, scanPackages } from './audit/lib/package-discovery.mjs';
import { linkReleasePeers, resolvePackageRoot } from './audit/link-release-peers.mjs';

const execFileAsync = promisify(execFile);

/**
 * 解析命令行参数。未知参数抛错，不静默忽略。
 *
 * @param {string[]} argv 例如 `process.argv.slice(2)`
 * @returns {{ registry: string, access?: string, tag?: string, otp?: string, dryRun: boolean, help: boolean }}
 */
export function parseArgs(argv) {
  const options = {
    registry: 'https://registry.npmjs.org',
    access: undefined,
    tag: undefined,
    otp: undefined,
    dryRun: false,
    help: false
  };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--registry=')) options.registry = arg.slice('--registry='.length);
    else if (arg.startsWith('--access=')) options.access = arg.slice('--access='.length);
    else if (arg.startsWith('--tag=')) options.tag = arg.slice('--tag='.length);
    else if (arg.startsWith('--otp=')) options.otp = arg.slice('--otp='.length);
    else throw new Error(`未知参数：${arg}`);
  }
  return options;
}

/**
 * 依赖拓扑排序：`@aiao/*` 依赖先于依赖者。确定性：同层按包名升序。
 *
 * @param {Array<{ name: string, manifest: object }>} packages `scanPackages` 的包记录
 * @returns {Array<{ name: string, manifest: object }>} 依赖在前、被依赖在后的顺序
 */
export function topologicalOrder(packages) {
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]));
  const visited = new Set();
  const order = [];
  const visit = name => {
    if (visited.has(name)) return;
    visited.add(name);
    const record = byName.get(name);
    if (!record) return;
    for (const edge of dependencyEdges(record)) {
      if (byName.has(edge.name)) visit(edge.name);
    }
    order.push(name);
  };
  for (const name of [...byName.keys()].sort()) visit(name);
  return order.map(name => byName.get(name));
}

/**
 * 并行探测哪些包已在 registry 上发布（幂等续跑用）。查询失败一律视为「未发布」。
 *
 * @param {Array<{ name: string, manifest: object }>} packages
 * @param {string} registry
 * @returns {Promise<Set<string>>} 已发布的包名集合
 */
async function publishedSet(packages, registry) {
  const checks = await Promise.all(
    packages.map(async pkg => {
      const { name } = pkg;
      const { version } = pkg.manifest;
      try {
        const { stdout } = await execFileAsync(
          'npm',
          ['view', `${name}@${version}`, 'version', '--registry', registry],
          { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
        );
        return stdout.trim() === version ? name : null;
      } catch {
        return null;
      }
    })
  );
  return new Set(checks.filter(Boolean));
}

const USAGE = `用法：pnpm publish:sequential [--dry-run] [--registry=<url>] [--access=public|restricted] [--tag=<tag>] [--otp=<码>]

按依赖拓扑序顺序发布 packages/*（交互式网页 2FA 可用）。
  --dry-run            只列出将要发布/跳过的包，不真正发布
  --registry=<url>     发布目标 registry（默认 https://registry.npmjs.org）
  --access=public      覆盖发布访问级别（默认取各包 publishConfig）
  --tag=<tag>          分发标签（默认 latest）
  --otp=<码>           认证器 App 的 6 位码（30 秒过期，批量发布建议走网页验证勾「5 分钟」）`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const workspaceRoot = process.cwd();
  const packages = scanPackages(join(workspaceRoot, 'packages'));
  const order = topologicalOrder(packages);
  const published = await publishedSet(order, options.registry);

  let count = 0;
  let skipped = 0;

  for (const record of order) {
    const { name, version } = record.manifest;
    const directory = relative(workspaceRoot, record.directory);

    if (published.has(name)) {
      console.log(`⏭️  跳过（已发布）${name}@${version}`);
      skipped++;
      continue;
    }

    // Angular 系从 dist/packages/* 发布，先补 @aiao/* 兄弟链接，否则 workspace:^ 改写会失败。幂等。
    linkReleasePeers(workspaceRoot, directory);

    const root = resolve(workspaceRoot, resolvePackageRoot(workspaceRoot, directory));
    if (options.dryRun) {
      console.log(`🟡 将发布 ${name}@${version}（${relative(workspaceRoot, root)}）`);
      count++;
      continue;
    }

    console.log(`▶  发布 ${name}@${version}（${relative(workspaceRoot, root)}）`);
    const args = ['publish', '--registry', options.registry, '--no-git-checks'];
    if (options.access) args.push('--access', options.access);
    if (options.tag) args.push('--tag', options.tag);
    if (options.otp) args.push('--otp', options.otp);

    const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`\n❌ ${name}@${version} 发布失败（exit ${result.status}）。`);
      console.error('已发布的包不会重发，下次重跑会自动跳过、从失败处继续。');
      process.exitCode = 1;
      return;
    }
    count++;
  }

  console.log(`\n完成：发布 ${count}，跳过 ${skipped}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
