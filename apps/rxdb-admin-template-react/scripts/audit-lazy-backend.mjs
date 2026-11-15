import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const engines = /(?:@subframe7536\/sqlite-wasm|rxdb-adapter-sqlite-wasm\/src\/(?:index|RxDBAdapterSqlite)\.)/;

for (const framework of ['angular', 'react', 'vue']) {
  const root = resolve(
    workspace,
    framework === 'angular' ?
      'dist/apps/rxdb-admin-template-angular/browser'
    : `apps/rxdb-admin-template-${framework}/dist`
  );
  const initial = new Set();
  let dashboard;
  let lazyBackend;
  if (framework === 'angular') {
    const { outputs } = readJson(resolve(root, '../browser-stats.json'));
    const visit = file => {
      if (initial.has(file)) return;
      initial.add(file);
      for (const entry of outputs[file].imports ?? []) if (entry.kind === 'import-statement') visit(entry.path);
    };
    visit(Object.keys(outputs).find(file => /^main-.*\.js$/.test(file)));
    dashboard = Object.keys(outputs).find(file => outputs[file].entryPoint?.includes('pages/dashboard-page'));
    lazyBackend = Object.keys(outputs).find(file =>
      outputs[file].entryPoint?.includes('rxdb-adapter-sqlite-wasm/src/index')
    );
  } else {
    const manifest = readJson(resolve(root, '.vite/manifest.json'));
    const visited = new Set();
    const visit = key => {
      if (visited.has(key)) return;
      visited.add(key);
      initial.add(manifest[key].file);
      for (const entry of manifest[key].imports ?? []) visit(entry);
    };
    visit('index.html');
    dashboard = Object.values(manifest).find(entry => entry.src?.includes('pages/dashboard-page'))?.file;
    lazyBackend = Object.values(manifest).find(entry =>
      entry.src?.includes('rxdb-adapter-sqlite-wasm/src/index')
    )?.file;
  }
  assert(dashboard && !initial.has(dashboard), `${framework}: Dashboard 必须独立按需加载`);
  assert(lazyBackend && !initial.has(lazyBackend), `${framework}: SQLite 后端必须独立按需加载`);
  const sources = [...initial].flatMap(file => readJson(resolve(root, `${file}.map`)).sources);
  assert(!sources.some(source => engines.test(source)), `${framework}: 首屏包含 SQLite 引擎或适配器入口`);
  const chunks = [...initial].map(file => readFileSync(resolve(root, file)));
  console.log(
    JSON.stringify({
      framework,
      initialBytes: chunks.reduce((total, chunk) => total + chunk.length, 0),
      initialGzipBytes: chunks.reduce((total, chunk) => total + gzipSync(chunk, { level: 9 }).length, 0),
      dashboard,
      lazyBackend,
      initialChunks: [...initial]
    })
  );
}
