// 一键发布 Aiao Desktop 到 Cloudflare Pages（D-16）：
//   pnpm nx run aiao-desktop:deploy [--dry-run] [--preview]
// Nx 先完成正式构建与密钥扫描；本脚本再检查产物、必要时新建 Pages 项目、上传，并把线上文件与本地产物逐个对账。
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deployConfig } from './config.mjs';
import { checkDist } from './dist-check.mjs';
import { checkLive, waitUntilReachable } from './live-check.mjs';

const USAGE = 'pnpm nx run aiao-desktop:deploy [--dry-run] [--preview]';

/**
 * 解析命令行：`--dry-run` 只检查产物不发布，`--preview` 发布到 Preview 分支而不是生产。
 *
 * @throws 出现未知参数——不忽略，免得拼错 `--preview` 时悄悄发到生产
 */
export function parseArgs(argv) {
  const options = { dryRun: false, preview: false };
  for (const argument of argv) {
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--preview') options.preview = true;
    else throw new Error(`未知参数 ${argument}。用法：${USAGE}`);
  }
  return options;
}

/**
 * wrangler 子进程的环境。本机直连 Cloudflare 的 IPv4 地址时 OAuth 刷新会超时（报未登录，令牌其实没坏），
 * 所以默认让 DNS 结果 IPv6 优先；环境里已有 `--dns-result-order` 时尊重它。
 */
export function wranglerEnv(env) {
  const options = env.NODE_OPTIONS ?? '';
  if (options.includes('--dns-result-order')) return { ...env };
  return { ...env, NODE_OPTIONS: `${options} --dns-result-order=ipv6first`.trim() };
}

/** 新建经典 Pages 项目。wrangler 4.158 不带 `--force` 会转给 Workers 版 Pages 并失败；项目建好后不再需要它。 */
export function createProjectArgs({ projectName, productionBranch }) {
  return ['pages', 'project', 'create', projectName, '--production-branch', productionBranch, '--force'];
}

/**
 * 上传产物。分支必须显式给：省略时 wrangler 取当前 Git 分支，只会更新 Preview。
 * 提交哈希与说明由 wrangler 从工作目录的 Git 读取；脏标记显式给出，工作区有未提交改动时 wrangler 不再警告，
 * 部署记录里的「未提交」也和实际一致。
 */
export function deployArgs({ distDir, projectName, branch, dirty }) {
  return ['pages', 'deploy', distDir, '--project-name', projectName, '--branch', branch, `--commit-dirty=${dirty}`];
}

function parseJsonArray(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new Error(`无法解析 wrangler 的${label}：${text.slice(0, 200)}`, { cause });
  }
  if (!Array.isArray(value)) throw new Error(`wrangler 的${label}不是数组：${text.slice(0, 200)}`);
  return value;
}

const isText = value => typeof value === 'string';

/** 解析 `wrangler pages project list --json`。 */
export function parseProjects(text) {
  return parseJsonArray(text, '项目列表').map(entry => {
    if (!isText(entry['Project Name']) || !isText(entry['Project Domains'])) {
      throw new Error(`wrangler 的项目列表格式不对：${JSON.stringify(entry)}`);
    }
    const domains = entry['Project Domains'].split(',').map(domain => domain.trim());
    return { name: entry['Project Name'], domains: domains.filter(Boolean) };
  });
}

/** 解析 `wrangler pages deployment list --json`，最新的在前。 */
export function parseDeployments(text) {
  return parseJsonArray(text, '部署列表').map(entry => {
    const fields = [entry.Id, entry.Environment, entry.Branch, entry.Source, entry.Deployment];
    if (!fields.every(isText)) throw new Error(`wrangler 的部署列表格式不对：${JSON.stringify(entry)}`);
    return {
      id: entry.Id,
      environment: entry.Environment,
      branch: entry.Branch,
      source: entry.Source,
      url: entry.Deployment
    };
  });
}

/**
 * 从 `WRANGLER_OUTPUT_FILE_PATH` 的结构化输出里取本次部署的地址与编号。
 *
 * @throws 没有 `pages-deploy-detailed` 记录——不去解析人读的日志，升级 wrangler 后格式变了要明确报出
 */
export function parseDeployOutput(text) {
  const records = text
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line));
  const detail = records.find(record => record.type === 'pages-deploy-detailed');
  if (!detail || !isText(detail.url) || !isText(detail.deployment_id)) {
    throw new Error(
      'wrangler 的结构化输出里没有可用的 pages-deploy-detailed 记录，无法确定本次部署的地址；核对 wrangler 版本'
    );
  }
  return { deploymentId: detail.deployment_id, url: detail.url, environment: detail.environment };
}

