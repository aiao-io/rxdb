// 本地开发用的 Trigger.dev 自托管实例。
// 用法：node scripts/trigger/trigger-local.mjs <up|down|status|logs|logs-follow>
import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { initializeEnvironment as initializeSupabaseEnvironment } from '../supabase/supabase-local.mjs';

export const productRoot = resolve(import.meta.dirname, '../..');
export const triggerRoot = resolve(productRoot, 'infra/trigger');
export const files = {
  envFile: resolve(triggerRoot, '.env'),
  composeFile: resolve(productRoot, 'infra/supabase/docker-compose.yml'),
  registryAuthFile: resolve(triggerRoot, 'registry/auth.htpasswd')
};

const TRIGGER_PORT = 8030;
const TRIGGER_SERVICES = [
  'postgres',
  'redis',
  'electric',
  'clickhouse',
  'registry',
  'minio',
  's2-init',
  's2',
  'docker-proxy',
  'supervisor',
  'webapp'
];
const REQUIRED = [
  'SESSION_SECRET',
  'MAGIC_LINK_SECRET',
  'ENCRYPTION_KEY',
  'PROVIDER_SECRET',
  'COORDINATOR_SECRET',
  'MANAGED_WORKER_SECRET',
  'POSTGRES_PASSWORD',
  'CLICKHOUSE_PASSWORD',
  'OBJECT_STORE_SECRET_ACCESS_KEY',
  'DOCKER_REGISTRY_PASSWORD'
];
const SAFE_VALUE = /^[A-Za-z0-9._-]+$/;

function secret() {
  return randomBytes(16).toString('hex');
}

export function hostAddress(networkInterfaces = os.networkInterfaces()) {
  const configured = process.env.TRIGGER_OBJECT_STORE_HOST?.trim();
  if (configured) return configured;
  const entries = Object.entries(networkInterfaces).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter(address => address.family === 'IPv4' && !address.internal)
      .map(address => ({ name, address: address.address }))
  );
  const preferred = entries.find(({ name }) => !/^(docker|br-|veth|bridge)/i.test(name));
  return (preferred ?? entries[0])?.address ?? '127.0.0.1';
}

function generatedEnvironment() {
  const registryPassword = secret();
  const objectStoreSecret = secret();
  return {
    SESSION_SECRET: secret(),
    MAGIC_LINK_SECRET: secret(),
    ENCRYPTION_KEY: secret(),
    PROVIDER_SECRET: secret(),
    COORDINATOR_SECRET: secret(),
    MANAGED_WORKER_SECRET: secret(),
    POSTGRES_PASSWORD: secret(),
    CLICKHOUSE_PASSWORD: secret(),
    OBJECT_STORE_ACCESS_KEY_ID: 'admin',
    OBJECT_STORE_DEFAULT_PROTOCOL: 'minio',
    OBJECT_STORE_MINIO_BASE_URL: `http://${hostAddress()}:9000`,
    OBJECT_STORE_MINIO_BUCKET: 'packets',
    OBJECT_STORE_MINIO_ACCESS_KEY_ID: 'admin',
    OBJECT_STORE_MINIO_SECRET_ACCESS_KEY: objectStoreSecret,
    OBJECT_STORE_MINIO_REGION: 'us-east-1',
    OBJECT_STORE_MINIO_SERVICE: 's3',
    OBJECT_STORE_SECRET_ACCESS_KEY: objectStoreSecret,
    DOCKER_REGISTRY_URL: 'localhost:5000',
    DOCKER_REGISTRY_USERNAME: 'registry-user',
    DOCKER_REGISTRY_PASSWORD: registryPassword,
    DOCKER_REGISTRY_NAMESPACE: 'trigger',
    TRIGGER_IMAGE_TAG: 'latest',
    APP_ORIGIN: `http://127.0.0.1:${TRIGGER_PORT}`,
    LOGIN_ORIGIN: `http://127.0.0.1:${TRIGGER_PORT}`,
    API_ORIGIN: `http://127.0.0.1:${TRIGGER_PORT}`,
    DEV_OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${TRIGGER_PORT}/otel`,
    WEBAPP_PUBLISH_IP: '127.0.0.1',
    POSTGRES_PUBLISH_IP: '127.0.0.1',
    REDIS_PUBLISH_IP: '127.0.0.1',
    CLICKHOUSE_PUBLISH_IP: '127.0.0.1',
    REGISTRY_PUBLISH_IP: '127.0.0.1',
    MINIO_PUBLISH_IP: '0.0.0.0',
    REALTIME_STREAMS_S2_ENDPOINT: `http://${hostAddress()}:8050/v1`,
    S2_PUBLISH_IP: '0.0.0.0',
    S2_PUBLISH_PORT: '8050',
    NODE_MAX_OLD_SPACE_SIZE: '2048',
    EVENT_REPOSITORY_DEFAULT_STORE: 'postgres'
  };
}

