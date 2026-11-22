/**
 * 健康检查与错误监控的预演（ADMIN-US-217 AC#7），Nx 目标 `rxdb-admin-template:monitor-drill`：
 *
 * 1. 健康检查：经网关访问函数的 `GET /health`，以及经三端静态站点的 `/collaboration-api/health`（生产的改写规则），都是 200 且
 *    数据库与 Auth 都可用；响应里不含 `.env.local` 的任何密钥原值；
 * 2. 依赖不可用：停掉连接池（数据库不可达）→ 503、数据库 unavailable、Auth 仍 ok；恢复后回到 200。停掉 Auth → 503、Auth
 *    unavailable；恢复后回到 200（只操作本栈自己的容器）；
 * 3. 人为触发一次未处理错误：以迁移所有者在邀请表上临时装一个触发器，让插入时抛出带受邀邮箱、6 位数字与令牌形状字符串的异常；
 *    以真实会话发一条邀请命令 → 500 `internal`；错误经 HTTP 上报器进入收集器（`.state/monitor/errors.jsonl`），同时写函数日志
 *    （`ADMIN_ERROR <JSON>`）。断言收集器与日志里各有这次错误、发布 ID 与请求路径正确，且都不含 access token、验证码、受邀邮箱
 *    与任何密钥原值；最后删掉触发器。
 * 结果写到 `.state/acceptance/monitor-<时刻>.json`。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { command, signIn } from './lib/clients.mjs';
import { loadEnv, ownerDatabaseUrl, secretNames } from './lib/env.mjs';
import { composeProject, deployedWorkspace, frameworks, local, ownerEmail, siteRoot, stateRoot } from './lib/paths.mjs';
import { compose, request, run, waitFor } from './lib/process.mjs';
import { linkedRelease } from './lib/releases.mjs';
import { functionHealth } from './lib/stack.mjs';

/** 在一段文本里找出出现过的敏感值（只返回名字）。 */
const leaked = (text, values) =>
  Object.entries(values)
    .filter(([, value]) => value && text.includes(value))
    .map(([name]) => name);

async function waitHealth(expected) {
  return waitFor(
    `健康检查变为 ${expected}`,
    async () => {
      const health = await functionHealth();
      return health.status === expected ? health : undefined;
    },
    { timeoutMs: 60_000, intervalMs: 1000 }
  );
}
/** 停掉本栈的一个服务，取一次健康检查，再恢复并等健康检查回到 200。 */
async function outage(secrets, release, service) {
  await compose(['stop', service], { secrets, release, quiet: true });
  try {
    return await waitHealth(503);
  } finally {
    await compose(['start', service], { secrets, release, quiet: true });
    await waitHealth(200);
  }
}

