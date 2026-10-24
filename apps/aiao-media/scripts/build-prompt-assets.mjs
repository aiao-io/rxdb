import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public/prompt-runtime');
await mkdir(output, { recursive: true });
// No runtime CDN, eval, Blob script, framework bridge or cloud/collaboration code.
for (const [entry, name, globalName] of [
  ['prompt-editor-runtime', 'editor', 'AiaoPromptEditor'],
  ['catalog-data', 'catalog', 'AiaoPromptCatalog']
]) {
  await build({
    entryPoints: [resolve(root, `src/app/prompts/${entry}.ts`)],
    outfile: resolve(output, `${name}.js`),
    bundle: true,
    splitting: false,
    platform: 'browser',
    format: 'iife',
    globalName,
    target: 'es2022',
    minify: true,
    legalComments: 'inline'
  });
}