function envText(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

/** 首次运行生成 Trigger 自托管栈的私有凭据，已有文件原样保留。 */
export async function initializeEnvironment(envFile = files.envFile) {
  const values = generatedEnvironment();
  await mkdir(resolve(envFile, '..'), { recursive: true });
  try {
    await writeFile(envFile, envText(values), { flag: 'wx', mode: 0o600 });
    await chmod(envFile, 0o600);
    return 'created';
  } catch (error) {
    if (error.code === 'EEXIST') return 'kept';
    throw error;
  }
}

export async function migrateLocalEndpoints(envFile = files.envFile) {
  const source = await readFile(envFile, 'utf8');
  const env = parseEnv(source);
  const host = hostAddress();
  const values = {};
  const hasInternalObjectStoreEndpoint = [env.OBJECT_STORE_BASE_URL, env.OBJECT_STORE_MINIO_BASE_URL].includes('http://minio:9000');
  const hasInternalS2Endpoint = !env.REALTIME_STREAMS_S2_ENDPOINT || env.REALTIME_STREAMS_S2_ENDPOINT === 'http://s2/v1';

  if (hasInternalObjectStoreEndpoint) {
    values.OBJECT_STORE_BASE_URL = `http://${host}:9000`;
    values.OBJECT_STORE_MINIO_BASE_URL = `http://${host}:9000`;
    values.MINIO_PUBLISH_IP = '0.0.0.0';
  }
  if (hasInternalS2Endpoint) values.REALTIME_STREAMS_S2_ENDPOINT = `http://${host}:8050/v1`;
  if (!env.S2_PUBLISH_IP) values.S2_PUBLISH_IP = '0.0.0.0';
  if (!env.S2_PUBLISH_PORT) values.S2_PUBLISH_PORT = '8050';
  if (!Object.keys(values).length) return false;

  const lines = source.split(/\r?\n/);
  const updated = new Set();
  const next = lines.map(line => {
    const key = line.split('=', 1)[0];
    if (!(key in values)) return line;
    updated.add(key);
    return `${key}=${values[key]}`;
  });
  for (const [key, value] of Object.entries(values)) {
    if (!updated.has(key)) next.push(`${key}=${value}`);
  }
  await writeFile(envFile, next.join('\n'));
  await chmod(envFile, 0o600);
  return true;
}

export async function localEnvironment(envFile = files.envFile) {
  const source = await readFile(envFile, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('本地 Trigger.dev 还没初始化：先运行 pnpm nx run aiao-model-design:trigger-up。', { cause: error });
  });
  const env = parseEnv(source);
  for (const name of REQUIRED) {
    if (!SAFE_VALUE.test(env[name] ?? '')) throw new Error(`本地 Trigger.dev 凭据缺失或格式无效：${name}`);
  }
  return env;
}

function run(command, args, { env = process.env, input } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: productRoot,
      env,
      stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit']
    });
    if (input !== undefined) child.stdin.end(input);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolveRun();
      reject(Object.assign(new Error(`${command} ${args[0]} 退出：${code ?? signal}`), { code, signal }));
    });
  });
}

