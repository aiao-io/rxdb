import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

const productRoot = resolve(import.meta.dirname, '../..');
const webRoot = resolve(productRoot, 'apps/web');
const config = JSON.parse(await readFile(resolve(productRoot, 'apps/api/wrangler.json'), 'utf8'));
config.main = resolve(productRoot, 'apps/api/src/local-first-worker.ts');
config.assets.directory = resolve(webRoot, 'dist/browser');
const directory = resolve(webRoot, '.wrangler/local-first');
await mkdir(directory, { recursive: true });
const file = resolve(directory, 'wrangler.deploy.json');
await writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 });
console.log('Prepared real application deployment; provider configuration is managed by Admin.');
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
  createInterface({ input: stream }).on('line', line => output.write(`${line}\n`));
}
child.on('error', () => {
  console.error('Unable to start Wrangler');
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exitCode = code ?? 1;
});
