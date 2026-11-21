import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const adapter = createRequire(require.resolve('@aiao/rxdb-adapter-wa-sqlite/package.json'));
const wasm = resolve(dirname(adapter.resolve('wa-sqlite/package.json')), 'dist/wa-sqlite-async.wasm');
const output = resolve(import.meta.dirname, '../public/wa-sqlite');
await mkdir(output, { recursive: true });
await copyFile(wasm, resolve(output, 'wa-sqlite-async.wasm'));
console.log('Prepared browser SQLite WASM from the workspace adapter dependency.');
