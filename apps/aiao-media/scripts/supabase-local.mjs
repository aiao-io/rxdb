import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

export const workspaceRoot = resolve(import.meta.dirname, '..');
const directory = resolve(workspaceRoot, 'infra/supabase');
const envFile = resolve(directory, '.env');

function token(role, secret) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'aiao-local', iat: now, exp: now + 10 * 365 * 86400 })}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}

export async function localEnvironment() {
  let env;
  try {
    env = parseEnv(await readFile(envFile, 'utf8'));
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
    API_PORT: '54321',
    DB_PORT: '54322',
    STUDIO_PORT: '54323',
    MAIL_PORT: '54324',
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
    console.log('Kept existing local Supabase credentials and ports.');
  }
  const { env } = await localEnvironment();
  const template = await readFile(resolve(directory, 'kong.template.yml'), 'utf8');
  await writeFile(
    resolve(directory, 'kong.yml'),
    template.replaceAll('${ANON_KEY}', env.ANON_KEY).replaceAll('${SERVICE_ROLE_KEY}', env.SERVICE_ROLE_KEY),
    { mode: 0o600 }
  );
  // Kong runs as a non-root container user; its mounted config must be readable there.
  await chmod(resolve(directory, 'kong.yml'), 0o644);
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
  return run('docker', ['compose', '--env-file', envFile, '-f', resolve(directory, 'docker-compose.yml'), ...args], {
    ...options,
    env: { ...process.env, ...env }
  });
}

async function main(action) {
  if (action === 'init') return initialize();
  if (['up', 'studio', 'validate'].includes(action)) await initialize();
  if (action === 'up' || action === 'studio') {
    await compose([
      ...(action === 'studio' ? ['--profile', 'studio'] : []),
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      '180'
    ]);
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
  } else if (action === 'logs') {
    await compose(['--profile', 'studio', 'logs', '--tail', '60']);
  } else if (action === 'migrate') {
    for (const name of (await readdir(resolve(directory, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
      await compose(['exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
        input: await readFile(resolve(directory, 'migrations', name), 'utf8')
      });
    }
  } else if (action === 'preview') {
    const { publicEnv } = await localEnvironment();
    const env = { ...process.env, ...publicEnv };
    // Build with the local public Auth settings before starting the production worker.
    // Keep service-role credentials in this Node process and out of the client build.
    await run('pnpm', ['exec', 'nx', 'run', 'aiao-media:offline-assets'], {
      env
    });
    await run(
      'pnpm',
      [
        'exec',
        'wrangler',
        'dev',
        '--config',
        'deploy/wrangler.json',
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
  } else throw new Error('Expected init, up, studio, validate, down, status, logs, migrate, preview, serve or e2e.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
