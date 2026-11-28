import { execFile } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import type { Identity } from '../model.js';
import { startEdgeFunction, type EdgeFunction } from './edge-fixture.js';
import { nodeServer } from './http.js';
import { createIdentities } from './identity.js';
import { applyMigrations } from './migrate.js';
import { installRealtime } from './realtime-fixture.js';
import { CollaborationRepository } from './repository.js';
import { collaborationRuntime, nodeEntry, type CollaborationRuntime } from './runtime.js';
import { servicePasswordStatement, serviceRole } from './service-role.js';

/**
 * 命令契约测试的拓扑（ADMIN-US-220 AC#2）：一个干净的临时 PostgreSQL（迁移、Realtime 的消息表与函数、专用角色与随机口令），
 * 前面是 transaction 模式的 PgBouncer（与 Supavisor 的 transaction 模式同样的约束：连接不保留会话状态、不转发启动参数、
 * 不支持跨事务的预编译语句），两个命令入口都以专用角色经它连库：
 * - Node 入口：本进程里的 node:http 服务器；
 * - Edge 入口：`supabase/edge-runtime` 容器里的 Edge Function（esbuild 产物），按线上限额（2 秒 CPU / 256 MB）运行。
 * 接受邀请时的 Auth 确认由本进程里的一个 Auth 替身应答（按同一把 HS256 密钥验签后返回登记过的已验证邮箱）。
 * 全部容器与网络名带随机后缀，`stop()` 时删除。
 */
const run = promisify(execFile);
const postgresImage = 'supabase/postgres:17.6.1.136';
/** PgBouncer 1.26.1（按镜像摘要固定，测试结果可复现）。 */
const poolerImage = 'edoburu/pgbouncer@sha256:8638aa563607256d3c7440437534195f1066a92b68015d89ae9d6b935b444a6d';
/** PgBouncer 每个（库，用户）的服务端连接数与排队上限：连接池耗尽用例按它占满连接。 */
export const poolerSize = 4;
/** 排队等服务端连接的上限（秒）：超过即报 query_wait_timeout。 */
export const poolerWaitSeconds = 3;
/** 允许的工作台来源。 */
export const contractOrigin = 'https://product.example';

/** 测试账号：身份与 Auth 替身返回的已验证邮箱。 */
export type Person = Identity;
export const person = (name: string): Person => ({
  id: randomUUID(),
  email: `${name}-${randomUUID().slice(0, 8)}@example.test`,
  verified: true
});

/** 契约测试的运行环境。 */
export interface ContractStack {
  /** 两个入口的基础地址：其后接 `/workspaces/:team/:app/commands` 或 `/config`。 */
  bases: { node: string; edge: string };
  /** 迁移所有者（postgres）的直连：初始化工作区、注入故障与断言数据库状态。 */
  owner: pg.Pool;
  /** 以迁移所有者初始化工作区（部署期的初始化步骤，不经命令入口）。 */
  repository: CollaborationRepository;
  /** 以专用角色经 PgBouncer 连接（与入口同一个连接池），用来占满服务端连接。 */
  poolerClient(): pg.Client;
  /** 专用角色经 PgBouncer 的连接串（本机）。 */
  serviceConnection: string;
  /** 签一个已登录用户的 access token；`claims` 覆盖默认声明。 */
  token(who: Person, claims?: Record<string, unknown>): string;
  /** 在 Auth 替身里登记账号，接受邀请时按它确认邮箱。 */
  register(who: Person): void;
  edge: EdgeFunction;
  stop(): Promise<void>;
}

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function sign(secret: string, claims: Record<string, unknown>): string {
  const input = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}
const listen = (server: Server, host: string) =>
  new Promise<number>(resolve => server.listen(0, host, () => resolve((server.address() as AddressInfo).port)));
const close = (server: Server) =>
  new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
async function waitFor(work: () => Promise<unknown>, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      await work();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
const connectionString = (host: string, port: number, user: string, password: string) => {
  const url = new URL(`postgres://${host}:${port}/postgres`);
  url.username = user;
  url.password = password;
  return url.href;
};

/** Auth 替身：`GET /auth/v1/user` 按 HS256 验签令牌，返回登记过的账号与已验证邮箱；其余一律 401。 */
async function authDouble(secret: string, accounts: Map<string, Person>) {
  const identities = createIdentities({
    rules: { keys: { kind: 'secret', secret }, issuer: undefined },
    auth: { getUser: () => Promise.reject(new Error('unused')) }
  });
  const server = createServer((request, response) => {
    void (async () => {
      const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1] ?? '';
      const verified = await identities.verify(token).catch(() => undefined);
      const account = request.url === '/auth/v1/user' && verified ? accounts.get(verified.id) : undefined;
      response.writeHead(account ? 200 : 401, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          account ?
            { id: account.id, email: account.email, email_confirmed_at: '2026-11-18T00:00:00Z' }
          : { msg: 'invalid JWT' }
        )
      );
    })();
  });
  // 绑定所有网卡：Edge Function 容器经 host.docker.internal 访问它；端口随机，测试结束即关闭
  const port = await listen(server, '0.0.0.0');
  return { server, port };
}

