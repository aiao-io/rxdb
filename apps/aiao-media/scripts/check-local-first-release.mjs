import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { validateSupabaseAuthConfig } from '../src/app/supabase-auth-config.ts';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
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
  env = parseEnv(await readFile(resolve(root, '.env'), 'utf8'));
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
      /KEY|TOKEN|PASSWORD|DATABASE_URL/.test(name) &&
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
  'browser/offline-shell.html',
  'browser/offline-worker.js',
  'browser/wa-sqlite/wa-sqlite-async.wasm'
])
  if (!inventory.some(file => file.path === required)) throw new Error(`Missing build resource: ${required}`);
if (files.length > 20000) throw new Error('Free static asset count exceeded');
await mkdir(resolve(root, 'tmp/local-first'), { recursive: true });
await writeFile(
  resolve(root, 'tmp/local-first/release.json'),
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
