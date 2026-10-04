/**
 * RV-030 回归：非法 request-target 不能让参考服务进程退出。
 *
 * @remarks
 * 这条必须是**独立子进程**级别的回归，不能只在函数级 mock `dispatch` 证明「没 throw」——
 * 原缺陷正是 `new URL(request.url ?? '/', 'http://127.0.0.1')` 的同步 throw 变成一次
 * 没人接的 Promise rejection，Node 对未接 rejection 的默认处理是终止整个进程。只有
 * 真的起一个独立 Node 进程、从外部发一条畸形 request-target，才能既触发真实的
 * Node HTTP parser 行为，又能在子进程真的死掉时观察到（而不是拖垮测试进程本身）。
 *
 * Node 26 原生剥离类型，直接 `node main.ts serve` 起服务，不经 Nx —— 更快也更少移动件。
 */

import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const mainScript = resolve(dirname(fileURLToPath(import.meta.url)), '../main.ts');

const reserveFreePort = async (): Promise<number> => {
  const reservation = createServer();
  await new Promise<void>(done => reservation.listen(0, '127.0.0.1', done));
  const address = reservation.address();
  await new Promise<void>(done => reservation.close(() => done()));
  if (address === null || typeof address === 'string') throw new Error('未分配测试端口');
  return address.port;
};

const waitFor = async (predicate: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('等待超时');
    await new Promise(done => setTimeout(done, 50));
  }
};

/** 经原始 TCP 连接发一条手写请求行，收集响应与连接结束方式（不走 fetch —— fetch 自己会校验 URL）。 */
const sendRaw = (port: number, requestLine: string): Promise<{ event: string; response: string }> =>
  new Promise(done => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let response = '';
    const finish = (value: { event: string; response: string }): void => {
      clearTimeout(timer);
      socket.destroy();
      done(value);
    };
    const timer = setTimeout(() => finish({ event: 'timeout', response }), 5000);
    socket.on('connect', () => socket.write(requestLine));
    socket.on('data', data => {
      response += (data as Buffer).toString();
    });
    socket.on('end', () => finish({ event: 'end', response }));
    socket.on('error', error => finish({ event: 'error', response: `${response}\n${String(error)}` }));
    socket.on('close', () => finish({ event: 'close', response }));
  });

let workdir: string;
let child: ChildProcessByStdio<null, Readable, Readable> | undefined;

afterEach(async () => {
  // 直接 `node main.ts`，不经 shell/nx：只有这一个进程，不需要进程组 kill（沙箱环境下
  // 对任意进程组发信号可能被拒），子进程已经自己退出时也不必再 kill 一次。
  if (child !== undefined && child.exitCode === null) child.kill('SIGKILL');
  child = undefined;
  if (workdir !== undefined) rmSync(workdir, { recursive: true, force: true });
});

describe('RV-030 —— 非法 request-target 不能终止服务进程', () => {
  it('坏 URL / 坏百分号之后，进程仍然存活且照常服务正常请求', async () => {
    workdir = mkdtempSync(join(tmpdir(), 'rv030-crash-'));
    const port = await reserveFreePort();

    let log = '';
    child = spawn('node', [mainScript, 'serve'], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        RXDB_HTTP_DEMO_PORT: String(port),
        RXDB_HTTP_DEMO_DB: join(workdir, 'data')
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', value => (log += (value as Buffer).toString()));
    child.stderr.on('data', value => (log += (value as Buffer).toString()));

    await waitFor(() => log.includes('[serve] http://') || child?.exitCode !== null, 20000);
    expect(child.exitCode, `子进程未能启动：\n${log}`).toBeNull();

    // 1. 畸形 request-target —— Node HTTP parser 接受，应用 URL parser 不接受。
    const invalidTarget = await sendRaw(port, 'GET http://[ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    expect(invalidTarget.response, log).toMatch(/^HTTP\/1\.[01] 400\b/);

    // 2. 畸形 request-target 处理完之后，进程必须仍然活着——这是本条回归的核心断言。
    await new Promise(done => setTimeout(done, 200));
    expect(child.exitCode, `子进程在处理畸形 request-target 后退出：\n${log}`).toBeNull();

    // 3. 坏百分号路径段：同样不能把进程带走，按 400 处理。
    const badPercent = await sendRaw(
      port,
      'GET /v1/recipes/%zz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'
    );
    expect(badPercent.response, log).toMatch(/^HTTP\/1\.[01] 400\b/);

    // 4. 健康探针：进程仍在正常服务，不是「表面没退出、实际已经不响应」。
    const health = await fetch(`http://127.0.0.1:${port}/v1/meta/version`, { signal: AbortSignal.timeout(5000) });
    expect(health.status).toBe(200);
    expect(child.exitCode).toBeNull();
  }, 30000);
});
