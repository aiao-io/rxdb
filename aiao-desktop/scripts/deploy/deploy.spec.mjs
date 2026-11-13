import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createProjectArgs,
  deployArgs,
  liveTargets,
  parseArgs,
  parseDeployOutput,
  parseDeployments,
  parseProjects,
  runDeploy,
  wranglerEnv
} from './deploy.mjs';

const CONFIG = {
  projectName: 'aiao-desktop',
  productionBranch: 'main',
  previewBranch: 'preview',
  distDir: '/repo/dist/aiao-desktop/apps/web/browser',
  requiredHeaders: { 'Cross-Origin-Opener-Policy': 'same-origin' }
};
const FILES = [
  { path: 'index.html', size: 10 },
  { path: 'main.js', size: 20 }
];
/** wrangler 的结构化输出（WRANGLER_OUTPUT_FILE_PATH）；environment 是 Cloudflare 判定的部署环境。 */
const deployOutput = environment =>
  [
    '{"type":"wrangler-session","version":1}',
    '{"type":"pages-deploy","version":1,"pages_project":"aiao-desktop","deployment_id":"abc12345-0000-4000-8000-000000000000","url":"https://abc12345.aiao-desktop.pages.dev"}',
    `{"type":"pages-deploy-detailed","version":1,"pages_project":"aiao-desktop","deployment_id":"abc12345-0000-4000-8000-000000000000","url":"https://abc12345.aiao-desktop.pages.dev","environment":"${environment}","production_branch":"main"}`
  ].join('\n');
const DEPLOY_OUTPUT = deployOutput('production');

const project = (name, domains) => ({ 'Project Name': name, 'Project Domains': domains });
const deployment = (id, environment = 'Production') => ({
  Id: id,
  Environment: environment,
  Branch: 'main',
  Source: 'f00dbab',
  Deployment: `https://${id.slice(0, 8)}.aiao-desktop.pages.dev`
});

/** 记录所有调用的假依赖；projects / deployments 是 wrangler 的 JSON 应答。 */
function fakeDeps({
  projects = [],
  deployments = [],
  problems = [],
  failures = [],
  unreachable = [],
  environment
} = {}) {
  const calls = { wrangler: [], deploy: [], reachable: [], live: [], log: [] };
  const deps = {
    config: CONFIG,
    checkDist: async () => ({ files: FILES, problems }),
    wrangler: async args => {
      calls.wrangler.push(args);
      if (args.includes('project') && args.includes('list')) return JSON.stringify(projects);
      if (args.includes('deployment') && args.includes('list')) return JSON.stringify(deployments);
      return '';
    },
    wranglerDeploy: async args => {
      calls.deploy.push(args);
      const onProduction = args[args.indexOf('--branch') + 1] === CONFIG.productionBranch;
      return deployOutput(environment ?? (onProduction ? 'production' : 'preview'));
    },
    waitReachable: async ({ baseUrl, onWait }) => {
      calls.reachable.push(baseUrl);
      if (!unreachable.includes(baseUrl)) return;
      onWait('ERR_SSL_TLS_ALERT_HANDSHAKE_FAILURE');
      throw new Error(`${baseUrl} 在 180 秒内一直连不上：ERR_SSL_TLS_ALERT_HANDSHAKE_FAILURE`);
    },
    checkLive: async ({ baseUrl, files }) => {
      calls.live.push({ baseUrl, files: files.map(file => file.path) });
      return { checked: files.length, failures: baseUrl.includes('desktop.aiao.io') ? failures : [] };
    },
    git: () => ({ hash: 'f00dbab', dirty: true }),
    log: message => calls.log.push(message)
  };
  return { deps, calls };
}

test('parseArgs：默认发布到生产；识别 --dry-run 与 --preview；未知参数直接报错', () => {
  assert.deepEqual(parseArgs([]), { dryRun: false, preview: false });
  assert.deepEqual(parseArgs(['--dry-run', '--preview']), { dryRun: true, preview: true });
  assert.throws(() => parseArgs(['--prod']), /未知参数 --prod/);
  assert.throws(() => parseArgs(['main']), /未知参数 main/);
});

test('wranglerEnv：补上 IPv6 优先的 DNS 顺序，已有设置时保持原样', () => {
  assert.equal(wranglerEnv({}).NODE_OPTIONS, '--dns-result-order=ipv6first');
  assert.equal(
    wranglerEnv({ NODE_OPTIONS: '--max-old-space-size=4096' }).NODE_OPTIONS,
    '--max-old-space-size=4096 --dns-result-order=ipv6first'
  );
  assert.equal(
    wranglerEnv({ NODE_OPTIONS: '--dns-result-order=verbatim' }).NODE_OPTIONS,
    '--dns-result-order=verbatim'
  );
});

