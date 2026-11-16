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
  const directory = await mkdtemp(resolve(tmpdir(), 'aiao-media-supervise-'));
  try {
    await run(resolve(directory, 'pids.json'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const gone = (...pids) => pids.every(pid => !alive(pid));

test('the process tree lists the root and every descendant breadth first', () => {
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

test('the supervised command exit code is returned unchanged', async () => {
  assert.equal(await supervise(process.execPath, ['-e', 'process.exit(3)']), 3);
});

test('a command ended by a signal reports the shell style 128 plus signal number', async () => {
  assert.equal(await supervise(process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM')"]), 143);
});

test('a command that cannot start is reported instead of hanging', async () => {
  await assert.rejects(supervise('aiao-media-missing-command', []), { code: 'ENOENT' });
});

test('the whole tree stops once the launcher disappears', async () => {
  await withPidFile(async file => {
    let launcherGone = false;
    const running = supervise(process.execPath, ['-e', family, file], {
      pollMs: 20,
      graceMs: 2000,
      parentGone: () => launcherGone
    });
    const { child, grandchild } = await until(() => recordedPids(file), 'the supervised tree did not start');
    launcherGone = true;
    await running;
    assert.ok(gone(child, grandchild));
  });
});

test('a process that ignores SIGTERM is killed after the grace period', async () => {
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

test('SIGTERM sent to the supervisor stops the whole tree and then the supervisor', async () => {
  await withPidFile(async file => {
    const supervisor = spawn(process.execPath, [script, process.execPath, '-e', family, file], { stdio: 'ignore' });
    const exited = new Promise(resolveExit => supervisor.once('exit', resolveExit));
    const { child, grandchild } = await until(() => recordedPids(file), 'the supervised tree did not start');
    supervisor.kill('SIGTERM');
    await exited;
    assert.ok(gone(child, grandchild));
  });
});

test('a launcher killed with SIGKILL cannot leave the supervised tree behind', async () => {
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
    const { supervisor, child, grandchild } = await until(
      () => recordedPids(file),
      'the supervised tree did not start'
    );
    launcher.kill('SIGKILL');
    await until(() => gone(supervisor, child, grandchild), 'the supervised tree outlived its launcher');
  });
});
