/**
 * 回滚（ADMIN-US-217 AC#8），Nx 目标 `rxdb-admin-template:rollback-local`（可加 `-- --to <发布 ID>`）：
 *
 * 1. 定目标：`--to` 指定的发布，或发布记录里当前发布之前最近一次上线的发布；目标目录与清单必须还在；
 * 2. 函数回到目标发布的产物：函数链接指向它，以它的发布 ID 重建函数容器，等健康检查报出目标 ID；
 * 3. 三端切回：current 原子地指向目标发布，核对三端送出的就是目标发布的页面；
 * 4. 迁移不回退：列出当前发布有、目标发布没有的迁移，以及 `deploy/migrations.json` 里它们的回滚与前向修复说明——
 *    每个迁移都对上一版代码兼容（只增不删），共享数据留在数据库里，回滚应用不会丢数据；
 * 5. 健康检查（函数、数据库与 Auth）通过后写发布记录（`result: rolled_back`）。
 * 任一步失败即停止并报错，已经切回的部分保持切回（回滚本身就是让线上回到旧版本）。
 */
import path from 'node:path';
import { loadEnv } from './lib/env.mjs';
import { deploymentsFile, frameworks, local, releasesRoot, siteRoot } from './lib/paths.mjs';
import { waitFor } from './lib/process.mjs';
import {
  appendRecord,
  linkedRelease,
  pointToRelease,
  previousRelease,
  readManifest,
  readRecords,
  releasePattern
} from './lib/releases.mjs';
import { activateFunction, functionHealth, migrationNotes, servesRelease } from './lib/stack.mjs';

async function main() {
  const args = process.argv.slice(2);
  const requested = args.includes('--to') ? args[args.indexOf('--to') + 1] : undefined;
  const secrets = await loadEnv();
  const records = await readRecords(deploymentsFile);
  const current = await linkedRelease(siteRoot, 'current');
  const target = requested ?? previousRelease(records, current);
  if (!target || !releasePattern.test(target))
    throw new Error('没有可回滚的目标：发布记录里当前发布之前没有上线过的发布');
  if (target === current) throw new Error(`目标 ${target} 就是当前发布`);
  const manifest = await readManifest(releasesRoot, target);
  if (!manifest) throw new Error(`发布目录 ${target} 已被清理，无法回滚到它`);
  const startedAt = new Date().toISOString();
  const before = { current, functions: await linkedRelease(siteRoot, 'functions') };
  console.info(`回滚：${current ?? '无'} → ${target}`);

  await activateFunction(secrets, target);
  console.info(`  函数已回到 ${target} 的产物`);
  await pointToRelease(siteRoot, 'current', target);
  for (const framework of frameworks)
    await waitFor(`${framework} 送出 ${target} 的页面`, () =>
      servesRelease(local.web[framework], path.join(releasesRoot, target, 'web', framework, 'index.html'))
    );
  console.info(`  三端已切回：${Object.values(local.web).join('、')}`);

  const health = await functionHealth();
  if (health.status !== 200 || health.body?.status !== 'ok' || health.body?.release !== target)
    throw new Error(`回滚后的健康检查未通过：${health.status} ${JSON.stringify(health.body)}`);
  const migrations = await migrationNotes(current ? await readManifest(releasesRoot, current) : null, manifest);
  if (migrations.length) {
    console.info('  以下迁移比目标发布新，保留不回退（对上一版代码兼容），回滚与前向修复说明：');
    for (const note of migrations)
      console.info(
        `    - ${note.name}（${note.change === 'added' ? '目标发布没有' : '内容与目标发布不同'}）：${note.rollback}；前向修复：${note.forwardFix ?? '见 deploy/README.md'}`
      );
  } else console.info('  两个发布的迁移相同，没有需要说明的迁移');
  await appendRecord(deploymentsFile, {
    release: target,
    result: 'rolled_back',
    from: current,
    to: target,
    startedAt,
    finishedAt: new Date().toISOString(),
    before,
    after: { current: await linkedRelease(siteRoot, 'current'), functions: await linkedRelease(siteRoot, 'functions') },
    migrationsKept: migrations.map(note => note.name),
    health: health.body
  });
  console.info(`✅ 已回滚到 ${target}（记录：deploy/local/.state/deployments.jsonl）`);
}

await main();
