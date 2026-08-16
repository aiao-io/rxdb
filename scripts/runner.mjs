/**
 * scripts/runner.mjs
 *
 * `child_process.spawn` 的薄封装：
 *   - 默认 `stdio: 'inherit'`，子进程 stdout/stderr 直接透传；
 *   - `shell: true`，Windows 上 .cmd / .bat 也能跑；
 *   - 非零退出码打印红字命令后 reject，方便上层 `await` 链路上抛出。
 *
 * `collect=true` 时改为收集 stdout 第一行内容 resolve 出去（用于拿版本号等场景）。
 * 不要在 collect 模式下让子进程输出大量内容 —— 当前实现只取第一行，多余数据会被丢弃。
 *
 * 第四参 `extra` 会并进 spawn options；`extra.env` 与 `process.env` 合并，
 * 方便 postinstall 这类场景单独关掉 Nx daemon / Cloud。
 */

import chalk from 'chalk';
import { spawn } from 'node:child_process';

/**
 * 运行命令并等待子进程退出。
 * @param {string} command 命令（如 `pnpm` / `git`）
 * @param {string[]} args 参数数组
 * @param {boolean} [collect=false] 是否收集 stdout 第一行内容；为 true 时由 collect 分支 resolve 字符串
 * @param {import('node:child_process').SpawnOptions} [extra] 额外 spawn 选项
 * @returns {Promise<null | string>} collect=false 时 resolve null；collect=true 时 resolve stdout 首行（去掉尾部换行）
 */
export function run(command, args, collect = false, extra = {}) {
  const options = {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
    ...extra,
    env: extra.env ? { ...process.env, ...extra.env } : process.env
  };
  return new Promise((resolve, reject) => {
    const child = spawn(`${command}`, args, options);

    if (collect) {
      child.stdout?.on('data', data => {
        // 只取首行并去掉换行，调用方应当预期这是一行单值（如 `git rev-parse HEAD`）。
        resolve(data.toString().replace(/\r\n|\n/, ''));
      });
    }
    child.on('close', code => {
      if (code === 0) {
        resolve(null);
        return;
      }
      const failed = `${command} ${args.join(' ')}`;
      console.error(chalk.red(failed));
      reject(new Error(`${failed} failed with exit code ${code}`));
    });
  });
}
