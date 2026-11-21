/**
 * 失败即停的演练（ADMIN-US-217 AC#2），Nx 目标 `rxdb-admin-template:failure-drill`（可加 `-- --steps 3,7,8`，默认 1～8 全部）：
 * 已有在线发布 A 时，依次让发布流水线在第 N 步失败（`ADMIN_DEPLOY_FAIL_STEP=N`），每一次都断言——
 * - 流水线以非 0 退出，后面的步骤没有执行，发布记录写下失败的步骤与补偿；
 * - current 仍指向 A，staged 预览链接已撤掉；函数链接仍（或已换回）指向 A，函数的健康检查报出 A；
 * - 三端当前版本（4510～4512）送出的仍是 A 的页面。
 * 结果写到 `.state/acceptance/failure-drill-<时刻>.json`。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deploymentsFile, frameworks, local, productRoot, releasesRoot, siteRoot, stateRoot } from './lib/paths.mjs';
import { run } from './lib/process.mjs';
import { linkedRelease, readRecords } from './lib/releases.mjs';
import { functionHealth, servesRelease } from './lib/stack.mjs';

async function main() {
  const index = process.argv.indexOf('--steps');
  const steps = index === -1 ? [1, 2, 3, 4, 5, 6, 7, 8] : process.argv[index + 1].split(',').map(Number);
  const online = await linkedRelease(siteRoot, 'current');
  if (!online) throw new Error('还没有在线的发布：先 deploy-local');
  const drills = [];
  for (const step of steps) {
    console.info(`\n=== 注入失败：第 ${step} 步（线上 ${online}）`);
    const exit = await run('node', [path.join(productRoot, 'deploy', 'scripts', 'deploy-local.mjs')], {
      env: { ...process.env, ADMIN_DEPLOY_FAIL_STEP: String(step) }
    }).then(
      () => 0,
      () => 1
    );
    const record = (await readRecords(deploymentsFile)).at(-1);
    const links = {
      current: await linkedRelease(siteRoot, 'current'),
      staged: await linkedRelease(siteRoot, 'staged'),
      functions: await linkedRelease(siteRoot, 'functions')
    };
    const health = await functionHealth();
    const served = {};
    for (const framework of frameworks)
      served[framework] = await servesRelease(
        local.web[framework],
        path.join(releasesRoot, online, 'web', framework, 'index.html')
      );
    const checks = {
      exitedNonZero: exit !== 0,
      recordedFailedStep: record.result === 'failed' && record.failedStep === step && record.injected === true,
      laterStepsSkipped: record.steps.filter(item => item.n > step).every(item => item.status === 'skipped'),
      compensationsSucceeded: record.compensations.every(item => item.status === 'ok'),
      currentUnchanged: links.current === online,
      stagedRemoved: links.staged === null,
      functionIsPrevious: links.functions === online && health.status === 200 && health.body?.release === online,
      oldVersionServed: Object.values(served).every(Boolean)
    };
    drills.push({
      step,
      attemptedRelease: record.release,
      exit,
      error: record.error,
      steps: record.steps.map(item => `${item.n}:${item.status}`),
      compensations: record.compensations,
      links,
      health: health.body,
      served,
      checks
    });
    for (const [name, passed] of Object.entries(checks)) console.info(`${passed ? '✅' : '❌'} 第 ${step} 步 ${name}`);
  }
  const result = { kind: 'failure-drill', at: new Date().toISOString(), online, drills };
  await mkdir(path.join(stateRoot, 'acceptance'), { recursive: true });
  const file = path.join(stateRoot, 'acceptance', `failure-drill-${result.at.replace(/[-:.]/g, '').slice(0, 15)}.json`);
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
  console.info(`结果：${path.relative(process.cwd(), file)}`);
  if (!drills.every(drill => Object.values(drill.checks).every(Boolean))) process.exitCode = 1;
}

await main();
