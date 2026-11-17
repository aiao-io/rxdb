import { createClient } from '@supabase/supabase-js';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseSchemaManifest } from '../dist/server/schema.js';
import { applyMigrations } from '../dist/server/server/migrate.js';
import { CollaborationRepository } from '../dist/server/server/repository.js';
import { collaborationService } from '../dist/server/server/start.js';

/**
 * 三端协作 E2E 的测试服务，拓扑与生产一致：协作命令服务直接连本机隔离 Supabase 栈自己的 PostgreSQL（与 Auth、PostgREST、
 * Realtime 同一个库），浏览器经 PostgREST 读只读投影、经 Realtime 收私有频道的广播与在线状态，命令经本服务写入。
 * - 迁移按文件名顺序在隔离栈的库上执行；身份按隔离栈的 HS256 共享密钥本地验签（SUPABASE_JWT_SECRET），与生产只差密钥类型。
 * - 隔离栈的数据库端口没有发布到宿主机（docker/docker-compose.ci.yml 共用，不改），这里在本机开一个 TCP 端口，
 *   每个连接经 `docker exec -i <db> nc 127.0.0.1 5432` 原样转发字节：只是传输，不改写任何 SQL。
 * - 每个用例的团队 ID 都是随机 UUID，数据按团队隔离；结束时删除本轮建的全部团队的行与测试账号。
 */
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const compose = await readFile(path.join(root, 'docker/docker-compose.ci.yml'), 'utf8');
const key = name => {
  const value = compose
    .match(new RegExp(`${name}:\\s*([^\\n]+)`))?.[1]
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`Missing fixture ${name}`);
  return value;
};
const supabaseUrl = (await exec('bash', [path.join(root, 'docker/supabase-ci-url.sh')])).stdout.trim();
const supabaseKey = key('SUPABASE_ANON_KEY');
const auth = createClient(supabaseUrl, key('SUPABASE_SERVICE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }
});
const users = [];
const teams = [];
const stackId =
  process.env['SUPABASE_CI_ID'] ?? createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 10);
const stackDatabase = `rxdb-supabase-db-${stackId}`;
// 产品的数据模式清单：每个测试工作区初始化时登记为第一个数据模式版本，与正式初始化相同
const schema = parseSchemaManifest(
  JSON.parse(await readFile(path.join(root, 'rxdb-admin-template/schema/collaboration-schema.json'), 'utf8'))
);
/** 本轮建过的团队的全部行，按外键从叶到根删除。 */
const workspaceTables = [
  'public.admin_changes',
  'public.admin_audit',
  'public.admin_workspace_versions',
  'public.admin_shared',
  'admin_private.record_keys',
  'public.shared_records',
  'admin_private.comments',
  'admin_private.notifications',
  'admin_private.threads',
  'admin_private.reviews',
  'admin_private.candidates',
  'admin_private.prs',
  'admin_private.refs',
  'admin_private.tasks',
  'admin_private.commit_changes',
  'admin_private.commits',
  'admin_private.invitations',
  'admin_private.operations',
  'admin_private.policies',
  'admin_private.schemas',
  'admin_private.memberships',
  'admin_private.workspaces'
];

