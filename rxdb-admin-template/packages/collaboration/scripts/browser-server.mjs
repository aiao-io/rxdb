import { createClient } from '@supabase/supabase-js';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { parseSchemaManifest } from '../dist/server/schema.js';
import { collaborationServer } from '../dist/server/server/http.js';
import { applyMigrations, readMigrations } from '../dist/server/server/migrate.js';
import { CollaborationRepository } from '../dist/server/server/repository.js';
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
const name = `admin-browser-${randomUUID()}`;
const password = randomUUID();
const users = [];
const teams = [];
const stackId =
  process.env['SUPABASE_CI_ID'] ?? createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 10);
const stackDatabase = `rxdb-supabase-db-${stackId}`;
// supabase/migrations 下的全部迁移，按文件名顺序；与迁移命令、集成测试、基准共用同一个读取函数
const migrations = await readMigrations();
// 产品的数据模式清单：每个测试工作区初始化时登记为第一个数据模式版本，与正式初始化相同
const schema = parseSchemaManifest(
  JSON.parse(await readFile(path.join(root, 'rxdb-admin-template/schema/collaboration-schema.json'), 'utf8'))
);
function liveSql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['exec', '-i', stackDatabase, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );
    let error = '';
    child.stderr.on('data', chunk => {
      error += chunk;
    });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(error))));
    child.stdin.end(sql);
  });
}
/**
 * 把临时库里这个工作区的治理行、成员读取权限与版本行同步到隔离 Supabase CI 数据库，
 * 让 Realtime 按 RLS 向可读成员推送版本通知；业务数据不同步。
 */
async function publishVersion(teamId, appId) {
  const { rows } = await pool.query(
    `SELECT w.name,
       (SELECT json_agg(json_build_object('id', m.user_id, 'email', m.email, 'permissions', m.permissions,
          'generation', m.generation, 'active', m.active) ORDER BY m.seq)
        FROM admin_private.memberships m WHERE m.team_id = w.team_id AND m.app_id = w.app_id) AS members,
       v.revision, v.audit_count
     FROM admin_private.workspaces w
     JOIN public.admin_workspace_versions v ON v.team_id = w.team_id AND v.app_id = w.app_id
     WHERE w.team_id = $1 AND w.app_id = $2`,
    [teamId, appId]
  );
  const marker = `$fixture_${randomUUID().replaceAll('-', '')}$`;
  const data = `${marker}${JSON.stringify({ teamId, appId, ...rows[0] })}${marker}::jsonb`;
  await liveSql(`BEGIN;
    INSERT INTO admin_private.workspaces(team_id, app_id, name)
    SELECT value->>'teamId', value->>'appId', value->>'name' FROM (SELECT ${data} AS value) input ON CONFLICT DO NOTHING;
    INSERT INTO admin_private.memberships(team_id, app_id, user_id, email, permissions, generation, active)
    SELECT state->>'teamId', state->>'appId', member->>'id', member->>'email',
      ARRAY(SELECT jsonb_array_elements_text(member->'permissions')), (member->>'generation')::integer,
      (member->>'active')::boolean
    FROM (SELECT ${data} AS state) input, jsonb_array_elements(state->'members') member
    ON CONFLICT (team_id, app_id, user_id) DO UPDATE SET email = EXCLUDED.email, permissions = EXCLUDED.permissions,
      generation = EXCLUDED.generation, active = EXCLUDED.active;
    INSERT INTO public.admin_workspace_versions(team_id, app_id, revision, audit_count)
    SELECT value->>'teamId', value->>'appId', (value->>'revision')::bigint, (value->>'audit_count')::bigint
    FROM (SELECT ${data} AS value) input
    ON CONFLICT (team_id, app_id) DO UPDATE SET revision = EXCLUDED.revision, audit_count = EXCLUDED.audit_count;
    COMMIT;`);
}
const servers = [];
let pool;
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
  await pool?.end();
  if (teams.length) {
    const ids = teams.map(team => `'${team}'`).join(',');
    await liveSql(
      `BEGIN; DELETE FROM public.admin_workspace_versions WHERE team_id IN (${ids}); DELETE FROM admin_private.memberships WHERE team_id IN (${ids}); DELETE FROM admin_private.workspaces WHERE team_id IN (${ids}); COMMIT;`
    );
  }
  await exec('docker', ['stop', '-t', '1', name]).catch(() => undefined);
  await Promise.allSettled(users.map(id => auth.auth.admin.deleteUser(id)));
}
process.once('SIGTERM', () => {
  void stop().finally(() => process.exit());
});
process.once('SIGINT', () => {
  void stop().finally(() => process.exit());
});
try {
  for (const migration of migrations) await liveSql(migration.sql);
  await exec('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-p',
    '127.0.0.1::5432',
    'supabase/postgres:17.6.1.136'
  ]);
  const port = Number((await exec('docker', ['port', name, '5432'])).stdout.trim().split(':').at(-1));
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', password, max: 8 });
  const deadline = Date.now() + 45000;
  while (true) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  await applyMigrations(pool);
  const repository = new CollaborationRepository(pool);
  const operation = repository.operation.bind(repository);
  repository.operation = async (user, teamId, appId, command) => {
    const result = await operation(user, teamId, appId, command);
    await publishVersion(teamId, appId);
    return result;
  };
  const api = collaborationServer({
    repository,
    origins: [8306, 8307, 8308].map(port => `http://127.0.0.1:${port}`),
    publicConfig: { supabaseUrl, supabaseKey },
    authenticate: async token => {
      const { data, error } = await auth.auth.getUser(token);
      if (error || !data.user?.email_confirmed_at) throw new Error('Invalid test session');
      return { id: data.user.id, email: data.user.email, verified: true };
    }
  });
  const apiHandler = api.listeners('request')[0];
  api.removeAllListeners('request');
  api.on('request', (request, response) => {
    if (request.url !== '/__fixture') {
      apiHandler(request, response);
      return;
    }
    void fixture(repository)
      .then(value => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(value));
      })
      .catch(error => {
        console.error(error.message);
        response.writeHead(500).end('fixture error');
      });
  });
  servers.push(api);
  await listen(api, 8309);
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
  return { teamId, appId, name, admin, reviewer, secondReviewer, secondary, invitation, token };
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
