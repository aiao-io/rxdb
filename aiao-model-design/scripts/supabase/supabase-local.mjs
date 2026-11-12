// 本地开发用的 Supabase（Postgres + GoTrue + Kong），只服务登录。
// 用法：node scripts/supabase/supabase-local.mjs <up|down|status|logs|logs-follow>
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

/** 产品根目录 `aiao-model-design/`。 */
export const productRoot = resolve(import.meta.dirname, '../..');

const directory = resolve(productRoot, 'infra/supabase');
const files = {
  envFile: resolve(directory, '.env'),
  portsFile: resolve(directory, 'ports.env'),
  composeFile: resolve(directory, 'docker-compose.yml')
};
const PORTS = ['API_PORT', 'DB_PORT'];
const SECRETS = ['POSTGRES_PASSWORD', 'JWT_SECRET', 'ANON_KEY', 'SERVICE_ROLE_KEY'];
/** 生成的凭据只含这些字符，可以直接放进 SQL 字面量与 compose 插值。 */
const SAFE_VALUE = /^[A-Za-z0-9._-]+$/;

function signedToken(role, secret) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = { role, iss: 'aiao-model-design-local', iat: now, exp: now + 10 * 365 * 86400 };
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/**
 * 首次运行时生成本地 Supabase 的私有凭据（权限 600），文件已存在时原样保留。
 *
 * @param envFile 凭据文件，默认 `infra/supabase/.env`
 * @returns 新建时为 `created`，沿用已有文件时为 `kept`
 */
export async function initializeEnvironment(envFile = files.envFile) {
  const secret = randomBytes(32).toString('hex');
  const values = {
    POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    JWT_SECRET: secret,
    ANON_KEY: signedToken('anon', secret),
    SERVICE_ROLE_KEY: signedToken('service_role', secret)
  };
  const content = Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
  try {
    await writeFile(envFile, `${content}\n`, { flag: 'wx', mode: 0o600 });
    return 'created';
  } catch (error) {
    if (error.code === 'EEXIST') return 'kept';
    throw error;
  }
}

/**
 * 读取本地 Supabase 的凭据与固定端口。端口只认已提交的 `ports.env`，私有凭据文件里的端口不生效。
 *
 * @returns `env` 为合并后的取值；`url` 是 Kong 网关地址；`databaseUrl` 是 postgres 用户的连接串
 */
export async function localEnvironment({ envFile = files.envFile, portsFile = files.portsFile } = {}) {
  const ports = parseEnv(await readFile(portsFile, 'utf8'));
  const source = await readFile(envFile, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('本地 Supabase 还没初始化：先运行 pnpm nx run aiao-model-design:supabase-up。', { cause: error });
  });
  const env = { ...parseEnv(source), ...ports };
  for (const name of PORTS) {
    const port = Number(env[name]);
    if (!/^\d+$/.test(env[name] ?? '') || port < 1024 || port > 65535) throw new Error(`本地端口无效：${name}`);
  }
  if (new Set(PORTS.map(name => env[name])).size !== PORTS.length) throw new Error('本地 Supabase 的端口不能重复。');
  for (const name of SECRETS)
    if (!SAFE_VALUE.test(env[name] ?? '')) throw new Error(`本地凭据缺失或格式无效：${name}`);
  return {
    env,
    url: `http://127.0.0.1:${env.API_PORT}`,
    databaseUrl: `postgresql://postgres:${env.POSTGRES_PASSWORD}@127.0.0.1:${env.DB_PORT}/postgres`
  };
}

/**
 * 把连接、管理与 Auth 用的角色密码同步成 `POSTGRES_PASSWORD`。
 * 数据卷保留而凭据文件重新生成时，库里还是旧密码，GoTrue 会连不上。
 */
export function supabaseRolePasswordSql(password) {
  if (!SAFE_VALUE.test(password)) throw new Error('本地凭据缺失或格式无效：POSTGRES_PASSWORD');
  return ['postgres', 'supabase_admin', 'supabase_auth_admin']
    .map(role => `ALTER ROLE ${role} PASSWORD '${password}';`)
    .join('\n');
}

/** 在产品根目录运行命令，输出直接给终端；非零退出时报错。 */
export function run(command, args, { input, env = process.env } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: productRoot,
      env,
      stdio: [input ? 'pipe' : 'inherit', 'inherit', 'inherit']
    });
    if (input) child.stdin.end(input);
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      code === 0 ? resolveRun() : reject(new Error(`${command} ${args[0]} 退出：${code ?? signal}`))
    );
  });
}

/** 用本产品的凭据、端口与 compose 文件执行 docker compose；shell 里的同名变量不参与插值。 */
async function compose(args, options = {}) {
  const { env } = await localEnvironment();
  const base = ['compose', '--env-file', files.envFile, '--env-file', files.portsFile, '-f', files.composeFile];
  return run('docker', [...base, ...args], { ...options, env: { ...process.env, ...env } });
}

async function up() {
  const state = await initializeEnvironment();
  console.log(state === 'created' ? '已生成本地 Supabase 凭据：infra/supabase/.env' : '沿用已有的本地 Supabase 凭据。');
  await compose(['up', '-d', '--wait', '--wait-timeout', '180', 'db']);
  const { env } = await localEnvironment();
  await compose(['exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'], {
    input: supabaseRolePasswordSql(env.POSTGRES_PASSWORD)
  });
  await compose(['up', '-d', '--wait', '--wait-timeout', '180', 'auth', 'kong']);
  const { url } = await localEnvironment();
  console.log(`本地 Supabase 已就绪：Auth ${url}/auth/v1 · PostgreSQL 127.0.0.1:${env.DB_PORT}`);
}

const ACTIONS = {
  up,
  async down() {
    await compose(['down']);
    console.log('已停止本地 Supabase，数据卷保留。');
  },
  status: () => compose(['ps']),
  logs: () => compose(['logs', '--tail', '60']),
  'logs-follow': () => compose(['logs', '--tail', '60', '--follow'])
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const action = ACTIONS[process.argv[2]];
  if (!action) {
    console.error(`用法：node scripts/supabase/supabase-local.mjs <${Object.keys(ACTIONS).join('|')}>`);
    process.exitCode = 1;
  } else {
    await action().catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