/** 本机端口到隔离栈数据库的字节转发：每个连接一条 `docker exec -i … nc`，连接结束随之退出。 */
function databaseRelay() {
  const relay = net.createServer(socket => {
    const tunnel = spawn('docker', ['exec', '-i', stackDatabase, 'nc', '127.0.0.1', '5432'], {
      stdio: ['pipe', 'pipe', 'ignore']
    });
    socket.pipe(tunnel.stdin);
    tunnel.stdout.pipe(socket);
    socket.on('error', () => tunnel.stdin.end());
    tunnel.stdin.on('error', () => socket.destroy());
    tunnel.on('exit', () => socket.destroy());
  });
  return new Promise(resolve => relay.listen(0, '127.0.0.1', () => resolve(relay)));
}
/** 隔离栈库的连接串：口令来自共用的 compose 文件，运行时拼出，不在源码里写死。 */
function databaseUrl(port) {
  const url = new URL(`postgres://127.0.0.1:${port}/postgres`);
  url.username = 'postgres';
  url.password = key('POSTGRES_PASSWORD');
  return url.href;
}
/** 迁移会通知 PostgREST 重新加载结构缓存；等新的只读投影出现在缓存里再开始用例。 */
async function waitForProjections() {
  const deadline = Date.now() + 30000;
  for (;;) {
    const response = await fetch(`${supabaseUrl}/rest/v1/admin_workspaces?select=team_id&limit=1`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    const body = await response.json();
    if (body?.code !== 'PGRST205' && body?.code !== 'PGRST202') return;
    if (Date.now() > deadline) throw new Error(`PostgREST never exposed the projections: ${JSON.stringify(body)}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

const servers = [];
let relay;
let service;
async function stop() {
  await Promise.allSettled(
    servers.map(
      server =>
        new Promise(resolve => {
          server.close(resolve);
          server.closeAllConnections();
        })
    )
  );
  if (service && teams.length) {
    const client = await service.pool.connect().catch(() => undefined);
    try {
      if (client) {
        await client.query('BEGIN');
        for (const table of workspaceTables)
          await client.query(`DELETE FROM ${table} WHERE team_id = ANY($1::text[])`, [teams]);
        await client.query('COMMIT');
      }
    } catch (error) {
      console.error(`Fixture cleanup failed: ${error.message}`);
      await client?.query('ROLLBACK').catch(() => undefined);
    } finally {
      client?.release();
    }
  }
  await service?.pool.end().catch(() => undefined);
  await new Promise(resolve => (relay ? relay.close(resolve) : resolve()));
  await Promise.allSettled(users.map(id => auth.auth.admin.deleteUser(id)));
}
process.once('SIGTERM', () => {
  void stop().finally(() => process.exit());
});
process.once('SIGINT', () => {
  void stop().finally(() => process.exit());
});
try {
  relay = await databaseRelay();
  const database = databaseUrl(relay.address().port);
  service = collaborationService({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseKey,
    SUPABASE_JWT_SECRET: key('JWT_SECRET'),
    ADMIN_DATABASE_URL: database,
    ADMIN_ALLOWED_ORIGINS: [8306, 8307, 8308].map(port => `http://127.0.0.1:${port}`).join(',')
  });
  await applyMigrations(service.pool);
  await waitForProjections();
  const repository = new CollaborationRepository(service.pool);
  const apiHandler = service.server.listeners('request')[0];
  service.server.removeAllListeners('request');
  service.server.on('request', (request, response) => {
    const fixtureRoute =
      request.url === '/__fixture' ? fixture(repository)
      : request.url?.startsWith('/__otp?') ? otp(request.url)
      : undefined;
    if (!fixtureRoute) {
      apiHandler(request, response);
      return;
    }
    void fixtureRoute
      .then(value => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(value));
      })
      .catch(error => {
        console.error(error.message);
        response.writeHead(500).end('fixture error');
      });
  });
  servers.push(service.server);
  await listen(service.server, 8309);
  for (const [framework, port] of [
    ['react', 8306],
    ['angular', 8307],
    ['vue', 8308]
  ]) {
    const directory =
      framework === 'angular' ?
        path.join(root, 'dist/apps/rxdb-admin-template-angular/browser')
      : path.join(root, `rxdb-admin-template/apps/${framework}/dist`);
    const server = createServer((request, response) => {
      void serve(request, response, directory);
    });
    servers.push(server);
    await listen(server, port);
  }
  console.info('Collaboration browser fixtures ready');
} catch (error) {
  console.error(error.message);
  await stop();
  process.exitCode = 1;
}
function listen(server, port) {
  return new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
}
/** 为一个测试账号签出新的一次性验证码（同一账号的旧验证码随之作废），供测试进程自己登录。 */
async function otp(url) {
  const email = new URL(url, 'http://localhost').searchParams.get('email');
  const link = await auth.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  return { otp: link.data.properties.email_otp };
}
async function fixture(repository) {
  const suffix = randomUUID();
  const accounts = [];
  for (const role of ['admin', 'reviewer', 'second']) {
    const email = `${role}-${suffix}@example.test`;
    const created = await auth.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) throw created.error;
    users.push(created.data.user.id);
    const link = await auth.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error) throw link.error;
    accounts.push({ id: created.data.user.id, email, verified: true, otp: link.data.properties.email_otp });
  }
  const [admin, reviewer, secondReviewer] = accounts;
  const teamId = randomUUID();
  teams.push(teamId);
  const appId = 'assets';
  const name = `团队-${suffix.slice(0, 8)}`;
  await repository.initialize({ teamId, appId, name, bootstrapKey: randomUUID(), admin, schema });
  const invitation = randomUUID();
  const token = randomUUID();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await repository.operation(admin, teamId, appId, {
    type: 'invite',
    id: invitation,
    email: reviewer.email,
    permissions: ['read', 'review', 'comment'],
    tokenHash,
    expiresAt: Date.now() + 3600000,
    expectedVersion: 0,
    operationId: randomUUID()
  });
  const secondary = { teamId: randomUUID(), appId, name: `隔离团队-${suffix.slice(0, 8)}` };
  teams.push(secondary.teamId);
  await repository.initialize({ ...secondary, bootstrapKey: randomUUID(), admin, schema });
  return {
    teamId,
    appId,
    name,
    admin,
    reviewer,
    secondReviewer,
    secondary,
    invitation,
    token,
    supabaseUrl,
    supabaseKey
  };
}
async function serve(request, response, directory) {
  try {
    if (request.url.startsWith('/collaboration-api')) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const upstream = await fetch(`http://127.0.0.1:8309${request.url}`, {
        method: request.method,
        headers: Object.fromEntries(
          Object.entries(request.headers).filter(([key]) => !['host', 'connection', 'content-length'].includes(key))
        ),
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks)
      });
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/json'
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(directory, `.${pathname}`);
    if (!file.startsWith(directory + path.sep) && file !== directory) {
      response.writeHead(403).end();
      return;
    }
    const filename = path.extname(file) ? file : path.join(directory, 'index.html');
    const body = await readFile(filename);
    const mime = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.wasm': 'application/wasm',
      '.svg': 'image/svg+xml'
    };
    response.writeHead(200, {
      'content-type': mime[path.extname(filename)] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    response.end(body);
  } catch {
    response.writeHead(500).end('Fixture request failed');
  }
}