/** 部署地址 `https://<编号>.<项目>.pages.dev` 去掉编号，就是项目的 pages.dev 域名（重名时 Cloudflare 会给它加后缀，不能自己拼）。 */
const projectDomain = deploymentUrl => new URL(deploymentUrl).hostname.split('.').slice(1).join('.');

/**
 * 发布后要核对哪些地址。部署地址是本次上传独有的，逐文件对账；别名与自定义域名只核对入口页
 * （入口页引用带哈希的脚本文件名，指向旧部署时一定不一致），免得在慢网络上把同样的 13 MB 下载好几遍。
 *
 * @param options.deploymentUrl wrangler 给出的本次部署地址 `https://<编号>.<项目>.pages.dev`
 * @param options.customDomains 项目绑定的自定义域名（只对生产分支有意义）
 */
export function liveTargets({ deploymentUrl, customDomains, branch, productionBranch }) {
  const pagesDomain = projectDomain(deploymentUrl);
  const targets = [{ label: '部署地址', url: deploymentUrl, full: true }];
  if (branch !== productionBranch) {
    return [...targets, { label: 'Preview 别名', url: `https://${branch}.${pagesDomain}`, full: false }];
  }
  const custom = customDomains.map(domain => ({ label: '自定义域名', url: `https://${domain}`, full: false }));
  return [...targets, { label: '生产地址', url: `https://${pagesDomain}`, full: false }, ...custom];
}

const formatBytes = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** 先等地址连得上；一直连不上就记成该地址的一条失败（路径记为「(连接)」），不再逐文件请求。 */
async function reachable(target, deps) {
  const onWait = reason => {
    deps.log(`… ${target.url} 暂时连不上（${reason}）。新建项目的子域名证书要几分钟才签发，等它就绪`);
  };
  try {
    await deps.waitReachable({ baseUrl: target.url, onWait });
    return undefined;
  } catch (error) {
    return { path: '(连接)', reason: error.message };
  }
}

async function verifyTargets(targets, files, deps) {
  const failures = [];
  const entry = files.filter(file => file.path === 'index.html');
  for (const target of targets) {
    const unreachable = await reachable(target, deps);
    const result =
      unreachable ?
        { checked: 0, failures: [unreachable] }
      : await deps.checkLive({ baseUrl: target.url, files: target.full ? files : entry });
    if (result.failures.length === 0) {
      deps.log(`✅ 线上对账 ${target.label} ${target.url}：${result.checked} 个文件与构建产物一致，均带跨源隔离响应头`);
      continue;
    }
    deps.log(`❌ 线上对账 ${target.label} ${target.url}：`);
    for (const failure of result.failures) deps.log(`   - ${failure.path}：${failure.reason}`);
    failures.push(...result.failures.map(failure => ({ ...failure, url: target.url })));
  }
  return failures;
}

function summarize({ deps, deployed, branch, previous, source, failures }) {
  const { log, config } = deps;
  log('');
  log(failures.length === 0 ? '🎉 发布完成' : '❌ 已上传，但线上核对没有通过（上面列出了原因）');
  log(`   部署：${deployed.url}（${deployed.deploymentId}）`);
  if (branch === config.productionBranch) log(`   生产：https://${projectDomain(deployed.url)}`);
  log(`   源提交：${source.hash}${source.dirty ? '（含未提交改动）' : ''}`);
  if (previous) {
    log(
      `   回滚点：${previous.id}（源 ${previous.source || '未知'}）——Pages 面板 → ${config.projectName} → Deployments → 该部署 → Rollback to this deployment`
    );
  }
}

/** 项目不存在就新建；已存在时（生产发布）读出当前的生产部署，作为回滚点。 */
async function prepareProject(config, production, deps) {
  const listed = parseProjects(await deps.wrangler(['pages', 'project', 'list', '--json']));
  const existing = listed.find(project => project.name === config.projectName);
  if (!existing) {
    deps.log(`… 新建 Pages 项目 ${config.projectName}`);
    await deps.wrangler(createProjectArgs(config));
    return { existing, previous: undefined };
  }
  if (!production) return { existing, previous: undefined };
  const args = [
    'pages',
    'deployment',
    'list',
    '--project-name',
    config.projectName,
    '--environment',
    'production',
    '--json'
  ];
  const previous = parseDeployments(await deps.wrangler(args))[0];
  deps.log(previous ? `… 上一版生产部署 ${previous.id}（源 ${previous.source || '未知'}）` : '… 项目还没有生产部署');
  return { existing, previous };
}

/**
 * 发布流程：产物检查 → 项目就绪 → 上传 → 线上对账。任何一步失败都立刻停下，不降级、不重试上传。
 *
 * @param options `parseArgs` 的结果
 * @param deps 外部依赖（wrangler、产物检查、线上对账、Git、日志），测试用替身
 * @returns `ok` 表示全部通过；`previousDeploymentId` 是发布前的生产部署，用于回滚
 */
