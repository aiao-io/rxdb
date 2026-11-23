import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test as nodeTest } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { runProcess } from './run-process.mjs';

/** 进程组语义只在 POSIX 上有（发布在 macOS 本机跑；Windows 的全量 CI 不测它）。 */
const skip = process.platform === 'win32' && 'run-process 只支持 POSIX 的进程组';
const test = (name, options, run) =>
  run ? nodeTest(name, { skip, ...options }, run) : nodeTest(name, { skip }, options);

/** 子进程脚本都带自毁定时器：就算断言失败、没被终止，也会在 20 秒内自己退出，不会留下孤儿。 */
const SELF_DESTRUCT = 'setTimeout(() => process.exit(0), 20000);';
const run = (script, options) =>
  runProcess(process.execPath, ['-e', script], { label: 'fake wrangler', timeoutMs: 15_000, ...options });

/** 子进程把它拉起的孙进程的 pid 写进文件（超时要连孙进程一起终止：pnpm dlx 之下还有 node 与 wrangler）。 */
const TREE = `
  const { spawn } = require('node:child_process');
  const grandchild = spawn(process.execPath, ['-e', '${SELF_DESTRUCT}'], { stdio: 'ignore' });
  require('node:fs').writeFileSync(process.env.PID_FILE, String(grandchild.pid));
  ${SELF_DESTRUCT}`;
/** 忽略 SIGTERM 的子进程，只有 SIGKILL 能结束它。 */
const STUBBORN = `
  require('node:fs').writeFileSync(process.env.PID_FILE, String(process.pid));
  process.on('SIGTERM', () => {});
  ${SELF_DESTRUCT}`;

async function pidFile(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aiao-desktop-run-process-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'pid');
  return {
    env: { ...process.env, PID_FILE: file },
    async read() {
      for (;;) {
        try {
          return Number(await readFile(file, 'utf8'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await sleep(20);
        }
      }
    }
  };
}

/** `kill(pid, 0)` 只探测进程在不在，不发信号。 */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function dies(pid, timeoutMs = 3000) {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await sleep(20)) if (!alive(pid)) return true;
  return !alive(pid);
}

test('正常结束：capture 时返回 stdout', async () => {
  assert.equal(await run('process.stdout.write("hello")', { capture: true }), 'hello');
});

test('非零退出码：失败信息带命令名、退出码与提示', async () => {
  await assert.rejects(run('process.exit(3)', { label: 'wrangler pages deploy', failureHint: '；先登录' }), {
    message: 'wrangler pages deploy 失败（退出码 3）；先登录'
  });
});

test('超时：连孙进程一起终止，以明确信息失败（不留下继续上传的孤儿）', { timeout: 20_000 }, async t => {
  const pids = await pidFile(t);
  const running = run(TREE, { env: pids.env, timeoutMs: 3000, timeoutHint: '；核对 Pages 面板' });
  const grandchild = await pids.read();
  assert.ok(alive(grandchild), '超时之前孙进程在运行');
  await assert.rejects(running, { message: 'fake wrangler 超过 3 秒仍未结束，已终止它的进程；核对 Pages 面板' });
  assert.ok(await dies(grandchild), '孙进程应随进程组一起被终止');
});

test('忽略 SIGTERM 的进程：宽限期过后升级为 SIGKILL，确认结束后才失败', { timeout: 20_000 }, async t => {
  const pids = await pidFile(t);
  const running = run(STUBBORN, { env: pids.env, timeoutMs: 2000, killGraceMs: 200 });
  const pid = await pids.read();
  await assert.rejects(running, /超过 2 秒仍未结束/);
  assert.ok(!alive(pid), '失败返回时进程已经结束');
});

test('收到 SIGINT 时转给子进程组：子进程在独立进程组里，终端的 Ctrl-C 到不了它', { timeout: 20_000 }, async t => {
  const pids = await pidFile(t);
  const signals = new EventEmitter();
  const running = run(TREE, { env: pids.env, signalSource: signals });
  const grandchild = await pids.read();
  signals.emit('SIGINT');
  await assert.rejects(running, /fake wrangler 失败（被信号 SIGINT 终止）/);
  assert.ok(await dies(grandchild), '孙进程也收到了信号');
  assert.equal(signals.listenerCount('SIGINT'), 0, '结束后不再监听信号');
  assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('父进程退出时终止子进程组：出错退出不留下继续上传的孤儿', { timeout: 20_000 }, async t => {
  const pids = await pidFile(t);
  const signals = new EventEmitter();
  const running = run(TREE, { env: pids.env, signalSource: signals });
  const grandchild = await pids.read();
  signals.emit('exit');
  await assert.rejects(running, /fake wrangler 失败（被信号 SIGTERM 终止）/);
  assert.ok(await dies(grandchild));
  assert.equal(signals.listenerCount('exit'), 0);
});

test('时限必须是正数：缺省或 0 会让定时器立刻触发、一启动就被终止，所以直接报错', async () => {
  for (const timeoutMs of [undefined, 0, -1, Number.NaN])
    await assert.rejects(run('', { timeoutMs }), /timeoutMs 必须是正数毫秒/);
});

test('命令不存在：原样抛出启动错误，不当作超时', async () => {
  await assert.rejects(
    runProcess('definitely-not-a-command-aiao', [], { label: 'x', timeoutMs: 5000 }),
    error => error.code === 'ENOENT'
  );
});
