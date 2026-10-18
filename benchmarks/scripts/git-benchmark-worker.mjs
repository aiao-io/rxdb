import { createEmscriptenFs, createOpfsFs } from './git-benchmark-fs.mjs';

let engine;
let http;
let module;
let wasm;
let fs;
let repo;
let stdout = [];
let stderr = [];
let configuration;
let cache = {};

const elapsed = async action => {
  const started = performance.now();
  const value = await action();
  return { ms: performance.now() - started, value };
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function boot(options) {
  configuration = options;
  const metrics = {};
  const output = {
    print: value => stdout.push(String(value)),
    printErr: value => stderr.push(String(value))
  };
  if (options.engine === 'isomorphic') {
    const loaded = await elapsed(() => import('/isomorphic.js'));
    engine = loaded.value;
    metrics.engineImportMs = loaded.ms;
    http = (await import('/http.js')).default;
  }
  const initialized = await elapsed(async () => {
    if (options.storage === 'native-opfs') {
      fs = await createOpfsFs(await navigator.storage.getDirectory());
      repo = '/repo';
      return;
    }
    if (options.storage === 'memfs') {
      globalThis.wasmGitModuleOverrides = output;
      const imported = await import('/vendor/lg2.js');
      module = await imported.default(output);
      fs = createEmscriptenFs(module.FS);
      repo = '/repo';
      return;
    }
    const { loadOpfsGit } = await import('/vendor/lg2_opfs_auto.js');
    wasm = await loadOpfsGit({
      variant: options.variant,
      user: 'Git Benchmark',
      email: 'git-benchmark@example.invalid',
      moduleOverrides: output
    });
    module = wasm.module;
    fs = createEmscriptenFs(module.FS);
    repo = wasm.repoDir('repo');
  });
  metrics.filesystemAndRuntimeMs = initialized.ms;
  return {
    metrics,
    capabilities: {
      crossOriginIsolated,
      jspi: typeof WebAssembly.Suspending === 'function',
      opfs: typeof navigator.storage?.getDirectory === 'function'
    }
  };
}

async function runWasm(args) {
  stdout = [];
  stderr = [];
  const code = await module.callMain(args);
  assert(code === 0, `lg2 ${args.join(' ')} failed (${code}): ${stderr.join('\n')}`);
  return stdout.join('\n');
}

function enterRepository() {
  if (!module) return;
  module.FS.chdir(repo);
}

async function clone(url) {
  if (engine) {
    return engine.clone({ fs, http, dir: repo, url });
  }
  await runWasm(['clone', url, repo]);
  if (wasm?.variant === 'pthreads') wasm._createMountSymlink('repo');
  enterRepository();
}

async function configureAuthor() {
  if (engine) return;
  enterRepository();
  await runWasm(['config', 'user.name', 'Git Benchmark']);
  await runWasm(['config', 'user.email', 'git-benchmark@example.invalid']);
}

async function status() {
  if (engine) {
    const matrix = await engine.statusMatrix({ fs, dir: repo, cache });
    return matrix.filter(([, head, workdir, stage]) => head !== workdir || workdir !== stage).length;
  }
  enterRepository();
  const output = await runWasm(['status', '--short']);
  return output.split('\n').filter(line => /^(?: [MADRCU?!]|[MADRCU?!][ MADRCU?!]) /.test(line)).length;
}

async function writeFiles(files) {
  for (const file of files) {
    if (wasm?.variant === 'pthreads') writeWasmFsFile(`${repo}/${file.path}`, file.content);
    else if (wasm) await wasm.writeFile('repo', file.path, file.content);
    else await fs.promises.writeFile(`${repo}/${file.path}`, file.content);
  }
}

function writeWasmFsFile(path, content) {
  const bytes = new TextEncoder().encode(content);
  const stream = module.FS.open(path, 'w');
  try {
    const written = module.FS.write(stream, bytes, 0, bytes.length, 0);
    assert(written === bytes.length, 'short WasmFS write');
  } finally {
    module.FS.close(stream);
  }
}

async function upstreamOverwriteProbe() {
  if (wasm?.variant !== 'pthreads') return null;
  const directory = '/opfs/write-probe';
  module.FS.mkdir(directory);
  module.FS.writeFile(`${directory}/file`, 'aa');
  module.FS.writeFile(`${directory}/file`, 'bb');
  const actual = module.FS.readFile(`${directory}/file`, { encoding: 'utf8' });
  return { expected: 'bb', actual, passed: actual === 'bb', benchmarkUsesExplicitTruncatingWrite: true };
}

async function stage(files) {
  if (engine) {
    await engine.add({ fs, dir: repo, filepath: files.map(file => file.path), cache });
    return;
  }
  enterRepository();
  await runWasm(['add', ...files.map(file => file.path)]);
}

async function commit(identity) {
  if (engine) return engine.commit({ fs, dir: repo, ...identity, cache });
  enterRepository();
  await runWasm(['commit', '-m', identity.message]);
}

async function head() {
  if (engine) return engine.resolveRef({ fs, dir: repo, ref: 'HEAD', cache });
  return (await runWasm(['rev-parse', 'HEAD'])).trim();
}

async function tree() {
  if (engine) {
    const oid = await engine.resolveRef({ fs, dir: repo, ref: 'HEAD', cache });
    return (await engine.readCommit({ fs, dir: repo, oid, cache })).commit.tree;
  }
  enterRepository();
  const result = await runWasm(['rev-parse', 'HEAD^{tree}']);
  return result.trim();
}

async function checkout(ref) {
  cache = {};
  if (engine) return engine.checkout({ fs, dir: repo, ref, cache });
  enterRepository();
  return runWasm(['checkout', ref]);
}

async function verifyFiles(files) {
  for (const file of files) {
    const actual = await fs.promises.readFile(`${repo}/${file.path}`, 'utf8');
    assert(actual === file.content, `file mismatch: ${file.path}`);
  }
}

async function measured(metrics, name, action) {
  const result = await elapsed(action);
  metrics[name] = result.ms;
  return result.value;
}

async function rapidRewriteProbe(fixture) {
  const changed = fixture.patch[0];
  const original = fixture.files.find(file => file.path === changed.path);
  await writeFiles([original]);
  await stage([original]);
  assert((await status()) === 0, 'probe baseline is dirty');
  const before = await fs.promises.stat(`${repo}/${changed.path}`);
  await writeFiles([changed]);
  const after = await fs.promises.stat(`${repo}/${changed.path}`);
  const detectedChanges = await status();
  await writeFiles([original]);
  const restored = await fs.promises.readFile(`${repo}/${changed.path}`, 'utf8');
  assert(restored === original.content, `probe bytes differ: ${restored.length} vs ${original.content.length}`);
  assert((await status()) === 0, `probe restoration is dirty: ${stdout.join('\n')}`);
  await new Promise(resolve => setTimeout(resolve, 1_100));
  return {
    beforeMtimeMs: before.mtimeMs,
    afterMtimeMs: after.mtimeMs,
    sameTimestampSecond: Math.floor(before.mtimeMs / 1_000) === Math.floor(after.mtimeMs / 1_000),
    detectedChanges,
    expectedChanges: 1,
    passed: detectedChanges === 1
  };
}

async function workflow({ fixture, url, expected }) {
  const metrics = {};
  const overwriteProbe = await upstreamOverwriteProbe();
  await measured(metrics, 'cloneMs', () => clone(url));
  await configureAuthor();
  assert((await measured(metrics, 'firstCleanStatusMs', status)) === 0, 'clone is dirty');
  assert((await measured(metrics, 'warmCleanStatusMs', status)) === 0, 'clean status changed');
  assert((await tree()) === expected.initialTree, 'cloned tree differs from native Git');
  const rapidRewrite = await rapidRewriteProbe(fixture);
  await measured(metrics, 'write10FilesMs', () => writeFiles(fixture.patch));
  const dirtyCount = await measured(metrics, 'modifiedStatusMs', status);
  assert(dirtyCount === fixture.patch.length, `expected ${fixture.patch.length} modifications, got ${dirtyCount}`);
  await measured(metrics, 'stage10FilesMs', () => stage(fixture.patch));
  await measured(metrics, 'commitMs', () => commit(fixture.modifiedCommit));
  const modifiedOid = await head();
  assert((await tree()) === expected.modifiedTree, 'committed tree differs from native Git');
  assert((await status()) === 0, 'commit is dirty');
  await measured(metrics, 'checkoutOriginalMs', () => checkout(expected.initialOid));
  await verifyFiles(fixture.files);
  await measured(metrics, 'checkoutModifiedMs', () => checkout(modifiedOid));
  await verifyFiles(fixture.patch);
  assert((await status()) === 0, 'checkout is dirty');
  return {
    metrics,
    correctness: {
      initialTree: expected.initialTree,
      modifiedTree: expected.modifiedTree,
      dirtyCount,
      filesVerified: true,
      rapidRewrite,
      overwriteProbe
    },
    wasmLinearMemoryBytes: module?.HEAPU8?.buffer.byteLength ?? null
  };
}

async function reopen({ expected, fixture }) {
  const metrics = {};
  await measured(metrics, 'restoreMs', async () => {
    if (wasm) assert(await wasm.syncRepo('repo'), 'OPFS repository missing after worker restart');
  });
  const firstDirtyCount = await measured(metrics, 'reopenFirstStatusMs', status);
  const statusPreview = stdout.slice(0, 12);
  const warmDirtyCount = await measured(metrics, 'reopenWarmStatusMs', status);
  const actualTree = await tree();
  const patches = new Map(fixture.patch.map(file => [file.path, file]));
  await verifyFiles(fixture.files.map(file => patches.get(file.path) ?? file));
  return {
    metrics,
    correctness: {
      firstDirtyCount,
      warmDirtyCount,
      treeMatches: actualTree === expected.modifiedTree,
      filesVerified: true,
      statusPreview
    },
    wasmLinearMemoryBytes: module?.HEAPU8?.buffer.byteLength ?? null
  };
}

self.onmessage = async ({ data: { id, action, payload } }) => {
  try {
    const result = await { boot, workflow, reopen }[action](payload);
    postMessage({ id, result });
  } catch (error) {
    postMessage({ id, error: `${configuration?.label}: ${error.stack}\n${stderr.join('\n')}` });
  }
};
