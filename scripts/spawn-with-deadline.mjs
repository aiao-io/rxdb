/**
 * scripts/spawn-with-deadline.mjs
 *
 * 给子进程加墙钟时限的 `child_process.spawn`：
 *   - 到 `deadlineMs` 仍未退出，先发 SIGTERM，让子进程有机会收尾（vitest 会关掉它起的浏览器）；
 *   - 再过 `graceMs` 还在，发 SIGKILL；
 *   - 结果里带 `timedOut`，调用方据此把「挂死」与「跑完但失败」分开报告。
 *
 * 为什么需要：浏览器页面或 Worker 卡死时，vitest 的 test / hook 超时跑在同一个被卡住的页面里，
 * 根本触发不了，子进程会一直静默挂到 CI job 超时被取消 —— 没有任何一行说明是哪一段挂了。
 *
 * 只杀直接子进程，不杀进程组：以 `detached` 起进程组会让终端 Ctrl+C 传不到子进程。
 * SIGKILL 后残留的孙进程（如 chromium）由 CI runner 结束时的 orphan 清理回收。
 */

import { spawn } from 'node:child_process';

/**
 * 运行命令并等它退出或超时。
 *
 * @param {string} command 可执行文件
 * @param {string[]} args 参数数组
 * @param {import('node:child_process').SpawnOptions} options spawn 选项
 * @param {{ deadlineMs: number, graceMs: number }} deadline 墙钟时限与 SIGTERM → SIGKILL 的宽限期（毫秒）
 * @returns {Promise<{ code: number | null, signal: NodeJS.Signals | null, timedOut: boolean } | { error: Error, timedOut: false }>}
 *   正常或被杀退出时交出退出码与信号；进程起不来时交出 `error`
 */
export function spawnWithDeadline(command, args, options, { deadlineMs, graceMs }) {
  return new Promise(resolve => {
    const child = spawn(command, args, options);
    let timedOut = false;
    let killTimer;
    const termTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), graceMs);
    }, deadlineMs);
    const clearTimers = () => {
      clearTimeout(termTimer);
      clearTimeout(killTimer);
    };

    child.on('error', error => {
      clearTimers();
      resolve({ error, timedOut: false });
    });
    child.on('exit', (code, signal) => {
      clearTimers();
      resolve({ code, signal, timedOut });
    });
  });
}
