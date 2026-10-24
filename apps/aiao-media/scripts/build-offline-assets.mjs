import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { supabaseHeaders } from './build-supabase-config.mjs';

const root = resolve(import.meta.dirname, '../dist/browser');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Only compiler output and the non-personalized CSR shell, never SSR/API HTML.
const assets = [];
const extensions = new Set(['.js', '.css', '.wasm', '.ico', '.png', '.svg', '.woff', '.woff2']);
async function walk(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, item.name);
    if (item.isDirectory()) await walk(full);
    else if (extensions.has(extname(item.name)) && item.name !== 'offline-worker.js') {
      const bytes = await readFile(full);
      if (bytes.length > 16 * 1024 * 1024) throw new Error('Offline resource exceeds size limit.');
      assets.push({
        path: `/${relative(root, full).split('\\').join('/')}`,
        size: bytes.length,
        sha256: hash(bytes)
      });
    }
  }
}
// Apply Auth CSP from the exact public configuration copied into this build.
// Always start with the source template so switching builds removes old origins.
const configScript = await readFile(resolve(root, 'app-config.js'), 'utf8');
const configJSON = /^globalThis\.__AIAO_SUPABASE_CONFIG__ = (.+);\s*$/.exec(configScript)?.[1];
if (!configJSON) throw new Error('Missing generated public account configuration.');
await writeFile(
  resolve(root, '_headers'),
  supabaseHeaders(await readFile(resolve(import.meta.dirname, '../public/_headers'), 'utf8'), JSON.parse(configJSON))
);
await walk(root);
const shell = await readFile(resolve(root, 'index.html'));
await writeFile(resolve(root, 'offline-shell.html'), shell);
assets.push({
  path: '/offline-shell.html',
  size: shell.length,
  sha256: hash(shell)
});
assets.sort((a, b) => a.path.localeCompare(b.path));
const template = await readFile(resolve(import.meta.dirname, 'offline-worker.js'), 'utf8');
const version = hash(JSON.stringify(assets) + template);
const manifest = { version, assets };
await writeFile(resolve(root, 'offline-worker.js'), `const MANIFEST = ${JSON.stringify(manifest)};\n${template}`);
await writeFile(resolve(root, 'offline-manifest.json'), JSON.stringify({ version }));
console.log(`Offline shell ${version.slice(0, 12)}: ${assets.length} integrity-checked public build resources.`);
