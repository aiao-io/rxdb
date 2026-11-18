/**
 * 子进程与 HTTP 的小工具：本地预演的脚本用它们调用 docker compose、Nx 目标与栈里的各个接口。
 * 子进程的环境显式传入；失败时只报命令名与退出码，不把环境变量（含密钥）写进错误消息。
 */
import { spawn } from 'node:child_process';
import { composeFile, composeProject, envFile, workspaceRoot } from './paths.mjs';

/**
 * 运行一个命令；`capture` 为 true 时收集标准输出并返回，否则直接继承终端。退出码非 0 时抛错。
 * @param {string} command
 * @param {string[]} args
 * @param {{ env?: Record<string, string | undefined>, cwd?: string, input?: string, capture?: boolean, quiet?: boolean }} [options]
 * @returns {Promise<string>} 标准输出（`capture` 时）
 */
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? workspaceRoot,
      env: options.env ?? process.env,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', options.capture ? 'pipe' : 'inherit', options.quiet ? 'pipe' : 'inherit']
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => (stdout += chunk));
    child.stderr?.on('data', chunk => (stderr += chunk));
    if (options.input !== undefined) child.stdin.end(options.input);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve(stdout);
      else {
        const detail = options.quiet && stderr.trim() ? `：${stderr.trim().split('\n').slice(-3).join(' / ')}` : '';
        reject(new Error(`${command} ${args.slice(0, 3).join(' ')} 退出码 ${code ?? signal}${detail}`));
      }
    });
  });
}

/**
 * 调用本栈的 docker compose（固定项目名、compose 文件与 `.env.local`）。`.env.local` 的值覆盖终端里的同名变量，
 * `ADMIN_RELEASE` 显式传入（函数容器的发布标识），避免一次无关的 `up` 用默认值重建函数容器。
 * @param {string[]} args
 * @param {{ secrets: Record<string, string>, release: string, env?: Record<string, string>, capture?: boolean, quiet?: boolean, input?: string }} options
 */
export function compose(args, options) {
  return run('docker', ['compose', '-p', composeProject, '-f', composeFile, '--env-file', envFile, ...args], {
    env: { ...process.env, ...options.secrets, ADMIN_RELEASE: options.release, ...options.env },
    capture: options.capture,
    quiet: options.quiet,
    input: options.input
  });
}

/**
 * 运行一个 Nx 目标（`pnpm nx …`），与生产流水线执行同样的仓库命令。Nx 不开守护进程、不连 Nx Cloud、不用交互界面。
 * @param {string[]} args
 * @param {Record<string, string>} [env]
 */
export function nx(args, env = {}) {
  return run('pnpm', ['nx', ...args], {
    env: { ...process.env, NX_DAEMON: 'false', NX_NO_CLOUD: 'true', NX_TUI: 'false', ...env }
  });
}

/** 带超时的 fetch：本机接口都应在几秒内应答。 */
export function request(url, init = {}, timeoutMs = 10_000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * 反复执行 `probe` 直到它返回真值或超时；超时抛出带说明的错误（含最后一次的失败原因）。
 * @template T
 * @param {string} what 等待的是什么（写进超时错误）
 * @param {() => Promise<T | undefined | false>} probe
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function waitFor(what, probe, options = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  let last = '';
  for (;;) {
    try {
      const value = await probe();
      if (value) return value;
      last = '条件未满足';
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) throw new Error(`等待${what}超时（${last}）`);
    await new Promise(resolve => setTimeout(resolve, options.intervalMs ?? 500));
  }
}
