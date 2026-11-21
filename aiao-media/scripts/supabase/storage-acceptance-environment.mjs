import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { buildProductionBundle } from './build-production-supabase-bundle.mjs';
import { storageKongConfiguration } from './storage-kong.mjs';

const root = resolve(import.meta.dirname, '../..');

async function port() {
  const server = createServer();
  await new Promise((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
  const value = server.address().port;
  await new Promise((done, fail) => server.close(error => (error ? fail(error) : done())));
  return value;
}

function token(role, secret) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const value = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'aiao-storage-test', iat: now, exp: now + 3600 })}`;
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}

/** 每次验收使用独立凭据、随机项目与数据卷，不读取开发或正式环境的私有配置。 */
export async function storageAcceptanceEnvironment(browserOrigin) {
  const temporary = resolve(root, 'tmp');
  await mkdir(temporary, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve(temporary, 'image-storage-'));
  await chmod(directory, 0o700);
  const project = `aiao-media-storage-${randomBytes(6).toString('hex')}`;
  const secret = randomBytes(32).toString('hex');
  const apiPort = await port();
  const url = `http://127.0.0.1:${apiPort}`;
  const env = {
    COMPOSE_PROJECT_NAME: project,
    POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    JWT_SECRET: secret,
    ANON_KEY: token('anon', secret),
    SERVICE_ROLE_KEY: token('service_role', secret),
    API_PORT: String(apiPort),
    DB_PORT: String(await port()),
    MAIL_PORT: String(await port())
  };
  const local = parse(await readFile(resolve(root, 'infra/supabase/docker-compose.yml'), 'utf8'));
  const production = parse(await readFile(resolve(root, 'deploy/self-hosted/compose.yaml'), 'utf8'), { merge: true });
  const services = Object.fromEntries(
    ['db', 'auth', 'rest', 'mail', 'kong-config', 'kong'].map(name => [name, local.services[name]])
  );
  services.db.volumes = services.db.volumes.map(value =>
    value.startsWith('./') ? resolve(root, 'infra/supabase', value) : value
  );
  services.auth.environment.GOTRUE_SITE_URL = browserOrigin;
  services.auth.environment.GOTRUE_URI_ALLOW_LIST = `${browserOrigin}/**`;
  services.kong.depends_on = {
    'kong-config': { condition: 'service_completed_successfully' },
    auth: { condition: 'service_healthy' },
    rest: { condition: 'service_healthy' },
    storage: { condition: 'service_healthy' }
  };
  services['kong-config'].volumes = ['./kong.yml:/template/kong.yml:ro', 'kong-config:/config'];
  services.storage = production.services.storage;
  Object.assign(services.storage.environment, {
    STORAGE_PUBLIC_URL: url,
    TENANT_ID: project,
    GLOBAL_S3_BUCKET: project
  });
  const config = {
    name: project,
    services,
    volumes: { 'kong-config': {}, 'db-data': {}, 'db-config': {}, originals: {} }
  };
  const kong = storageKongConfiguration(await readFile(resolve(root, 'infra/supabase/kong.template.yml'), 'utf8'), [
    browserOrigin
  ]);
  await writeFile(resolve(directory, 'kong.yml'), stringify(kong), { mode: 0o600 });
  await writeFile(resolve(directory, 'compose.yml'), stringify(config), { mode: 0o600 });
  const envFile = resolve(directory, '.env');
  await writeFile(
    envFile,
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600 }
  );
  const output = resolve(directory, 'compose.log');
  const { createWriteStream } = await import('node:fs');
  const log = createWriteStream(output, { mode: 0o600 });
  function compose(args, input) {
    return new Promise((done, fail) => {
      const child = spawn(
        'docker',
        ['compose', '--env-file', envFile, '-f', resolve(directory, 'compose.yml'), ...args],
        {
          env: { PATH: process.env.PATH, HOME: process.env.HOME, DOCKER_HOST: process.env.DOCKER_HOST, ...env },
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );
      child.stdout.pipe(log, { end: false });
      child.stderr.pipe(log, { end: false });
      child.stdin.end(input);
      child.once('error', fail);
      child.once('exit', code =>
        code === 0 ? done() : fail(new Error(`Storage acceptance container command failed (${code}); see ${output}`))
      );
    });
  }
  return {
    url,
    env,
    directory,
    async start() {
      console.log('Starting isolated PostgreSQL, Auth, Storage and Kong.');
      await compose(['up', '-d', '--wait', '--wait-timeout', '180']);
      const { sql } = await buildProductionBundle(resolve(directory, 'bootstrap.sql'));
      await compose(
        ['exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        sql
      );
    },
    async restartStorage() {
      await compose(['restart', '--no-deps', 'storage']);
      await compose(['up', '-d', '--wait', '--wait-timeout', '60', 'storage']);
    },
    async close() {
      try {
        await compose(['down', '--volumes', '--remove-orphans', '--timeout', '5']);
      } finally {
        await new Promise(done => log.end(done));
      }
    }
  };
}
