// 本地开发用的 Trigger.dev 自托管实例。
// 用法：node scripts/trigger/trigger-local.mjs <up|down|status|logs|logs-follow>
import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

export const productRoot = resolve(import.meta.dirname, '../..');
export const triggerRoot = resolve(productRoot, 'infra/trigger');
export const files = {
  envFile: resolve(triggerRoot, '.env'),
  webappComposeFile: resolve(triggerRoot, 'webapp-compose.yml'),
  workerComposeFile: resolve(triggerRoot, 'worker-compose.yml'),
  registryAuthFile: resolve(triggerRoot, 'registry/auth.htpasswd')
};

const TRIGGER_PORT = 8030;
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

function generatedEnvironment() {
  const registryPassword = secret();
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
    OBJECT_STORE_SECRET_ACCESS_KEY: secret(),
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
    MINIO_PUBLISH_IP: '127.0.0.1',
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
    files.envFile,
    '-f',
    files.webappComposeFile,
    '-f',
    files.workerComposeFile,
    ...args
  ];
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
  const state = await initializeEnvironment();
  const env = await localEnvironment();
  await registryAuth(env);
  console.log(state === 'created' ? '已生成本地 Trigger.dev 凭据：infra/trigger/.env' : '沿用已有的本地 Trigger.dev 凭据。');
  await compose(['up', '-d', '--wait', '--wait-timeout', '300']);
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
