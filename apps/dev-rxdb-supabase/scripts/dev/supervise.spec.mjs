import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { processTree, supervise } from './supervise.mjs';

const script = resolve(import.meta.dirname, 'supervise.mjs');
const idle = 'setInterval(() => undefined, 1000)';
const family = `
  const { spawn } = require('node:child_process');
  const { writeFileSync } = require('node:fs');
  const grandchild = spawn(process.execPath, ['-e', ${JSON.stringify(idle)}], { stdio: 'ignore' });
  writeFileSync(process.argv[1], JSON.stringify({ supervisor: process.ppid, child: process.pid, grandchild: grandchild.pid }));
  ${idle};
`;

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const gone = (...pids) => pids.every(pid => !alive(pid));

async function until(check, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(25);
  }
  assert.fail(message);
}

async function recordedPids(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

async function withPidFile(run) {
  const directory = await mkdtemp(resolve(tmpdir(), 'dev-rxdb-supabase-supervise-'));
  try {
    await run(resolve(directory, 'pids.json'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('进程树按广度优先列出根与全部后代', () => {
  const table = [
    { pid: 10, ppid: 1 },
    { pid: 11, ppid: 10 },
    { pid: 12, ppid: 10 },
    { pid: 13, ppid: 11 },
    { pid: 20, ppid: 1 },
    { pid: 21, ppid: 20 }
  ];
  assert.deepEqual(processTree(10, table), [10, 11, 12, 13]);
  assert.deepEqual(processTree(99, table), [99]);
});

test('被托管命令的退出码原样返回', async () => {
  assert.equal(await supervise(process.execPath, ['-e', 'process.exit(3)']), 3);
});

test('被信号终止的命令按 shell 惯例返回 128 加信号编号', async () => {
  assert.equal(await supervise(process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM')"]), 143);
});

test('起不来的命令直接报错，不挂住', async () => {
  await assert.rejects(supervise('dev-rxdb-supabase-missing-command', []), { code: 'ENOENT' });
});

test('启动者消失后整棵进程树一起停掉', async () => {
  await withPidFile(async file => {
    let launcherGone = false;
    const running = supervise(process.execPath, ['-e', family, file], {
      pollMs: 20,
      graceMs: 2000,
      parentGone: () => launcherGone
    });
    const { child, grandchild } = await until(() => recordedPids(file), '被托管的进程树没有起来');
    launcherGone = true;
    await running;
    assert.ok(gone(child, grandchild));
  });
});

test('无视 SIGTERM 的进程在宽限期后被 SIGKILL', async () => {
  let launcherGone = false;
  const ignoring = "process.on('SIGTERM', () => undefined); setInterval(() => undefined, 1000)";
  const running = supervise(process.execPath, ['-e', ignoring], {
    pollMs: 20,
    graceMs: 200,
    parentGone: () => launcherGone
  });
  await delay(300);
  launcherGone = true;
  assert.equal(await running, 137);
});

test('托管进程收到 SIGTERM 时先停掉整棵树再退出', async () => {
  await withPidFile(async file => {
    const supervisor = spawn(process.execPath, [script, process.execPath, '-e', family, file], { stdio: 'ignore' });
    const exited = new Promise(resolveExit => supervisor.once('exit', resolveExit));
    const { child, grandchild } = await until(() => recordedPids(file), '被托管的进程树没有起来');
    supervisor.kill('SIGTERM');
    await exited;
    assert.ok(gone(child, grandchild));
  });
});

test('启动者被 SIGKILL 也留不下孤儿进程', async () => {
  await withPidFile(async file => {
    const launch = `
      const { spawn } = require('node:child_process');
      const [script, ...command] = process.argv.slice(1);
      spawn(process.execPath, [script, ...command], { stdio: 'ignore' });
      setInterval(() => undefined, 1000);
    `;
    const launcher = spawn(process.execPath, ['-e', launch, script, process.execPath, '-e', family, file], {
      stdio: 'ignore'
    });
    const { supervisor, child, grandchild } = await until(() => recordedPids(file), '被托管的进程树没有起来');
    launcher.kill('SIGKILL');
    await until(() => gone(supervisor, child, grandchild), '被托管的进程树比启动者活得久');
  });
});