export async function runDeploy(options, deps) {
  const { config, log } = deps;
  const branch = options.preview ? config.previewBranch : config.productionBranch;
  const production = branch === config.productionBranch;
  log(`🚀 发布 ${config.projectName} 到 Cloudflare Pages（${production ? '生产' : 'Preview'}，分支 ${branch}）`);

  const { files, problems } = await deps.checkDist();
  if (problems.length > 0) {
    for (const problem of problems) log(`❌ ${problem}`);
    return { ok: false };
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  log(`✅ 产物检查：${files.length} 个文件，${formatBytes(total)}，跨源隔离响应头齐全`);

  const source = deps.git();
  const args = deployArgs({ ...config, branch, dirty: source.dirty });
  if (options.dryRun) {
    log(`🧪 dry-run：不新建项目、不上传。将执行：wrangler ${args.join(' ')}`);
    return { ok: true, dryRun: true };
  }

  const { existing, previous } = await prepareProject(config, production, deps);

  const deployed = parseDeployOutput(await deps.wranglerDeploy(args));
  log(`✅ 已上传：${deployed.url}`);
  const expected = production ? 'production' : 'preview';
  if (deployed.environment !== expected) {
    log(
      `❌ 这次部署落在 ${deployed.environment} 环境，期望 ${expected}：到 Pages 面板核对项目设置里的 Production branch 是不是 ${branch}`
    );
    return { ok: false, deploymentId: deployed.deploymentId };
  }

  const customDomains = (existing?.domains ?? []).filter(domain => !domain.endsWith('.pages.dev'));
  const targets = liveTargets({
    deploymentUrl: deployed.url,
    customDomains,
    branch,
    productionBranch: config.productionBranch
  });
  const failures = await verifyTargets(targets, files, deps);
  summarize({ deps, deployed, branch, previous, source, failures });
  return {
    ok: failures.length === 0,
    deploymentId: deployed.deploymentId,
    previousDeploymentId: previous?.id,
    failures
  };
}

/** 经 `pnpm dlx` 跑固定版本的 wrangler；`capture` 时返回 stdout（stderr 仍原样显示），否则整个输出原样显示。 */
function runWrangler(config, args, { capture, env = {} }) {
  return new Promise((resolve, reject) => {
    // silent 只去掉 pnpm 自己的「Done in」行；dlx 解析失败等错误仍会显示
    const child = spawn('pnpm', ['--reporter=silent', 'dlx', `wrangler@${config.wranglerVersion}`, ...args], {
      cwd: config.workDir,
      env: { ...wranglerEnv(process.env), ...env },
      stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit']
    });
    let stdout = '';
    child.stdout?.on('data', chunk => (stdout += chunk));
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) return resolve(stdout);
      const login = `；若提示未登录，先执行 pnpm dlx wrangler@${config.wranglerVersion} login`;
      reject(new Error(`wrangler ${args.slice(0, 3).join(' ')} 失败（退出码 ${code}）${login}`));
    });
  });
}

/** 上传，并通过 `WRANGLER_OUTPUT_FILE_PATH` 取回结构化的部署记录。 */
async function wranglerDeploy(config, args) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aiao-desktop-deploy-'));
  try {
    const outputFile = path.join(directory, 'wrangler-output.ndjson');
    await runWrangler(config, args, { capture: false, env: { WRANGLER_OUTPUT_FILE_PATH: outputFile } });
    return await readFile(outputFile, 'utf8');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function readGitState(config) {
  const git = args => execFileSync('git', args, { cwd: config.workDir, encoding: 'utf8' }).trim();
  return { hash: git(['rev-parse', '--short', 'HEAD']), dirty: git(['status', '--porcelain']) !== '' };
}

function createDeps(config) {
  return {
    config,
    checkDist: () => checkDist({ distDir: config.distDir, requiredHeaders: config.requiredHeaders }),
    wrangler: args => runWrangler(config, args, { capture: true }),
    wranglerDeploy: args => wranglerDeploy(config, args),
    waitReachable: options => waitUntilReachable(options),
    checkLive: ({ baseUrl, files }) =>
      checkLive({ distDir: config.distDir, files, baseUrl, requiredHeaders: config.requiredHeaders }),
    git: () => readGitState(config),
    log: message => console.log(message)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await runDeploy(parseArgs(process.argv.slice(2)), createDeps(deployConfig));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(`❌ ${error.message}`);
    if (error.cause) console.error(`   原因：${error.cause.message ?? error.cause}`);
    process.exitCode = 1;
  }
}