async function main() {
  const secrets = await loadEnv();
  const release = await linkedRelease(siteRoot, 'current');
  const functions = (await linkedRelease(siteRoot, 'functions')) ?? 'none';
  const secretValues = Object.fromEntries(
    secretNames.filter(name => name !== 'ANON_KEY').map(name => [name, secrets[name]])
  );
  const result = { kind: 'monitor', at: new Date().toISOString(), release, functions };

  // 1. 健康检查：函数直连网关与经三端静态站点的改写
  const direct = await functionHealth();
  const viaSites = {};
  for (const framework of frameworks) {
    const response = await request(`${local.web[framework]}/collaboration-api/health`);
    viaSites[framework] = { status: response.status, body: await response.json() };
  }
  result.health = { direct, viaSites, leaked: leaked(JSON.stringify({ direct, viaSites }), secretValues) };

  // 2. 依赖不可用：数据库（停连接池）与 Auth
  result.outages = {
    database: (await outage(secrets, functions, 'pooler')).body,
    auth: (await outage(secrets, functions, 'auth')).body,
    recovered: (await functionHealth()).body
  };

  // 3. 人为触发一次未处理错误
  const owner = new pg.Pool({ connectionString: ownerDatabaseUrl(secrets), max: 1 });
  const { token } = await signIn(secrets, ownerEmail);
  const invitee = `invitee-${randomUUID().slice(0, 8)}@example.com`;
  const fakeOtp = String(100000 + Math.floor(Math.random() * 899999));
  // 异常里放一个令牌形状的假串（不把真实 access token 写进数据库日志）；真实令牌在请求头里，同样不得出现在任何报告中
  const fakeToken = `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: randomUUID() })).toString('base64url')}.c2lnbmF0dXJl`;
  const sensitive = { accessToken: token, fakeToken, invitee, otp: fakeOtp, ...secretValues };
  const [, collectorBefore] = await Promise.all([
    owner.query('SELECT 1'),
    (await request(`${local.collectorUrl}/events`)).json()
  ]);
  try {
    await owner.query(`CREATE OR REPLACE FUNCTION admin_private.monitor_drill_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'monitor drill fault for % code % token %', NEW.email, '${fakeOtp}', '${fakeToken}'
          USING ERRCODE = 'P0001', DETAIL = 'Key (email)=(' || NEW.email || ') rejected by the drill';
      END $$`);
    await owner.query(
      `CREATE TRIGGER monitor_drill_fault BEFORE INSERT ON admin_private.invitations
       FOR EACH ROW EXECUTE FUNCTION admin_private.monitor_drill_fault()`
    );
    const started = new Date();
    const failed = await command(token, deployedWorkspace, {
      type: 'invite',
      id: `drill-${randomUUID().slice(0, 8)}`,
      email: invitee,
      permissions: ['read'],
      tokenHash: randomUUID(),
      expiresAt: Date.now() + 3600000,
      expectedVersion: 0,
      operationId: randomUUID()
    });
    result.fault = { status: failed.status, body: failed.body };
    const collected = await waitFor('收集器收到这次错误', async () => {
      const events = await (await request(`${local.collectorUrl}/events`)).json();
      return events.length > collectorBefore.length ? events.slice(collectorBefore.length) : undefined;
    });
    const logs = await run('docker', ['logs', '--since', started.toISOString(), `${composeProject}-functions-1`], {
      capture: true,
      quiet: true,
      // 函数日志写在容器的标准错误里，docker logs 原样写到自己的标准错误
      combined: true
    });
    const logLines = logs
      .split('\n')
      .filter(line => line.includes('ADMIN_ERROR '))
      .map(line => line.slice(line.indexOf('ADMIN_ERROR ')));
    const report = collected.at(-1).report;
    result.collector = { events: collected.length, report };
    result.logs = { lines: logLines.length, sample: logLines.at(-1) ?? null };
    const everything = JSON.stringify({ collected, logLines, response: failed.body });
    result.checks = {
      returns500Internal: failed.status === 500 && failed.body.error === 'internal',
      responseHasNoDetails: JSON.stringify(failed.body.details) === '{}',
      collectorReceived: collected.length === 1,
      logSinkReceived: logLines.length >= 1,
      releaseAndPath:
        report.release === functions &&
        report.entry === 'edge' &&
        report.request?.path ===
          `/admin-collaboration/workspaces/${deployedWorkspace.teamId}/${deployedWorkspace.appId}/commands`,
      redactedPlaceholders: ['[email]', '[digits]', '[jwt]'].every(marker => report.error.message.includes(marker)),
      noSensitiveValues: leaked(everything, sensitive).length === 0,
      healthHasNoSecrets: result.health.leaked.length === 0,
      healthOk:
        direct.status === 200 &&
        Object.values(viaSites).every(item => item.status === 200 && item.body.status === 'ok'),
      databaseOutageReported:
        result.outages.database.status === 'unavailable' &&
        result.outages.database.checks.database.status === 'unavailable' &&
        result.outages.database.checks.auth.status === 'ok',
      authOutageReported:
        result.outages.auth.status === 'unavailable' && result.outages.auth.checks.auth.status === 'unavailable',
      recovered: result.outages.recovered.status === 'ok'
    };
    result.leaked = leaked(everything, sensitive);
  } finally {
    await owner.query('DROP TRIGGER IF EXISTS monitor_drill_fault ON admin_private.invitations');
    await owner.query('DROP FUNCTION IF EXISTS admin_private.monitor_drill_fault()');
    await owner.end();
  }
  await mkdir(path.join(stateRoot, 'acceptance'), { recursive: true });
  const file = path.join(stateRoot, 'acceptance', `monitor-${result.at.replace(/[-:.]/g, '').slice(0, 15)}.json`);
  // 验收报告只写入本机私有状态目录，内容用于离线取证。
  // codeql[js/http-to-file-access]
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  for (const [name, passed] of Object.entries(result.checks)) console.info(`${passed ? '✅' : '❌'} ${name}`);
  console.info(`结果：${path.relative(process.cwd(), file)}`);
  if (!Object.values(result.checks).every(Boolean)) process.exitCode = 1;
}

await main();
