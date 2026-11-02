import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const resolver = createRequire(join(workspaceRoot, 'package.json'));
const benchmarkResolver = createRequire(join(workspaceRoot, 'benchmarks/package.json'));
const output = resolve(process.argv[2] ?? join(packageRoot, 'dist/assets'));
const entriesDir = join(output, '.entries');
await mkdir(entriesDir, { recursive: true });
const modules = {
  react: 'react',
  'react-dom-client': 'react-dom/client',
  'react-jsx-runtime': 'react/jsx-runtime',
  'react-jsx-dev-runtime': 'react/jsx-dev-runtime',
  vue: 'vue',
  'angular-core': '@angular/core',
  'angular-common': '@angular/common',
  'angular-platform-browser': '@angular/platform-browser',
  'angular-compiler': '@angular/compiler',
  rxjs: 'rxjs',
  'rxjs-operators': 'rxjs/operators'
};
const entryPoints = {};
for (const [name, specifier] of Object.entries(modules)) {
  const entry = join(entriesDir, `${name}.js`);
  const resolved =
    name === 'vue' ? resolver.resolve('vue/dist/vue.runtime.esm-browser.js')
    : name.startsWith('rxjs') ? resolver.resolve(specifier).replace('/dist/cjs/', '/dist/esm/')
    : resolver.resolve(specifier);
  const exports =
    name.startsWith('react') ?
      Object.keys(resolver(specifier)).filter(key => key !== 'default' && /^[A-Za-z_$][\w$]*$/.test(key))
    : [];
  const source =
    name.startsWith('react') ?
      `import runtime from ${JSON.stringify(resolved)};\nexport const {${exports.join(',')}} = runtime;\nexport default runtime;\n`
    : `export * from ${JSON.stringify(resolved)};\n`;
  await writeFile(entry, source);
  entryPoints[name] = entry;
}
const result = await build({
  entryPoints,
  outdir: join(output, 'runtime'),
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  metafile: true,
  define: {
    'process.env.NODE_ENV': '"development"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
  },
  legalComments: 'external'
});
const workers = await build({
  entryPoints: {
    'git-worker': join(packageRoot, 'src/git/git-worker.ts'),
    'compiler-worker': join(packageRoot, 'src/compiler/compiler-worker.ts')
  },
  outdir: output,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  metafile: true,
  legalComments: 'external',
  define: { 'process.env.NODE_ENV': '"production"' }
});
await rm(entriesDir, { recursive: true });
const gitRoot = dirname(benchmarkResolver.resolve('wasm-git/package.json'));
await mkdir(join(output, 'git'), { recursive: true });
for (const name of ['lg2_opfs_auto.js', 'lg2_opfs_jspi.js', 'lg2_opfs_jspi.wasm', 'COPYING']) {
  await copyFile(join(gitRoot, name), join(output, 'git', name));
}
const wasmRoot = dirname(benchmarkResolver.resolve('esbuild-wasm/package.json'));
await copyFile(join(wasmRoot, 'esbuild.wasm'), join(output, 'esbuild.wasm'));
const assetPaths = [...Object.keys(result.metafile.outputs), ...Object.keys(workers.metafile.outputs)].map(path =>
  resolve(path).slice(output.length + 1)
);
assetPaths.push(
  'esbuild.wasm',
  ...['lg2_opfs_auto.js', 'lg2_opfs_jspi.js', 'lg2_opfs_jspi.wasm', 'COPYING'].map(name => `git/${name}`)
);
const assets = [];
for (const path of assetPaths) {
  const bytes = await readFile(join(output, path));
  assets.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(join(output, 'manifest.json'), JSON.stringify({ version: 1, modules, assets }, null, 2));
