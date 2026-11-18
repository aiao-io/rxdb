/**
 * 对本地预演栈的部署地址跑协作 E2E（ADMIN-US-217 AC#5 / AC#4），Nx 目标 `rxdb-admin-template:e2e-local`：
 * 从 `.env.local` 读出测试侧需要的设置（service key 与迁移所有者连接只给夹具服务），以「已部署目标」模式运行
 * `admin-collaboration:e2e-deployed`——三端打 4510～4512，夹具服务在 4520，不起 browser-server.mjs；其余参数原样交给 Playwright
 * （例如 `-- --project react --project angular --project vue --project rls`）。
 *
 * `--otp <秒>`：AC#4 预演。先把 Auth 的验证码有效期临时调成这个秒数（重建 auth 容器），只跑 `otp-*` 项目，跑完恢复为 1 小时；
 * 用例新建的 `otp-*@admin-template.test` 账号跑完即删。
 *
 * 结果与当时在线的发布 ID 一起追加到 `.state/acceptance.jsonl`（通过、失败、跳过的个数与失败的用例名），JSON 报告留在
 * `.state/acceptance/`。Nx 有时吞掉 Playwright 的退出码，这里以 JSON 报告里的失败数为准决定退出码。
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { deployedTarget, loadEnv } from './lib/env.mjs';
import { frameworks, local, ports, siteRoot, stateRoot } from './lib/paths.mjs';
import { compose, nx, request, run, waitFor } from './lib/process.mjs';
import { appendRecord, linkedRelease } from './lib/releases.mjs';

const args = process.argv.slice(2);
const otpIndex = args.indexOf('--otp');
const otpSeconds = otpIndex === -1 ? null : Number(args[otpIndex + 1]);
if (otpIndex !== -1 && !(Number.isInteger(otpSeconds) && otpSeconds > 0)) throw new Error('--otp 需要一个正整数秒数');
const playwrightArgs = otpIndex === -1 ? args : args.filter((_, index) => index !== otpIndex && index !== otpIndex + 1);

/** Playwright JSON 报告里的统计与失败用例。 */
function summarize(report) {
  const failures = [];
  const visit = suite => {
    for (const spec of suite.specs ?? [])
      for (const item of spec.tests ?? [])
        if (item.status === 'unexpected') failures.push(`${item.projectName} › ${spec.title}`);
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  const { expected = 0, unexpected = 0, skipped = 0, flaky = 0, duration = 0 } = report.stats ?? {};
  return { expected, unexpected, skipped, flaky, durationMs: Math.round(duration), failures };
}

/** 调整 Auth 的验证码有效期（重建 auth 容器），等 Auth 恢复可用。 */
async function setOtpExpiry(secrets, release, seconds) {
  await compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', 'auth'], {
    secrets,
    release,
    env: { AUTH_MAILER_OTP_EXP: String(seconds) }
  });
  await waitFor(
    'Auth 可用',
    async () => (await request(`${local.supabaseUrl}/auth/v1/health`, { headers: { apikey: secrets.ANON_KEY } })).ok
  );
}
/** 删除 AC#4 用例建的账号（只删 otp-*@admin-template.test）。 */
async function removeOtpAccounts(secrets) {
  const headers = { apikey: secrets.SERVICE_ROLE_KEY, authorization: `Bearer ${secrets.SERVICE_ROLE_KEY}` };
  const { users } = await (await request(`${local.supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers })).json();
  const targets = users.filter(user => /^otp-[0-9a-f-]+@admin-template\.test$/.test(user.email ?? ''));
  for (const user of targets)
    await request(`${local.supabaseUrl}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers });
  return targets.length;
}

async function main() {
  const secrets = await loadEnv();
  const target = deployedTarget(secrets);
  const release = await linkedRelease(siteRoot, 'current');
  const functions = await linkedRelease(siteRoot, 'functions');
  if (!release) throw new Error('还没有在线的发布：先运行 pnpm nx run rxdb-admin-template:deploy-local');
  const listener = await run('lsof', ['-nP', `-iTCP:${ports.fixtures}`, '-sTCP:LISTEN'], {
    capture: true,
    quiet: true
  }).catch(() => '');
  if (listener.trim()) throw new Error(`夹具端口 ${ports.fixtures} 已被占用`);
  const started = new Date();
  const directory = path.join(stateRoot, 'acceptance');
  await mkdir(directory, { recursive: true });
  const report = path.join(
    directory,
    `e2e-${release}-${started.toISOString().replace(/[-:.]/g, '').slice(0, 15)}.json`
  );
  const projects = otpSeconds ? frameworks.flatMap(name => ['--project', `otp-${name}`]) : [];
  console.info(
    `对部署地址跑协作 E2E：发布 ${release}（函数 ${functions}），三端 ${Object.values(local.web).join('、')}`
  );
  if (otpSeconds) await setOtpExpiry(secrets, functions ?? 'none', otpSeconds);
  try {
    await nx(
      ['run', 'admin-collaboration:e2e-deployed', '--output-style=stream', '--', ...projects, ...playwrightArgs],
      {
        ADMIN_E2E_SUPABASE_URL: target.supabaseUrl,
        ADMIN_E2E_ANON_KEY: target.anonKey,
        ADMIN_E2E_SERVICE_KEY: target.serviceKey,
        ADMIN_E2E_OWNER_DATABASE_URL: target.ownerDatabaseUrl,
        ADMIN_E2E_COMMANDS_URL: target.functionUrl,
        ADMIN_E2E_FIXTURES_PORT: String(ports.fixtures),
        ADMIN_E2E_WEB_URLS: frameworks.map(name => local.web[name]).join(','),
        ADMIN_E2E_MAIL_URL: otpSeconds ? local.mailUrl : '',
        ADMIN_E2E_OTP_EXPIRY_SECONDS: otpSeconds ? String(otpSeconds) : '',
        ADMIN_E2E_REPORT: report
      }
    ).catch(error => console.error(error.message));
  } finally {
    if (otpSeconds) {
      await setOtpExpiry(secrets, functions ?? 'none', 3600);
      console.info(`验证码有效期已恢复为 3600 秒；删除 AC#4 用例账号 ${await removeOtpAccounts(secrets)} 个`);
    }
  }
  const summary = summarize(JSON.parse(await readFile(report, 'utf8')));
  const record = {
    kind: otpSeconds ? 'otp' : 'e2e',
    release,
    functions,
    startedAt: started.toISOString(),
    finishedAt: new Date().toISOString(),
    args: [...projects, ...playwrightArgs],
    otpExpirySeconds: otpSeconds,
    report: path.relative(stateRoot, report),
    ...summary
  };
  await appendRecord(path.join(stateRoot, 'acceptance.jsonl'), record);
  console.info(
    `结果（发布 ${release}）：通过 ${summary.expected}，失败 ${summary.unexpected}，不稳定 ${summary.flaky}，跳过 ${summary.skipped}`
  );
  if (summary.unexpected > 0) {
    for (const failure of summary.failures) console.error(`  ✖ ${failure}`);
    process.exitCode = 1;
  }
}

await main();
