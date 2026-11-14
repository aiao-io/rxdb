import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { validateSupabaseAuthConfig } from '../../apps/web/src/app/supabase-auth-config.ts';
import { buildProductionUpgrade, productionUpgrades } from '../supabase/build-production-supabase-bundle.mjs';
const productRoot = resolve(import.meta.dirname, '../..');
const webRoot = resolve(productRoot, 'apps/web');
const output = resolve(webRoot, 'dist');
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(output);
let env = {};
try {
  env = parseEnv(await readFile(resolve(webRoot, '.env'), 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const authEnv = { ...env, ...process.env };
const publicAuthKey =
  authEnv.AIAO_SUPABASE_ANON_KEY ?
    validateSupabaseAuthConfig({
      url: authEnv.AIAO_SUPABASE_URL,
      anonKey: authEnv.AIAO_SUPABASE_ANON_KEY
    }).anonKey
  : null;
const secrets = Object.entries({ ...env, ...process.env })
  .filter(
    ([name, value]) =>
      /KEY|TOKEN|PASSWORD|PASS|SECRET|PRIVATE|CREDENTIAL|DATABASE_URL/.test(name) &&
      typeof value === 'string' &&
      value.length >= 8 &&
      !(name === 'AIAO_SUPABASE_ANON_KEY' && value === publicAuthKey)
  )
  .map(([, value]) => Buffer.from(value));
const inventory = [];
for (const path of files) {
  const name = relative(output, path).split('\\').join('/');
  if (name.startsWith('server/') || /(^|\/)\.env|(^|\/)\.wrangler|\.map$/.test(name))
    throw new Error('Release contains a server, credential file, or source map');
  const bytes = await readFile(path);
  if (secrets.some(secret => bytes.includes(secret))) throw new Error('Credential scan failed; release blocked');
  if (name.startsWith('browser/') && bytes.length > 25 * 1024 * 1024) throw new Error('Static asset exceeds 25 MiB');
  if (
    name.startsWith('browser/') &&
    ['.js', '.html'].includes(extname(path)) &&
    /\/api\/auth\/|\/api\/image-config|\/api\/generations/.test(bytes.toString())
  )
    throw new Error('Legacy API dependency found in client output');
  inventory.push({
    path: name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  });
}
for (const required of [
  'browser/index.html',
  'browser/admin/index.html',
  'browser/admin/new-project.sql',
  'browser/admin/upgrade-installation.sql',
  'browser/admin/upgrade-credits.sql',
  'browser/admin/upgrade-image-lifecycle.sql',
  'browser/offline-shell.html',
  'browser/offline-worker.js',
  'browser/wa-sqlite/wa-sqlite-async.wasm'
])
  if (!inventory.some(file => file.path === required)) throw new Error(`Missing build resource: ${required}`);
for (const { name } of productionUpgrades) {
  const { sql } = await buildProductionUpgrade(name);
  if ((await readFile(resolve(output, `browser/admin/upgrade-${name}.sql`), 'utf8')) !== sql)
    throw new Error(`Production upgrade bundle does not match migration sources: ${name}`);
}
if (files.length > 20000) throw new Error('Free static asset count exceeded');
await mkdir(resolve(webRoot, 'tmp/local-first'), { recursive: true });
await writeFile(
  resolve(webRoot, 'tmp/local-first/release.json'),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8'
      }).trim(),
      workingTreeChanges: Boolean(
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8'
        }).trim()
      ),
      files: inventory
    },
    null,
    2
  )
);
console.log(
  `Release check passed: ${files.length} files; largest ${Math.max(...inventory.map(f => f.bytes))} bytes; no provider credentials, SSR runtime, source maps or legacy API calls.`
);
