/**
 * 汇总本地预演的证据（ADMIN-US-217），Nx 目标 `rxdb-admin-template:collect-evidence`（`-- --out <目录>`，默认
 * `deploy/evidence/local-preview-<日期>/`）：从 `.state/` 取各验收脚本最近一次的结果、发布记录与对部署地址跑的 e2e 记录，
 * 写成可以入库的 JSON（每个 AC 一份）与产品结构导出 `ac1-product-schema.sql`。
 * 写完之后逐字节搜 `.env.local` 里每个密钥的原值，出现任何一个就删掉输出并报错——证据文件不得带密钥。
 * 所有证据都是本地预演（⚠️），不能替代真实部署环境的证据。
 */
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, secretNames } from './lib/env.mjs';
import { deploymentsFile, productRoot, stateRoot } from './lib/paths.mjs';
import { readRecords } from './lib/releases.mjs';

const acceptance = path.join(stateRoot, 'acceptance');
/** 某类结果里最新的一个（文件名带时刻，按字典序即按时间）。 */
async function latest(prefix) {
  const names = (await readdir(acceptance)).filter(name => name.startsWith(prefix)).sort();
  if (!names.length) throw new Error(`还没有 ${prefix} 的结果`);
  return path.join(acceptance, names.at(-1));
}
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const note = '本地预演栈（deploy/local，自托管 Supabase）上的结果，⚠️ 不能替代真实部署环境的证据';

async function main() {
  const index = process.argv.indexOf('--out');
  const date = new Date().toISOString().slice(0, 10);
  const out =
    index === -1 ?
      path.join(productRoot, 'deploy', 'evidence', `local-preview-${date}`)
    : path.resolve(process.argv[index + 1]);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const records = await readRecords(deploymentsFile);
  const runs = await readRecords(path.join(stateRoot, 'acceptance.jsonl'));
  const migration = await latest('migration-check-');
  const files = {
    'ac1-migration-check.json': { note, ...(await readJson(path.join(migration, 'summary.json'))) },
    'ac2-deployments.json': { note, records },
    'ac2-failure-drill.json': { note, ...(await readJson(await latest('failure-drill-'))) },
    'ac3-env-check.json': { note, ...(await readJson(await latest('env-check-'))) },
    'ac4-otp.json': {
      note: `${note}；验证码邮件经本地收件服务（inbucket）读取，不是真实邮箱`,
      runs: runs.filter(run => run.kind === 'otp')
    },
    'ac5-e2e.json': { note, runs: runs.filter(run => run.kind === 'e2e') },
    'ac6-retention.json': { note, ...(await readJson(await latest('retention-'))) },
    'ac7-monitor.json': { note, ...(await readJson(await latest('monitor-'))) },
    'ac8-rollback-drill.json': { note, ...(await readJson(await latest('rollback-drill-'))) }
  };
  for (const [name, content] of Object.entries(files))
    await writeFile(path.join(out, name), `${JSON.stringify(content, null, 2)}\n`);
  await copyFile(path.join(migration, 'product-schema.sql'), path.join(out, 'ac1-product-schema.sql'));

  const env = await loadEnv();
  const values = secretNames.filter(name => name !== 'ANON_KEY').map(name => [name, env[name]]);
  values.push(['JWT_KEYS#d', JSON.parse(env.JWT_KEYS).find(key => key.d).d]);
  values.push(['JWT_SECRET#jwk', Buffer.from(env.JWT_SECRET, 'utf8').toString('base64url')]);
  const leaks = [];
  for (const name of await readdir(out)) {
    const text = await readFile(path.join(out, name), 'utf8');
    for (const [secret, value] of values) if (text.includes(value)) leaks.push(`${name}: ${secret}`);
  }
  if (leaks.length) {
    await rm(out, { recursive: true, force: true });
    throw new Error(`证据里出现了密钥，已删除输出：${leaks.join('、')}`);
  }
  console.info(
    `✅ 证据已写到 ${path.relative(process.cwd(), out)}（${Object.keys(files).length + 1} 个文件，不含任何密钥原值）`
  );
}

await main();
