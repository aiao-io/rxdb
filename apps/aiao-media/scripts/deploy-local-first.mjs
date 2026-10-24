import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseEnv } from 'node:util';
const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'deploy/wrangler.json'), 'utf8'));
let local = {};
try {
  local = parseEnv(await readFile(resolve(root, '.env'), 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
// Only the API prefix becomes an allowlist entry. The application's existing server Key is never deployed.
const configured =
  process.env.AIAO_RELAY_PROVIDER_BASE_URLS ?? local.AIAO_RELAY_PROVIDER_BASE_URLS ?? local.AIAO_IMAGE_BASE_URL ?? '';
const allowed = [
  ...new Set(
    configured
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        const url = new URL(s);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
          throw new Error('Relay allowlist requires credential-free HTTPS API prefixes');
        return url.href.replace(/\/+$/, '');
      })
  )
];
config.main = resolve(root, 'deploy/local-first-worker.mjs');
config.assets.directory = resolve(root, 'dist/browser');
config.vars.ALLOWED_PROVIDER_BASE_URLS = JSON.stringify(allowed);
const directory = resolve(root, '.wrangler/local-first');
await mkdir(directory, { recursive: true });
const file = resolve(directory, 'wrangler.deploy.json');
await writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 });
console.log(
  `Prepared real application deployment; ${allowed.length} approved relay API prefixes; no provider credentials.`
);
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported');
const child = spawn('pnpm', ['exec', 'wrangler', 'deploy', '--config', file, ...args], {
  cwd: root,
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
