/**
 * 本地预演栈的起停（ADMIN-US-217）：`node deploy/scripts/local-stack.mjs <up|down|status> [--volumes] [--studio]`，
 * Nx 目标 `rxdb-admin-template:local-up` / `local-down` / `local-status` 调用它。
 *
 * up：
 * 1. 第一次运行时生成 `deploy/local/.env.local`（随机密钥，权限 600）；
 * 2. 准备 `.state/`：发布目录、空的函数目录链接、Kong 声明式配置与 PgBouncer 口令文件（按 `.env.local` 生成，放在 700 的 private/）；
 * 3. 检查 4500～4515 没有被别的进程占用（本栈自己发布的端口除外）；
 * 4. 先起数据库与收件服务，按 `.env.local` 同步 Supabase 内置角色的口令（数据卷来自上一次时也对得上），再起其余服务并等待健康；
 * 5. 在 Auth 里建好初始管理员（已验证邮箱），ID 记进 `.state/stack.json`，供发布流水线的初始化步骤使用。
 * down：`docker compose down`，保留数据卷与 `.state/`；`--volumes` 连数据卷与 `.state/` 一起删除（`.env.local` 保留）。
 */
import { chmod, cp, lstat, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureEnvFile, loadEnv } from './lib/env.mjs';
import {
  local,
  localRoot,
  monitorRoot,
  ownerEmail,
  privateRoot,
  releasesRoot,
  siteRoot,
  stackFile,
  stackPorts,
  stateRoot
} from './lib/paths.mjs';
import { compose, request, run, waitFor } from './lib/process.mjs';
import { linkedRelease } from './lib/releases.mjs';

/** 函数链接还没指向任何发布时的空目录：函数容器照常启动，请求得到「函数不存在」。 */
const emptyFunctions = path.join(stateRoot, 'site', 'empty', 'functions');

async function exists(target) {
  return lstat(target).then(
    () => true,
    () => false
  );
}

/**
 * 准备 `.state/`：目录、函数链接、Kong 配置与 PgBouncer 口令文件。生成的含密钥文件只放在 700 的 private/ 下。
 * 返回 Kong 的声明式配置是否变了：Kong 只在启动时读它，栈已在运行时要重启 Kong 才生效。
 */
async function prepareState(secrets) {
  await mkdir(releasesRoot, { recursive: true });
  await mkdir(emptyFunctions, { recursive: true });
  await mkdir(monitorRoot, { recursive: true });
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  await chmod(privateRoot, 0o700);
  if (!(await exists(path.join(siteRoot, 'functions'))))
    await symlink('empty/functions', path.join(siteRoot, 'functions'));
  const template = await readFile(path.join(localRoot, 'kong.template.yml'), 'utf8');
  const kong = template
    .replaceAll('${ANON_KEY}', secrets.ANON_KEY)
    .replaceAll('${SERVICE_ROLE_KEY}', secrets.SERVICE_ROLE_KEY);
  // 容器里 Kong 与 PgBouncer 以非 root 用户读取挂载的文件：文件 644，宿主机上由 700 的 private/ 挡住其他用户
  const kongFile = path.join(privateRoot, 'kong.yml');
  const previous = await readFile(kongFile, 'utf8').catch(() => null);
  await writeFile(kongFile, kong, { mode: 0o644 });
  const pooler = path.join(privateRoot, 'pgbouncer');
  await mkdir(pooler, { recursive: true });
  await chmod(pooler, 0o755);
  await cp(path.join(localRoot, 'pgbouncer.ini'), path.join(pooler, 'pgbouncer.ini'));
  await writeFile(path.join(pooler, 'userlist.txt'), `"admin_collaboration" "${secrets.ADMIN_SERVICE_PASSWORD}"\n`, {
    mode: 0o644
  });
  for (const file of ['kong.yml', 'pgbouncer/pgbouncer.ini', 'pgbouncer/userlist.txt'])
    await chmod(path.join(privateRoot, file), 0o644);
  return previous !== null && previous !== kong;
}

/** 本栈已经发布出去的宿主机端口（栈已在运行时，这些端口的监听者就是本栈）。 */
async function publishedPorts(secrets, release) {
  const output = await compose(['ps', '--format', 'json'], { secrets, release, capture: true, quiet: true });
  const published = new Set();
  for (const line of output.split('\n').filter(Boolean))
    for (const publisher of JSON.parse(line).Publishers ?? [])
      if (publisher.PublishedPort) published.add(publisher.PublishedPort);
  return published;
}
/** 端口检查：每个要发布的端口要么空闲，要么已经是本栈发布的；否则报出占用者并停止。 */
async function checkPorts(secrets, release) {
  const ours = await publishedPorts(secrets, release);
  const busy = [];
  for (const port of stackPorts) {
    if (ours.has(port)) continue;
    const listener = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { capture: true, quiet: true }).catch(
      () => ''
    );
    if (listener.trim()) busy.push(`${port}（${listener.trim().split('\n')[1]?.split(/\s+/).slice(0, 2).join(' ')}）`);
  }
  if (busy.length) throw new Error(`端口已被占用：${busy.join('、')}；本预演独占 4500～4529`);
}

