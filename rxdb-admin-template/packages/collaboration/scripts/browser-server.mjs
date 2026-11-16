import { createClient } from '@supabase/supabase-js';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { collaborationServer } from '../dist/server/server/http.js';
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
const migration = await readFile(
  path.join(root, 'rxdb-admin-template/supabase/migrations/202611160001_collaboration.sql'),
  'utf8'
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
async function publishVersion(teamId, appId) {
  const { rows } = await pool.query('SELECT state FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2', [
    teamId,
    appId
  ]);
  const state = rows[0].state;
  const marker = `$fixture_${randomUUID().replaceAll('-', '')}$`;
  const data = `${marker}${JSON.stringify(state)}${marker}::jsonb`;
  await liveSql(`BEGIN;
    INSERT INTO admin_private.workspaces(team_id, app_id, state) SELECT value->>'teamId', value->>'appId', '{}'::jsonb FROM (SELECT ${data} AS value) input ON CONFLICT DO NOTHING;
    INSERT INTO admin_private.memberships(team_id, app_id, user_id, can_read)
    SELECT state->>'teamId', state->>'appId', value->>'id', (value->>'active')::boolean AND (value->'permissions' ? 'read') FROM (SELECT ${data} AS state) input, jsonb_each(state->'members')
    ON CONFLICT (team_id, app_id, user_id) DO UPDATE SET can_read = EXCLUDED.can_read;
    INSERT INTO public.admin_workspace_versions(team_id, app_id, revision) SELECT value->>'teamId', value->>'appId', (value->>'revision')::bigint FROM (SELECT ${data} AS value) input
    ON CONFLICT (team_id, app_id) DO UPDATE SET revision = EXCLUDED.revision;
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
  await liveSql(migration);
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
  await pool.query(
    await readFile(path.join(root, 'rxdb-admin-template/supabase/migrations/202611160001_collaboration.sql'), 'utf8')
  );
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
  await repository.initialize({ teamId, appId, name, bootstrapKey: randomUUID(), admin });
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
  await repository.initialize({ ...secondary, bootstrapKey: randomUUID(), admin });
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
