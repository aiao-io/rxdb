import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const evidence = await mkdtemp(join(tmpdir(), 'rxdb-http-review-'));
const reservation = createServer();
await new Promise(done => reservation.listen(0, '127.0.0.1', done));
const address = reservation.address();
if (address === null || typeof address === 'string') throw new Error('未分配测试端口');
const port = address.port;
await new Promise(done => reservation.close(done));
const child = spawn('pnpm', ['nx', 'run', 'dev-rxdb-http-server:serve', '--skipRemoteCache'], {
  cwd: root,
  detached: true,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NX_DAEMON: 'false',
    RXDB_HTTP_DEMO_PORT: String(port),
    RXDB_HTTP_DEMO_DB: join(evidence, 'data')
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
let exited = false;
let processError;
child.stdout.on('data', value => {
  log += value.toString();
});
child.stderr.on('data', value => {
  log += value.toString();
});
child.on('exit', () => {
  exited = true;
});
child.on('error', error => {
  processError = error;
});
const delay = ms => new Promise(done => setTimeout(done, ms));
const requests = [];
let invalidTarget;
let health;
let setupError;

const sendInvalidTarget = () =>
  new Promise(done => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let response = '';
    const finish = value => {
      clearTimeout(timer);
      socket.destroy();
      done(value);
    };
    const timer = setTimeout(() => finish({ event: 'timeout', response }), 3000);
    socket.on('connect', () => socket.write('GET http://[ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'));
    socket.on('data', data => {
      response += data.toString();
    });
    socket.on('end', () => finish({ event: 'end', response }));
    socket.on('error', error => finish({ event: 'error', error: String(error), response }));
    socket.on('close', () => finish({ event: 'close', response }));
  });

try {
  const deadline = Date.now() + 30000;
  while (!log.includes('[serve] http://')) {
    if (processError) throw processError;
    if (exited || Date.now() > deadline) throw new Error('隔离服务启动失败或超时');
    await delay(100);
  }
  const base = `http://127.0.0.1:${port}/v1`;
  for (const [name, body, expectedStatus] of [
    ['valid metadata', JSON.stringify({ limit: 1 }), 200],
    ['null metadata', 'null', 400],
    ['array metadata', '[]', 400],
    ['oversize metadata', JSON.stringify({ extra: 'x'.repeat(1024 * 1024) }), 413]
  ]) {
    const response = await fetch(`${base}/recipes/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10000)
    });
    requests.push({ name, expectedStatus, status: response.status, body: (await response.text()).slice(0, 240) });
  }
  invalidTarget = await sendInvalidTarget();
  await delay(300);
  try {
    const response = await fetch(`${base}/meta/version`, { signal: AbortSignal.timeout(2000) });
    health = { status: response.status, body: await response.text() };
  } catch (error) {
    health = { error: String(error), cause: String(error.cause) };
  }
} catch (error) {
  setupError = String(error);
} finally {
  if (!exited && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    for (let n = 0; n < 30 && !exited; n++) await delay(100);
    if (!exited) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
  await writeFile(join(evidence, 'server.log'), log);
  await writeFile(
    join(evidence, 'results.json'),
    JSON.stringify({ port, requests, invalidTarget, health, setupError }, null, 2)
  );
  await rm(join(evidence, 'data'), { recursive: true, force: true });
}
const result = JSON.parse(await readFile(join(evidence, 'results.json'), 'utf8'));
console.log(JSON.stringify({ evidence, ...result }, null, 2));
const invalidTargetRejected = /^HTTP\/1\.[01] 400\b/.test(invalidTarget?.response ?? '');
const failed =
  requests.some(item => item.status !== item.expectedStatus) || health?.status !== 200 || !invalidTargetRejected;
process.exitCode =
  setupError ? 2
  : failed ? 1
  : 0;
