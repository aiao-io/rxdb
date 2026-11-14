import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

import { compareKeys, failedChecks, flattenKeys } from './harness/keys.mjs';

const { values } = parseArgs({
  options: {
    'baseline-root': { type: 'string' },
    'split-root': { type: 'string' },
    'split-groups': { type: 'string', multiple: true },
    output: { type: 'string' }
  },
  strict: true
});
for (const name of ['baseline-root', 'split-root', 'output']) {
  if (!values[name]) throw new Error(`缺少 --${name}`);
}
const splitGroups = values['split-groups']?.flatMap(value => value.split(','));
const roots = { baseline: resolve(values['baseline-root']), split: resolve(values['split-root']) };
const baselineKeys = JSON.parse(readFileSync(new URL('./baseline/smoke-keys-85b86fb3.json', import.meta.url), 'utf8')).keys;
const fingerprint = (root, relative = '') => {
  const hash = createHash('sha256');
  const visit = directory => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = join(directory, entry.name);
      if (entry.isDirectory()) visit(name);
      else hash.update(name).update(readFileSync(join(root, name)));
    }
  };
  visit(relative);
  return hash.digest('hex');
};
const identities = Object.fromEntries(Object.entries(roots).map(([name, root]) => {
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'aiao-desktop/apps/e2e'], { cwd: root });
  return [name, {
    sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    artifactSha256: fingerprint(join(root, 'dist/aiao-desktop/apps/web/browser')),
    orbitSha256: fingerprint(join(root, 'packages/orbit/dist'))
  }];
}));
if (identities.baseline.artifactSha256 !== identities.split.artifactSha256 || identities.baseline.orbitSha256 !== identities.split.orbitSha256)
  throw new Error('两份脚本必须读取逐字节相同的正式构建与 Orbit 客户端');
const browser = await chromium.launch();
const version = browser.version();
await browser.close();
const report = {
  format: 'aiao-desktop.benchmark-smoke', version: 1, measuredAt: new Date().toISOString(),
  environment: { os: platform(), release: release(), arch: arch(), cpu: cpus()[0].model, node: process.version, chromium: version, headless: true },
  method: '固定提交，各三轮、交替串行执行；每轮新进程与空浏览器上下文，路由拦截外网、禁用 HTTP 缓存，无 Service Worker；计时从 Node 子进程启动到退出；不剔除样本',
  splitGroups: splitGroups ?? null,
  exclusions: 'fixtures 不是默认检查组，不计入比较；拆分之后新增的需求组另由当前完整冒烟验收',
  retrospective: true,
  scripts: identities,
  artifactSource: identities.baseline.sha,
  samples: [],
  checks: {}
};
const save = () => writeFileSync(resolve(values.output), `${JSON.stringify(report, null, 2)}\n`);
const run = (kind, round) => new Promise((resolveRun, reject) => {
  const started = performance.now();
  const args = ['src/smoke.mjs'];
  if (kind === 'split' && splitGroups) args.push(...splitGroups.map(group => `--group=${group}`));
  const child = spawn(process.execPath, args, {
    cwd: join(roots[kind], 'aiao-desktop/apps/e2e'), env: process.env, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  child.once('error', reject);
  child.once('close', code => {
    const seconds = (performance.now() - started) / 1_000;
    const json = stdout.trim().split('\n').findLast(line => line.startsWith('{'));
    const result = json ? JSON.parse(json) : {};
    const keys = compareKeys(baselineKeys, flattenKeys(result));
    const failed = failedChecks(result);
    const sample = { kind, round, seconds, exitCode: code, missing: keys.missing, extra: keys.extra, failed, stderr, result };
    console.error(`${kind} #${round} ${seconds.toFixed(3)}s，退出码 ${code}，缺项 ${keys.missing.length}，多项 ${keys.extra.length}，未通过 ${failed.length}`);
    resolveRun(sample);
  });
});
for (let round = 1; round <= 3; round++) {
  for (const kind of ['baseline', 'split']) {
    const sample = await run(kind, round);
    report.samples.push(sample);
    save();
    if (sample.exitCode !== 0 || sample.missing.length || sample.extra.length || sample.failed.length) {
      console.error('样本未通过，保留诊断并停止比较');
      process.exit(1);
    }
  }
}
const median = kind => report.samples.filter(sample => sample.kind === kind).map(sample => sample.seconds).sort((a, b) => a - b)[1];
report.medians = { baselineSeconds: median('baseline'), splitSeconds: median('split') };
report.ratio = report.medians.splitSeconds / report.medians.baselineSeconds;
report.checks = { identicalArtifacts: true, sameCheckKeysAndAllPass: true, withinTenPercent: report.ratio <= 1.1 };
save();
console.log(JSON.stringify({ medians: report.medians, ratio: report.ratio, checks: report.checks }));
if (!report.checks.withinTenPercent) process.exitCode = 1;
