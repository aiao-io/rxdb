import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const composeScript = resolve(import.meta.dirname, '../../../../docker/supabase-ci-compose.sh');

/**
 * 对本 checkout 的隔离 Supabase 栈执行 docker compose 子命令，返回 stdout。
 *
 * @remarks
 * 经 `docker/supabase-ci-compose.sh`：项目名与容器名和 `rxdb-adapter-supabase:test-env` 起栈时逐字一致。
 */
export async function compose(args) {
  const { stdout } = await execute(composeScript, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/**
 * 解析 `docker compose port` 的输出（`0.0.0.0:55001`、`[::]:55001`、`127.0.0.1:63915`）。
 *
 * @throws {@link Error} 输出里没有已发布的宿主端口时
 */
export function parsePublishedPort(output) {
  const port = Number(/:(\d+)\s*$/.exec(output)?.[1]);
  if (!port) throw new Error(`docker compose port 没有给出已发布的宿主端口：${JSON.stringify(output)}`);
  return port;
}

async function publishedPort(run, service, containerPort) {
  try {
    return parsePublishedPort(await run(['port', service, String(containerPort)]));
  } catch (error) {
    throw new Error(
      `本 checkout 的 Supabase 栈里 ${service} 没有运行：用 pnpm nx dev dev-rxdb-supabase 一键启动，或先运行 pnpm nx run rxdb-adapter-supabase:test-env。`,
      { cause: error }
    );
  }
}

/**
 * 读取运行中的隔离栈：compose 项目名、应用直连的 API 网关地址与公开的 anon key。
 *
 * @param run - 执行 compose 子命令的方式，测试时替换
 */
export async function readLocalStack(run = compose) {
  const [config, kongPort] = await Promise.all([
    run(['config', '--format', 'json']).then(JSON.parse),
    publishedPort(run, 'kong', 8000)
  ]);
  const anonKey = config.services.kong.environment.SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error('docker-compose.ci.yml 的 kong 服务没有配置 SUPABASE_ANON_KEY');
  return { project: config.name, url: `http://localhost:${kongPort}`, anonKey };
}

/**
 * 读取叠加在隔离栈上的 Studio 地址。
 *
 * @param run - 执行 compose 子命令的方式，测试时替换
 */
export async function readStudioUrl(run = compose) {
  return `http://127.0.0.1:${await publishedPort(run, 'studio', 3000)}`;
}