/** transaction 模式的 PgBouncer：配置文件写在临时目录，口令随机，只读挂载进容器。 */
async function startPooler(network: string, password: string) {
  const directory = await mkdtemp(path.join('/tmp', 'admin-pgbouncer-'));
  await writeFile(
    path.join(directory, 'pgbouncer.ini'),
    [
      '[databases]',
      'postgres = host=db port=5432 dbname=postgres',
      '[pgbouncer]',
      'listen_addr = 0.0.0.0',
      'listen_port = 6432',
      'auth_type = scram-sha-256',
      'auth_file = /etc/pgbouncer/userlist.txt',
      'pool_mode = transaction',
      `default_pool_size = ${poolerSize}`,
      'min_pool_size = 0',
      'reserve_pool_size = 0',
      'max_client_conn = 200',
      `query_wait_timeout = ${poolerWaitSeconds}`,
      'max_prepared_statements = 0',
      ''
    ].join('\n')
  );
  await writeFile(path.join(directory, 'userlist.txt'), `"${serviceRole}" "${password}"\n`);
  await chmod(directory, 0o755);
  for (const file of ['pgbouncer.ini', 'userlist.txt']) await chmod(path.join(directory, file), 0o644);
  const container = `admin-contract-pooler-${randomUUID().slice(0, 8)}`;
  await run('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    container,
    '--network',
    network,
    '--network-alias',
    'pooler',
    '-p',
    '127.0.0.1::6432',
    '-v',
    `${directory}:/etc/pgbouncer:ro`,
    poolerImage
  ]);
  const { stdout } = await run('docker', ['port', container, '6432/tcp']);
  return { container, directory, port: Number(stdout.trim().split('\n')[0].split(':').at(-1)) };
}

/** 起整套拓扑；任一步失败时把已建的容器与网络全部删掉再抛出。 */
export async function startContractStack(): Promise<ContractStack> {
  const suffix = randomUUID().slice(0, 8);
  const network = `admin-contract-${suffix}`;
  const database = `admin-contract-db-${suffix}`;
  const cleanups: (() => Promise<unknown>)[] = [];
  const stop = async () => {
    for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
  };
  try {
    await run('docker', ['network', 'create', network]);
    cleanups.push(() => run('docker', ['network', 'rm', network]));
    const ownerPassword = randomUUID();
    await run('docker', [
      'run',
      '-d',
      '--rm',
      '--name',
      database,
      '--network',
      network,
      '--network-alias',
      'db',
      '-e',
      `POSTGRES_PASSWORD=${ownerPassword}`,
      '-p',
      '127.0.0.1::5432',
      postgresImage
    ]);
    cleanups.push(() => run('docker', ['rm', '-f', database]));
    const { stdout } = await run('docker', ['port', database, '5432/tcp']);
    const databasePort = Number(stdout.trim().split('\n')[0].split(':').at(-1));
    const owner = new pg.Pool({
      connectionString: connectionString('127.0.0.1', databasePort, 'postgres', ownerPassword),
      max: 6
    });
    cleanups.push(() => owner.end());
    await waitFor(() => owner.query('SELECT 1'), 60_000);
    const superuser = new pg.Client({
      connectionString: connectionString('127.0.0.1', databasePort, 'supabase_admin', ownerPassword)
    });
    await superuser.connect();
    try {
      await installRealtime(superuser);
    } finally {
      await superuser.end();
    }
    await applyMigrations(owner);
    const servicePassword = randomUUID();
    await owner.query(await servicePasswordStatement(servicePassword));
    const pooler = await startPooler(network, servicePassword);
    cleanups.push(() => rm(pooler.directory, { recursive: true, force: true }));
    cleanups.push(() => run('docker', ['rm', '-f', pooler.container]));
    const serviceConnection = connectionString('127.0.0.1', pooler.port, serviceRole, servicePassword);
    await waitFor(async () => {
      const probe = new pg.Client({ connectionString: serviceConnection });
      await probe.connect();
      await probe.end();
    }, 30_000);

    const secret = `contract-${randomUUID()}-${randomUUID()}`;
    const accounts = new Map<string, Person>();
    const auth = await authDouble(secret, accounts);
    cleanups.push(() => close(auth.server));
    const anon = sign(secret, { role: 'anon', iss: 'contract' });
    const shared = {
      SUPABASE_ANON_KEY: anon,
      ADMIN_PUBLIC_SUPABASE_URL: 'https://project.supabase.test',
      ADMIN_ALLOWED_ORIGINS: contractOrigin
    };
    const node: CollaborationRuntime = collaborationRuntime(
      {
        ...shared,
        SUPABASE_URL: `http://127.0.0.1:${auth.port}`,
        SUPABASE_JWT_SECRET: secret,
        ADMIN_DATABASE_URL: serviceConnection
      },
      nodeEntry
    );
    cleanups.push(() => node.pool.end());
    const server = nodeServer(node.handler);
    const nodePort = await listen(server, '127.0.0.1');
    cleanups.push(() => close(server));
    const edge = await startEdgeFunction({
      network,
      env: {
        ...shared,
        SUPABASE_URL: `http://host.docker.internal:${auth.port}`,
        ADMIN_JWT_SECRET: secret,
        ADMIN_DATABASE_URL: connectionString('pooler', 6432, serviceRole, servicePassword)
      }
    });
    cleanups.push(() => edge.stop());
    return {
      bases: { node: `http://127.0.0.1:${nodePort}`, edge: edge.url },
      owner,
      repository: new CollaborationRepository(owner),
      poolerClient: () => new pg.Client({ connectionString: serviceConnection }),
      serviceConnection,
      token: (who, claims = {}) =>
        sign(secret, {
          sub: who.id,
          aud: 'authenticated',
          role: 'authenticated',
          email: who.email,
          exp: Math.floor(Date.now() / 1000) + 3600,
          ...claims
        }),
      register: who => {
        accounts.set(who.id, who);
      },
      edge,
      stop
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
