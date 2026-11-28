import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const stopSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'];

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function signal(pid, name) {
  try {
    process.kill(pid, name);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function processTable() {
  const { stdout } = await execute('ps', ['-Ao', 'pid=,ppid=']);
  return stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [pid, ppid] = line.trim().split(/\s+/).map(Number);
      return { pid, ppid };
    });
}

/**
 * 按广度优先列出 `root` 及其全部后代进程。
 *
 * @param table - `ps` 读出的 pid / ppid 表
 */
export function processTree(root, table) {
  const children = Map.groupBy(table, row => row.ppid);
  const tree = [root];
  for (const pid of tree) tree.push(...(children.get(pid) ?? []).map(row => row.pid));
  return tree;
}

async function terminateTree(root, graceMs) {
  if (process.platform === 'win32') return execute('taskkill', ['/pid', String(root), '/T', '/F']);
  const tree = processTree(root, await processTable());
  for (const pid of tree) signal(pid, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (tree.some(alive) && Date.now() < deadline) await delay(50);
  for (const pid of tree.filter(alive)) signal(pid, 'SIGKILL');
}

function watchParent(parent = process.ppid) {
  return () => process.ppid !== parent || !alive(parent);
}

/**
 * 运行常驻命令，启动者消失或收到停止信号时收掉整棵进程树。
 *
 * @returns 命令的退出码；被信号终止时按 shell 惯例为 128 加信号编号
 *
 * @remarks
 * Nx 以独立会话启动子进程，自己被 SIGKILL 时来不及清理；没有这一层，dev server 与起始页会成为孤儿占住固定端口。
 */
export function supervise(command, args, { pollMs = 1000, graceMs = 8000, parentGone = watchParent() } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    let termination;
    const stop = () => {
      termination ??= terminateTree(child.pid, graceMs).catch(rejectRun);
    };
    const watcher = setInterval(() => parentGone() && stop(), pollMs);
    for (const name of stopSignals) process.on(name, stop);
    const settle = (finish, value) => {
      clearInterval(watcher);
      for (const name of stopSignals) process.off(name, stop);
      Promise.resolve(termination).then(() => finish(value));
    };
    child.once('error', error => settle(rejectRun, error));
    child.once('exit', (code, name) => settle(resolveRun, code ?? 128 + constants.signals[name]));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  try {
    process.exitCode = await supervise(command, args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