test('命令参数：新建项目要带 --force（只此一次），发布要显式指定分支', () => {
  assert.deepEqual(createProjectArgs(CONFIG), [
    'pages',
    'project',
    'create',
    'aiao-desktop',
    '--production-branch',
    'main',
    '--force'
  ]);
  assert.deepEqual(deployArgs({ ...CONFIG, branch: 'main', dirty: true }), [
    'pages',
    'deploy',
    CONFIG.distDir,
    '--project-name',
    'aiao-desktop',
    '--branch',
    'main',
    '--commit-dirty=true'
  ]);
  assert.equal(deployArgs({ ...CONFIG, branch: 'main', dirty: false }).at(-1), '--commit-dirty=false');
});

test('parseDeployOutput 取 pages-deploy-detailed 记录；没有这条记录就报错', () => {
  assert.deepEqual(parseDeployOutput(DEPLOY_OUTPUT), {
    deploymentId: 'abc12345-0000-4000-8000-000000000000',
    url: 'https://abc12345.aiao-desktop.pages.dev',
    environment: 'production'
  });
  assert.throws(() => parseDeployOutput('{"type":"wrangler-session","version":1}\n'), /pages-deploy-detailed/);
  assert.throws(() => parseDeployOutput(''), /pages-deploy-detailed/);
});

test('parseProjects 与 parseDeployments 校验 wrangler 的 JSON 形状', () => {
  assert.deepEqual(
    parseProjects(JSON.stringify([project('aiao-desktop', 'aiao-desktop.pages.dev, desktop.aiao.io')])),
    [{ name: 'aiao-desktop', domains: ['aiao-desktop.pages.dev', 'desktop.aiao.io'] }]
  );
  assert.deepEqual(parseDeployments(JSON.stringify([deployment('abc12345-1')])), [
    {
      id: 'abc12345-1',
      environment: 'Production',
      branch: 'main',
      source: 'f00dbab',
      url: 'https://abc12345.aiao-desktop.pages.dev'
    }
  ]);
  assert.throws(() => parseProjects('{"not":"an array"}'), /项目列表/);
  assert.throws(() => parseProjects('oops'), /项目列表/);
  assert.throws(() => parseDeployments('[{"Id":1}]'), /部署列表/);
});

test('liveTargets：部署地址逐文件对账，别名与自定义域名只核对入口页；Preview 没有自定义域名', () => {
  const base = { deploymentUrl: 'https://abc12345.aiao-desktop.pages.dev', customDomains: ['desktop.aiao.io'] };
  assert.deepEqual(liveTargets({ ...base, branch: 'main', productionBranch: 'main' }), [
    { label: '部署地址', url: 'https://abc12345.aiao-desktop.pages.dev', full: true },
    { label: '生产地址', url: 'https://aiao-desktop.pages.dev', full: false },
    { label: '自定义域名', url: 'https://desktop.aiao.io', full: false }
  ]);
  assert.deepEqual(liveTargets({ ...base, branch: 'preview', productionBranch: 'main' }), [
    { label: '部署地址', url: 'https://abc12345.aiao-desktop.pages.dev', full: true },
    { label: 'Preview 别名', url: 'https://preview.aiao-desktop.pages.dev', full: false }
  ]);
});