function capture(command, args, { env = process.env, input = '' } = {}) {
  return new Promise((resolveCapture, reject) => {
    const child = spawn(command, args, { cwd: productRoot, env, stdio: ['pipe', 'pipe', 'inherit'] });
    let output = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stdin.end(input);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolveCapture(output);
      reject(Object.assign(new Error(`${command} ${args[0]} 退出：${code ?? signal}`), { code, signal }));
    });
  });
}

async function registryAuth(env) {
  await mkdir(resolve(files.registryAuthFile, '..'), { recursive: true });
  try {
    await readFile(files.registryAuthFile);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const output = await capture(
    'docker',
    ['run', '--rm', '-i', 'httpd:2', 'htpasswd', '-Bni', env.DOCKER_REGISTRY_USERNAME],
    { input: `${env.DOCKER_REGISTRY_PASSWORD}\n` }
  );
  const line = output.trim().split('\n').find(value => value.startsWith(`${env.DOCKER_REGISTRY_USERNAME}:`));
  if (!line) throw new Error('无法生成本地 Trigger.dev registry 的认证文件。');
  await writeFile(files.registryAuthFile, `${line}\n`, { mode: 0o600 });
  await chmod(files.registryAuthFile, 0o600);
}

export function composeArgs(args) {
  return [
    'compose',
    '--project-name',
    'aiao-model-design-trigger',
    '--env-file',
    resolve(productRoot, 'infra/supabase/.env'),
    '--env-file',
    resolve(productRoot, 'infra/supabase/ports.env'),
    '-f',
    files.composeFile,
    ...args
  ];
}

export function parseDevelopmentCredentials(output) {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [secretKey, projectRef] = line.split('\t');
      return { secretKey, projectRef };
    });
}

/** 读取本地自托管实例中的 Development runtime key，不输出密钥到终端。 */
export async function findLocalDevelopmentCredentials() {
  const sql = `SELECT r."apiKey", p."externalRef"
    FROM public."RuntimeEnvironment" r
    JOIN public."Project" p ON p."id" = r."projectId"
    WHERE r."type"::text = 'DEVELOPMENT'
      AND r."archivedAt" IS NULL
      AND p."deletedAt" IS NULL
      AND r."apiKey" ~ '^tr_dev_(sk_)?[A-Za-z0-9]+$'
    ORDER BY p."name", r."createdAt"`;
  const output = await capture('docker', [
    ...composeArgs(['exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'main', '-At', '-F', '\t', '-c', sql])
  ]);
  return parseDevelopmentCredentials(output);
}

async function compose(args) {
  const env = await localEnvironment();
  return run('docker', composeArgs(args), { env: { ...process.env, ...env } });
}

async function waitForHealth() {
  const deadline = Date.now() + 180_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${TRIGGER_PORT}/healthcheck`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 2000));
  }
  throw new Error(`本地 Trigger.dev 健康检查失败：${lastError?.message ?? '超时'}；运行 trigger-logs 查看容器日志。`);
}

export async function up() {
  await initializeSupabaseEnvironment();
  const state = await initializeEnvironment();
  await migrateLocalEndpoints();
  const env = await localEnvironment();
  await registryAuth(env);
  console.log(state === 'created' ? '已生成本地 Trigger.dev 凭据：infra/trigger/.env' : '沿用已有的本地 Trigger.dev 凭据。');
  await compose(['up', '-d', ...TRIGGER_SERVICES]);
  await waitForHealth();
  console.log(`本地 Trigger.dev 已就绪：${env.API_ORIGIN} · 健康检查 ${env.API_ORIGIN}/healthcheck`);
}

const ACTIONS = {
  up,
  down: () => compose(['down']),
  status: () => compose(['ps']),
  logs: () => compose(['logs', '--tail', '80']),
  'logs-follow': () =>
    compose(['logs', '--tail', '80', '--follow']).catch(error => {
      if (!error.signal && ![130, 143].includes(error.code)) throw error;
    })
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const action = ACTIONS[process.argv[2]];
  if (!action) {
    console.error(`用法：node scripts/trigger/trigger-local.mjs <${Object.keys(ACTIONS).join('|')}>`);
    process.exitCode = 1;
  } else {
    await action().catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
