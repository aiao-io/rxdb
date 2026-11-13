import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { chmod, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

export const workspaceRoot = resolve(import.meta.dirname, '../..');
const directory = resolve(workspaceRoot, 'infra/supabase');
const envFile = resolve(directory, '.env');
const portsFile = resolve(directory, 'ports.env');

function token(role, secret) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'aiao-local', iat: now, exp: now + 10 * 365 * 86400 })}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}

export async function localEnvironment(environmentFile = envFile) {
  const ports = parseEnv(await readFile(portsFile, 'utf8'));
  let env;
  try {
    env = { ...parseEnv(await readFile(environmentFile, 'utf8')), ...ports };
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Run pnpm nx run aiao-media:supabase-init first.', { cause: error });
    throw error;
  }
  for (const name of ['API_PORT', 'DB_PORT', 'STUDIO_PORT', 'MAIL_PORT']) {
    if (!/^\d+$/.test(env[name] ?? '') || +env[name] < 1024 || +env[name] > 65535)
      throw new Error(`Invalid local port: ${name}`);
  }
  if (new Set(['API_PORT', 'DB_PORT', 'STUDIO_PORT', 'MAIL_PORT'].map(name => env[name])).size !== 4)
    throw new Error('Local Supabase ports must be distinct.');
  for (const name of [
    'POSTGRES_PASSWORD',
    'JWT_SECRET',
    'ANON_KEY',
    'SERVICE_ROLE_KEY',
    'REALTIME_DB_ENC_KEY',
    'SECRET_KEY_BASE',
    'PG_META_CRYPTO_KEY'
  ]) {
    if (!/^[A-Za-z0-9._-]+$/.test(env[name] ?? '')) throw new Error(`Missing or invalid local value: ${name}`);
  }
  return {
    env,
    url: `http://127.0.0.1:${env.API_PORT}`,
    mailUrl: `http://127.0.0.1:${env.MAIL_PORT}`,
    publicEnv: {
      AIAO_SUPABASE_URL: `http://127.0.0.1:${env.API_PORT}`,
      AIAO_SUPABASE_ANON_KEY: env.ANON_KEY
    }
  };
}

