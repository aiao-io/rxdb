import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const mode = process.argv[2];
const forwardedArgs = process.argv.slice(3);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

if (mode !== 'local' && mode !== 'remote') {
  throw new Error('Usage: node apps/dev-rxdb-supabase/scripts/serve.mjs <local|remote> [...serve options]');
}

async function remoteEnv() {
  const envPath = resolve(workspaceRoot, '.env');
  // P2-6：原先这里是一个手写 `parseEnv` —— 只按第一个 `=` 切分，不处理引号、
  // 行内注释、`export ` 前缀。写着 `VITE_SUPABASE_KEY="sb_publishable_xxx"` 的 `.env`
  // 会把**引号一起**当成 key 的一部分，然后在浏览器里报一个和原因毫无关系的鉴权错误。
  // Node 22+ 自带 `util.parseEnv`，与 dotenv 的语义一致。
  const fileEnv = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_KEY || fileEnv.VITE_SUPABASE_KEY;

  if (!url || !key) {
    throw new Error('Remote mode requires VITE_SUPABASE_URL and VITE_SUPABASE_KEY.');
  }

  try {
    await fetch(url, { signal: AbortSignal.timeout(3_000) });
  } catch (error) {
    // P2-6：原先是 `catch {}` + 一个不带 cause 的新 Error —— 原始异常被整个丢掉。
    // "连不上"有很多种：DNS 解析失败、证书错误、3 秒超时、连接被拒，
    // 排查时需要的恰恰是这条被丢掉的信息。
    throw new Error(
      `Supabase is not reachable at ${url}. Start it with: docker compose -f docker/docker-compose.ci.yml up -d`,
      { cause: error }
    );
  }

  return { VITE_SUPABASE_KEY: key, VITE_SUPABASE_URL: url };
}

/**
 * 本地模式必须把 Supabase 变量彻底移出子进程环境，两步缺一不可：
 *
 * 1. `delete` 而不是赋空串。空串是唯一撑不过 Nx/dotenv 往返的取值：dotenv-expand
 *    用真值判断是否保留 processEnv 里的既有值，`''` 落到 else 分支被工作区 `.env`
 *    覆写，于是「本地模式」会静默连上 `.env` 里的 Supabase。
 * 2. `NX_LOAD_DOT_ENV_FILES=false`（必须是精确字符串）。否则 Nx 会在删完之后
 *    再次从 `.env` 把变量灌回任务环境。
 *
 * 远端模式不受影响：非空值本来就能原样传到 Vite。
 */
function localEnv() {
  const env = { ...process.env };
  delete env.VITE_SUPABASE_URL;
  delete env.VITE_SUPABASE_KEY;
  env.NX_LOAD_DOT_ENV_FILES = 'false';
  return env;
}

const childEnv = mode === 'local' ? localEnv() : { ...process.env, ...(await remoteEnv()) };
const child = spawn('pnpm', ['nx', 'run', 'dev-rxdb-supabase:serve', ...forwardedArgs], {
  cwd: workspaceRoot,
  env: childEnv,
  stdio: 'inherit'
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', code => process.exit(code ?? 1));