test('--dry-run 只做产物检查，不碰 wrangler 与线上', async () => {
  const { deps, calls } = fakeDeps();
  const result = await runDeploy({ dryRun: true, preview: false }, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(calls.wrangler, []);
  assert.deepEqual(calls.deploy, []);
  assert.deepEqual(calls.live, []);
  assert.match(calls.log.join('\n'), /dry-run.*pages deploy.*--branch main/s);
});

test('产物检查不通过时，一个 wrangler 命令都不跑', async () => {
  const { deps, calls } = fakeDeps({ problems: ['缺少 _headers'] });
  const result = await runDeploy({ dryRun: false, preview: false }, deps);
  assert.equal(result.ok, false);
  assert.deepEqual(calls.wrangler, []);
  assert.deepEqual(calls.deploy, []);
  assert.match(calls.log.join('\n'), /缺少 _headers/);
});

test('项目已存在：不新建，记下上一版生产部署，发布到 main 并核对线上', async () => {
  const { deps, calls } = fakeDeps({
    projects: [
      project('aiao-vscode', 'aiao-vscode.pages.dev'),
      project('aiao-desktop', 'aiao-desktop.pages.dev, desktop.aiao.io')
    ],
    deployments: [deployment('11111111-aaaa'), deployment('22222222-bbbb')]
  });
  const result = await runDeploy({ dryRun: false, preview: false }, deps);
  assert.equal(result.ok, true);
  assert.equal(result.deploymentId, 'abc12345-0000-4000-8000-000000000000');
  assert.equal(result.previousDeploymentId, '11111111-aaaa');
  assert.ok(!calls.wrangler.some(args => args.includes('create')), '项目已存在，不应新建');
  assert.deepEqual(calls.deploy, [deployArgs({ ...CONFIG, branch: 'main', dirty: true })]);
  assert.deepEqual(calls.live, [
    { baseUrl: 'https://abc12345.aiao-desktop.pages.dev', files: ['index.html', 'main.js'] },
    { baseUrl: 'https://aiao-desktop.pages.dev', files: ['index.html'] },
    { baseUrl: 'https://desktop.aiao.io', files: ['index.html'] }
  ]);
  const log = calls.log.join('\n');
  assert.match(log, /11111111-aaaa/);
  assert.match(log, /f00dbab/);
  assert.match(log, /未提交/);
});

test('项目不存在：先带 --force 新建，再发布；没有上一版可回滚', async () => {
  const { deps, calls } = fakeDeps({ projects: [project('aiao-vscode', 'aiao-vscode.pages.dev')] });
  const result = await runDeploy({ dryRun: false, preview: false }, deps);
  assert.equal(result.ok, true);
  assert.equal(result.previousDeploymentId, undefined);
  assert.deepEqual(calls.wrangler.at(-1), createProjectArgs(CONFIG));
  assert.ok(!calls.wrangler.some(args => args.includes('deployment')), '新项目没有历史部署可查');
  assert.equal(calls.deploy.length, 1);
  assert.deepEqual(
    calls.live.map(item => item.baseUrl),
    ['https://abc12345.aiao-desktop.pages.dev', 'https://aiao-desktop.pages.dev']
  );
});

test('--preview 发布到 Preview 分支，不核对自定义域名', async () => {
  const { deps, calls } = fakeDeps({
    projects: [project('aiao-desktop', 'aiao-desktop.pages.dev, desktop.aiao.io')],
    deployments: [deployment('11111111-aaaa')]
  });
  const result = await runDeploy({ dryRun: false, preview: true }, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(calls.deploy, [deployArgs({ ...CONFIG, branch: 'preview', dirty: true })]);
  assert.deepEqual(
    calls.live.map(item => item.baseUrl),
    ['https://abc12345.aiao-desktop.pages.dev', 'https://preview.aiao-desktop.pages.dev']
  );
});

test('线上对账失败：整体失败，列出失败原因，并给出回滚点', async () => {
  const { deps, calls } = fakeDeps({
    projects: [project('aiao-desktop', 'aiao-desktop.pages.dev, desktop.aiao.io')],
    deployments: [deployment('11111111-aaaa')],
    failures: [{ path: 'index.html', reason: '内容与构建产物不一致' }]
  });
  const result = await runDeploy({ dryRun: false, preview: false }, deps);
  assert.equal(result.ok, false);
  const log = calls.log.join('\n');
  assert.match(log, /index\.html.*内容与构建产物不一致/);
  assert.match(log, /回滚.*11111111-aaaa/s);
});

test('核对每个地址前先等它连得上：新项目的子域名证书要几分钟才签发', async () => {
  const { deps, calls } = fakeDeps({ projects: [project('aiao-desktop', 'aiao-desktop.pages.dev')] });
  await runDeploy({ dryRun: false, preview: false }, deps);
  assert.deepEqual(calls.reachable, ['https://abc12345.aiao-desktop.pages.dev', 'https://aiao-desktop.pages.dev']);
});

test('地址一直连不上：该地址记为失败、不再逐文件请求，其余地址照常核对', async () => {
  const { deps, calls } = fakeDeps({
    projects: [project('aiao-desktop', 'aiao-desktop.pages.dev')],
    unreachable: ['https://abc12345.aiao-desktop.pages.dev']
  });
  const result = await runDeploy({ dryRun: false, preview: false }, deps);
  assert.equal(result.ok, false);
  assert.deepEqual(
    calls.live.map(item => item.baseUrl),
    ['https://aiao-desktop.pages.dev']
  );
  const log = calls.log.join('\n');
  assert.match(log, /暂时连不上.*ERR_SSL_TLS_ALERT_HANDSHAKE_FAILURE/);
  assert.match(log, /180 秒内一直连不上/);
});

test('部署落在了预期之外的环境（项目的生产分支被改过）：发布算失败，不去核对线上', async () => {
  const { deps, calls } = fakeDeps({
    projects: [project('aiao-desktop', 'aiao-desktop.pages.dev')],
    environment: 'preview'
  });
  const result = await runDeploy({ dryRun: false, preview: false }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.deploymentId, 'abc12345-0000-4000-8000-000000000000');
  assert.deepEqual(calls.live, []);
  assert.match(calls.log.join('\n'), /preview 环境.*期望 production.*Production branch/s);
});