async function initialize() {
  const secret = randomBytes(32).toString('hex');
  const initial = {
    POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    JWT_SECRET: secret,
    ANON_KEY: token('anon', secret),
    SERVICE_ROLE_KEY: token('service_role', secret),
    REALTIME_DB_ENC_KEY: randomBytes(8).toString('hex'),
    SECRET_KEY_BASE: randomBytes(48).toString('hex'),
    PG_META_CRYPTO_KEY: randomBytes(32).toString('hex')
  };
  try {
    await writeFile(
      envFile,
      Object.entries(initial)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n',
      { flag: 'wx', mode: 0o600 }
    );
    console.log('Created private local Supabase configuration.');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log('Kept existing local Supabase credentials; ports are fixed by infra/supabase/ports.env.');
  }
  await localEnvironment();
  try {
    await unlink(resolve(directory, 'kong.yml'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export function run(command, args, { input, env = process.env } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env,
      stdio: [input ? 'pipe' : 'inherit', 'inherit', 'inherit']
    });
    if (input) child.stdin.end(input);
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code ?? signal}`))
    );
  });
}

export async function compose(args, options) {
  // Do not inherit unrelated app .env values into Compose interpolation.
  const { env } = await localEnvironment();
  return run(
    'docker',
    [
      'compose',
      '--env-file',
      envFile,
      '--env-file',
      portsFile,
      '-f',
      resolve(directory, 'docker-compose.yml'),
      ...args
    ],
    { ...options, env: { ...process.env, ...env } }
  );
}

export function supabaseRolePasswordSql(password) {
  if (!/^[A-Za-z0-9._-]+$/.test(password)) throw new Error('Missing or invalid local value: POSTGRES_PASSWORD');
  const literal = `'${password.replaceAll("'", "''")}'`;
  return [
    `ALTER ROLE authenticator PASSWORD ${literal};`,
    `ALTER ROLE supabase_auth_admin PASSWORD ${literal};`,
    `ALTER ROLE supabase_storage_admin PASSWORD ${literal};`,
    `ALTER ROLE supabase_admin PASSWORD ${literal};`
  ].join('\n');
}

async function syncSupabaseRolePasswords() {
  const { env } = await localEnvironment();
  await compose(['exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: supabaseRolePasswordSql(env.POSTGRES_PASSWORD)
  });
}

async function main(action) {
  if (action === 'init') return initialize();
  if (['up', 'studio', 'validate'].includes(action)) await initialize();
  if (action === 'up' || action === 'studio') {
    const profile = action === 'studio' ? ['--profile', 'studio'] : [];
    await compose([...profile, 'up', '-d', '--wait', '--wait-timeout', '180', 'db', 'mail']);
    await syncSupabaseRolePasswords();
    await compose([
      ...profile,
      'up',
      '-d',
      '--force-recreate',
      '--wait',
      '--wait-timeout',
      '180',
      'realtime',
      'auth',
      'rest'
    ]);
    await compose(['run', '--rm', 'kong-config']);
    await compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '60', 'kong']);
    if (action === 'studio')
      await compose(['--profile', 'studio', 'up', '-d', '--wait', '--wait-timeout', '180', 'meta', 'studio']);
    const { env, url, mailUrl } = await localEnvironment();
    console.log(
      `Supabase API: ${url}\nMailbox: ${mailUrl}${action === 'studio' ? `\nStudio: http://127.0.0.1:${env.STUDIO_PORT}` : ''}`
    );
  } else if (action === 'validate') {
    await compose(['--profile', 'studio', 'config', '--quiet']);
  } else if (action === 'down') {
    await compose(['--profile', 'studio', 'down']);
    console.log('Stopped local Supabase; database volumes retained.');
  } else if (action === 'status') {
    await compose(['--profile', 'studio', 'ps']);
  } else if (action === 'logs' || action === 'logs-follow') {
    await compose(['--profile', 'studio', 'logs', '--tail', '60', ...(action === 'logs-follow' ? ['--follow'] : [])]);
  } else if (action === 'migrate') {
    const core = [
      '01-rxdb-system-tables.sql',
      '02-rxdb-sync-functions.sql',
      '04-rxdb-utils-functions.sql',
      'production/rxdb-change-grants.sql'
    ];
    const files = [
      ...core.map(name => resolve(workspaceRoot, '../docker/sql', name)),
      ...(await readdir(resolve(directory, 'migrations')))
        .filter(name => name.endsWith('.sql'))
        .sort()
        .map(name => resolve(directory, 'migrations', name))
    ];
    const scripts = await Promise.all(files.map(file => readFile(file, 'utf8')));
    await compose(['exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      input: `BEGIN;\n${scripts.map(sql => sql.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gm, '')).join('\n')}\nCOMMIT;`
    });
  } else if (action === 'preview') {
    const { publicEnv, env: local, url } = await localEnvironment();
    const privateConfig = {
      MEDIA_SUPABASE_URL: url,
      MEDIA_SUPABASE_ANON_KEY: local.ANON_KEY,
      MEDIA_SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY
    };
    await writeFile(
      resolve(workspaceRoot, 'apps/api/.dev.vars'),
      Object.entries(privateConfig)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join('\n') + '\n',
      { mode: 0o600 }
    );
    await chmod(resolve(workspaceRoot, 'apps/api/.dev.vars'), 0o600);
    const env = { ...process.env, ...publicEnv };
    // Build with the local public Auth settings before starting the production worker.
    // Keep service-role credentials in this Node process and out of the client build.
    await run('pnpm', ['exec', 'nx', 'run', 'aiao-media:package-admin'], {
      env
    });
    await run(
      'pnpm',
      [
        '--dir',
        'apps/api',
        'exec',
        'wrangler',
        'dev',
        '--config',
        'wrangler.json',
        '--env',
        'local-first',
        '--local',
        '--port',
        '4399',
        '--show-interactive-dev-session',
        'false'
      ],
      { env }
    );
  } else if (['serve', 'e2e'].includes(action)) {
    const { publicEnv } = await localEnvironment();
    await run('pnpm', ['exec', 'nx', 'run', action === 'serve' ? 'aiao-media:serve' : 'aiao-media-e2e:supabase-e2e'], {
      env: { ...process.env, ...publicEnv }
    });
  } else
    throw new Error(
      'Expected init, up, studio, validate, down, status, logs, logs-follow, migrate, preview, serve or e2e.'
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
