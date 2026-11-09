import { createHmac, randomBytes } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { parse, stringify } from 'yaml';

process.umask(0o077);
const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, 'tmp/self-hosted');
await mkdir(resolve(directory, 'init'), { recursive: true });
const origin = new URL(process.env.AIAO_DEPLOY_ORIGIN);
if (
  origin.protocol !== 'https:' ||
  origin.pathname !== '/' ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash
)
  throw new Error('AIAO_DEPLOY_ORIGIN must be an HTTPS origin.');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwtSecret = randomBytes(32).toString('hex');
const token = role => {
  const now = Math.floor(Date.now() / 1000);
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'aiao-media-cn', iat: now, exp: now + 10 * 365 * 86400 })}`;
  return `${data}.${createHmac('sha256', jwtSecret).update(data).digest('base64url')}`;
};
try {
  const env = {
    MEDIA_PUBLIC_HOST: origin.host,
    POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    JWT_SECRET: jwtSecret,
    ANON_KEY: token('anon'),
    SERVICE_ROLE_KEY: token('service_role'),
    REALTIME_DB_ENC_KEY: randomBytes(8).toString('hex'),
    SECRET_KEY_BASE: randomBytes(48).toString('hex')
  };
  await writeFile(
    resolve(directory, '.env'),
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { flag: 'wx', mode: 0o600 }
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
const env = parseEnv(await readFile(resolve(directory, '.env'), 'utf8'));
if (env.MEDIA_PUBLIC_HOST !== origin.host) throw new Error('Existing deployment credentials belong to another origin.');
const kong = parse(
  (await readFile(resolve(root, 'infra/supabase/kong.template.yml'), 'utf8'))
    .replaceAll('${ANON_KEY}', env.ANON_KEY)
    .replaceAll('${SERVICE_ROLE_KEY}', env.SERVICE_ROLE_KEY)
);
kong.plugins[0].config.origins = [origin.origin, 'tauri://localhost'];
kong.plugins[0].config.headers.push('X-Upsert', 'Tus-Resumable', 'Upload-Length', 'Upload-Offset', 'Upload-Metadata');
kong.plugins[0].config.exposed_headers.push('Location', 'Upload-Offset', 'Tus-Resumable');
kong.services.push({
  name: 'storage',
  url: 'http://storage:5000/',
  routes: [{ name: 'storage', paths: ['/storage/v1/'], strip_path: true }]
});
await writeFile(resolve(directory, 'kong.yml'), stringify(kong), { mode: 0o644 });
await chmod(resolve(directory, 'kong.yml'), 0o644);
for (const name of ['roles.sql', 'realtime.sql'])
  await copyFile(resolve(root, 'infra/supabase/init', name), resolve(directory, 'init', name));
for (const [source, destination] of [
  ['compose.yaml', 'compose.yaml'],
  ['Caddyfile', 'Caddyfile']
])
  await copyFile(resolve(root, 'deploy/self-hosted', source), resolve(directory, destination));
await writeFile(
  resolve(directory, 'public.env'),
  `AIAO_SUPABASE_URL=${origin.origin}\nAIAO_SUPABASE_ANON_KEY=${env.ANON_KEY}\nAIAO_SUPABASE_STORAGE_URL=${origin.origin}\n`,
  { mode: 0o600 }
);
console.log('Prepared self-hosted deployment files; private values remain in ignored tmp/self-hosted.');
