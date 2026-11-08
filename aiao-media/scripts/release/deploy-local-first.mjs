import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseEnv } from 'node:util';

const productRoot = resolve(import.meta.dirname, '../..');
const webRoot = resolve(productRoot, 'apps/web');
const config = JSON.parse(await readFile(resolve(productRoot, 'apps/api/wrangler.json'), 'utf8'));
let local = {};
try {
  local = parseEnv(await readFile(resolve(webRoot, '.env'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const configured =
  process.env.AIAO_RELAY_PROVIDER_BASE_URLS ?? local.AIAO_RELAY_PROVIDER_BASE_URLS ?? local.AIAO_IMAGE_BASE_URL ?? '';
const allowed = [
  ...new Set(
    configured
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
          throw new Error('Relay allowlist requires credential-free HTTPS API prefixes');
        return url.href.replace(/\/+$/, '');
      })
  )
];
config.main = resolve(productRoot, 'apps/api/src/local-first-worker.ts');
config.assets.directory = resolve(webRoot, 'dist/browser');
config.vars.ALLOWED_PROVIDER_BASE_URLS = JSON.stringify(allowed);
const directory = resolve(webRoot, '.wrangler/local-first');
await mkdir(directory, { recursive: true });
const file = resolve(directory, 'wrangler.deploy.json');
await writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 });
console.log(
  `Prepared real application deployment; ${allowed.length} approved relay API prefixes; no provider credentials.`
);
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported');
const child = spawn('pnpm', ['exec', 'wrangler', 'deploy', '--config', file, ...args], {
  cwd: webRoot,
  stdio: ['inherit', 'pipe', 'pipe']
});
for (const [stream, output] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr]
]) {
  createInterface({ input: stream }).on('line', line =>
    output.write(
      line.includes('env.ALLOWED_PROVIDER_BASE_URLS') ?
        `env.ALLOWED_PROVIDER_BASE_URLS: ${allowed.length} approved API prefixes\n`
      : `${line}\n`
    )
  );
}
child.on('error', () => {
  console.error('Unable to start Wrangler');
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exitCode = code ?? 1;
});