/** 按 `.env.local` 同步 Supabase 内置角色的口令（经容器内的本地套接字，口令从标准输入传入，不出现在命令行里）。 */
async function syncRolePasswords(secrets, release) {
  const literal = `'${secrets.POSTGRES_PASSWORD}'`;
  const sql = ['authenticator', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_admin']
    .map(role => `ALTER ROLE ${role} WITH PASSWORD ${literal};`)
    .join('\n');
  await compose(['exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
    secrets,
    release,
    input: sql,
    quiet: true
  });
}

/** 在 Auth 里建好初始管理员（已验证邮箱）：已存在就复用。返回账号 ID。 */
async function ensureOwner(secrets) {
  const headers = { apikey: secrets.SERVICE_ROLE_KEY, authorization: `Bearer ${secrets.SERVICE_ROLE_KEY}` };
  const listed = await request(`${local.supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers });
  if (!listed.ok) throw new Error(`读取 Auth 账号失败：${listed.status}`);
  const existing = (await listed.json()).users.find(user => user.email === ownerEmail);
  if (existing) return existing.id;
  const created = await request(`${local.supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ email: ownerEmail, email_confirm: true })
  });
  if (!created.ok) throw new Error(`建初始管理员失败：${created.status}`);
  return (await created.json()).id;
}

async function up(studio) {
  if (await ensureEnvFile()) console.info('已生成 deploy/local/.env.local（随机密钥，权限 600）');
  const secrets = await loadEnv();
  const kongChanged = await prepareState(secrets);
  const release = (await linkedRelease(siteRoot, 'functions')) ?? 'none';
  await checkPorts(secrets, release);
  const profile = studio ? ['--profile', 'studio'] : [];
  await compose([...profile, 'up', '-d', '--wait', '--wait-timeout', '180', 'db', 'mail'], { secrets, release });
  await syncRolePasswords(secrets, release);
  await compose([...profile, 'up', '-d', '--wait', '--wait-timeout', '300'], { secrets, release });
  if (kongChanged) {
    // 声明式配置只在 Kong 启动时读取：配置变了（例如改了 CORS）就重启 Kong 并等它恢复健康
    await compose(['restart', 'kong'], { secrets, release });
    await compose(['up', '-d', '--wait', '--wait-timeout', '120', 'kong'], { secrets, release });
  }
  const ownerId = await waitFor('Auth 可用', () => ensureOwner(secrets), { timeoutMs: 60_000, intervalMs: 1000 });
  const stack = { ownerEmail, ownerId, updatedAt: new Date().toISOString() };
  await writeFile(stackFile, `${JSON.stringify(stack, null, 2)}\n`);
  console.info(
    [
      '本地预演栈已就绪（ADMIN-US-217）：',
      `  网关（Auth / REST / Realtime / Functions）：${local.supabaseUrl}`,
      `  函数：${local.functionUrl}（在线发布：${release}）`,
      `  收件服务：${local.mailUrl}；错误收集器：${local.collectorUrl}`,
      `  三端当前版本：${Object.values(local.web).join('、')}`,
      studio ? '  Studio：http://127.0.0.1:4503' : '  Studio 未启动（local-up -- --studio）',
      `  初始管理员：${ownerEmail}`
    ].join('\n')
  );
}

async function down(volumes) {
  const secrets = await loadEnv();
  const release = (await linkedRelease(siteRoot, 'functions')) ?? 'none';
  await compose(['--profile', 'studio', 'down', ...(volumes ? ['--volumes'] : [])], { secrets, release });
  if (volumes) {
    await rm(stateRoot, { recursive: true, force: true });
    console.info('已停止本地预演栈，并删除数据卷与 .state/（.env.local 保留）');
  } else console.info('已停止本地预演栈；数据卷与 .state/ 保留，local-up 即可恢复');
}

async function status() {
  const secrets = await loadEnv();
  const release = (await linkedRelease(siteRoot, 'functions')) ?? 'none';
  await compose(['--profile', 'studio', 'ps'], { secrets, release });
  console.info(
    `current：${(await linkedRelease(siteRoot, 'current')) ?? '无'}；staged：${(await linkedRelease(siteRoot, 'staged')) ?? '无'}；函数：${release}`
  );
}

const [action, ...flags] = process.argv.slice(2);
if (action === 'up') await up(flags.includes('--studio'));
else if (action === 'down') await down(flags.includes('--volumes'));
else if (action === 'status') await status();
else throw new Error('用法：local-stack.mjs <up|down|status> [--volumes] [--studio]');
