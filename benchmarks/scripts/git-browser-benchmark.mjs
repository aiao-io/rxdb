import { build } from 'esbuild';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { createGitBenchmarkFixture, summarizeDurations } from './git-benchmark-fixture.mjs';

const execFile = promisify(execFileCallback);
const profiles = (process.env.GIT_BENCH_PROFILES ?? 'small,medium').split(',');
const attempts = Number(process.env.GIT_BENCH_ATTEMPTS ?? 5);
const allConfigurations = [
  { label: 'isomorphic-memfs', engine: 'isomorphic', storage: 'memfs' },
  { label: 'wasm-memfs', engine: 'wasm', storage: 'memfs' },
  { label: 'isomorphic-native-opfs', engine: 'isomorphic', storage: 'native-opfs' },
  { label: 'wasm-opfs-pthreads', engine: 'wasm', storage: 'opfs', variant: 'pthreads' },
  { label: 'wasm-opfs-jspi', engine: 'wasm', storage: 'opfs', variant: 'jspi' },
  { label: 'wasm-opfs-asyncify', engine: 'wasm', storage: 'opfs', variant: 'asyncify' }
];
const selected = process.env.GIT_BENCH_CONFIGS?.split(',');
const configurations = allConfigurations.filter(item => !selected || selected.includes(item.label));
const reportPath = resolve(process.env.GIT_BENCH_REPORT ?? 'reports/browser-git-latest.json');

async function git(cwd, args, identity) {
  const date = identity && `@${identity.author.timestamp} +0000`;
  const env = identity ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env;
  return (await execFile('git', ['-C', cwd, ...args], { env })).stdout.trim();
}

async function populate(directory, files) {
  for (const file of files) {
    const target = join(directory, file.path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, file.content);
  }
}

async function prepareRepository(root, profile) {
  const fixture = createGitBenchmarkFixture(profile);
  const source = join(root, 'source', profile);
  const remote = join(root, 'repositories', `${profile}.git`);
  await mkdir(source, { recursive: true });
  await git(source, ['init', '--initial-branch=main']);
  await git(source, ['config', 'gc.auto', '0']);
  await git(source, ['config', 'maintenance.auto', 'false']);
  await git(source, ['config', 'user.name', fixture.initialCommit.author.name]);
  await git(source, ['config', 'user.email', fixture.initialCommit.author.email]);
  await populate(source, fixture.files);
  await git(source, ['add', '.']);
  await git(source, ['commit', '-m', fixture.initialCommit.message], fixture.initialCommit);
  const initialOid = await git(source, ['rev-parse', 'HEAD']);
  const initialTree = await git(source, ['rev-parse', 'HEAD^{tree}']);
  await mkdir(resolve(remote, '..'), { recursive: true });
  await git(source, ['clone', '--bare', '--no-local', source, remote]);
  await populate(source, fixture.patch);
  await git(source, ['add', '.']);
  await git(source, ['commit', '-m', fixture.modifiedCommit.message], fixture.modifiedCommit);
  const modifiedTree = await git(source, ['rev-parse', 'HEAD^{tree}']);
  return { fixture, expected: { initialOid, initialTree, modifiedTree } };
}

async function bundle(root) {
  const assets = join(root, 'assets');
  const vendor = join(assets, 'vendor');
  await mkdir(vendor, { recursive: true });
  const wasmPackage = resolve('node_modules/wasm-git');
  const names = ['lg2', 'lg2_opfs', 'lg2_opfs_jspi', 'lg2_opfs_async'];
  for (const name of names) {
    await cp(join(wasmPackage, `${name}.js`), join(vendor, `${name}.js`));
    await cp(join(wasmPackage, `${name}.wasm`), join(vendor, `${name}.wasm`));
  }
  await cp(join(wasmPackage, 'lg2_opfs_auto.js'), join(vendor, 'lg2_opfs_auto.js'));
  const entries = {
    worker: resolve('scripts/git-benchmark-worker.mjs'),
    isomorphic: resolve('scripts/git-benchmark-isomorphic.mjs'),
    http: resolve('node_modules/isomorphic-git/http/web/index.js')
  };
  await build({
    entryPoints: entries,
    outdir: assets,
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    external: ['/isomorphic.js', '/http.js', '/vendor/*']
  });
  const sizes = {};
  for (const name of ['isomorphic.js', ...names.flatMap(name => [`vendor/${name}.js`, `vendor/${name}.wasm`])]) {
    const content = await readFile(join(assets, name));
    sizes[name] = { bytes: content.length, gzipBytes: gzipSync(content).length };
  }
  return { assets, sizes };
}

function serveGit(request, response, url, root, backend) {
  const child = spawn(backend, [], {
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: join(root, 'repositories'),
      GIT_HTTP_EXPORT_ALL: '1',
      REQUEST_METHOD: request.method,
      PATH_INFO: url.pathname.slice('/git'.length),
      QUERY_STRING: url.search.slice(1),
      CONTENT_TYPE: request.headers['content-type'] ?? '',
      CONTENT_LENGTH: request.headers['content-length'] ?? '',
      HTTP_GIT_PROTOCOL: request.headers['git-protocol'] ?? '',
      REMOTE_ADDR: '127.0.0.1'
    }
  });
  const chunks = [];
  child.stdout.on('data', chunk => chunks.push(chunk));
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  child.on('error', error => response.destroy(error));
  child.on('close', code => {
    if (code !== 0) return response.destroy(new Error(`git-http-backend exited ${code}`));
    const output = Buffer.concat(chunks);
    const boundary = output.indexOf('\r\n\r\n');
    if (boundary < 0) return response.destroy(new Error('invalid Git CGI response'));
    for (const line of output.subarray(0, boundary).toString().split('\r\n')) {
      const colon = line.indexOf(':');
      const name = line.slice(0, colon);
      const value = line.slice(colon + 1).trim();
      if (name.toLowerCase() === 'status') response.statusCode = Number(value.split(' ')[0]);
      else response.setHeader(name, value);
    }
    response.end(output.subarray(boundary + 4));
  });
  request.pipe(child.stdin);
}

async function startServer(root, assets) {
  const backend = join((await execFile('git', ['--exec-path'])).stdout.trim(), 'git-http-backend');
  const server = createServer(async (request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Cache-Control', 'no-store');
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/git/')) return serveGit(request, response, url, root, backend);
    if (url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      return response.end('<!doctype html><title>Browser Git benchmark</title>');
    }
    const path = resolve(assets, `.${url.pathname}`);
    const relativePath = relative(assets, path);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      return response.writeHead(403).end();
    }
    try {
      response.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
      response.end(await readFile(path));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function workerCall(page, action, payload) {
  return page.evaluate(
    ({ action, payload }) =>
      new Promise((resolveResult, reject) => {
        const timer = setTimeout(() => reject(new Error(`worker ${action} timed out`)), 180_000);
        if (!window.gitBenchWorker) window.gitBenchWorker = new Worker('/worker.js', { type: 'module' });
        const worker = window.gitBenchWorker;
        worker.onmessage = ({ data }) => {
          clearTimeout(timer);
          if (data.error) reject(new Error(data.error));
          else resolveResult(data.result);
        };
        worker.onerror = event => {
          clearTimeout(timer);
          reject(new Error(event.message));
        };
        worker.postMessage({ id: 1, action, payload });
      }),
    { action, payload }
  );
}

async function sample(browser, origin, configuration, repository) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  try {
    await page.goto(origin);
    const started = performance.now();
    const boot = await workerCall(page, 'boot', configuration);
    const readyMs = performance.now() - started;
    const work = await workerCall(page, 'workflow', {
      ...repository,
      url: `${origin}/git/${repository.fixture.profile}.git`
    });
    const metrics = { readyMs, ...boot.metrics, ...work.metrics };
    if (configuration.storage !== 'memfs') {
      await page.evaluate(() => {
        window.gitBenchWorker.terminate();
        window.gitBenchWorker = null;
      });
      const restart = performance.now();
      const reboot = await workerCall(page, 'boot', configuration);
      metrics.reopenReadyMs = performance.now() - restart;
      const restored = await workerCall(page, 'reopen', repository);
      Object.assign(metrics, restored.metrics);
      work.correctness.reopen = restored.correctness;
      metrics.reopenTotalMs = metrics.reopenReadyMs + metrics.restoreMs + metrics.reopenFirstStatusMs;
      metrics.reopenRuntimeMs = reboot.metrics.filesystemAndRuntimeMs;
    }
    const storage = await page.evaluate(() => navigator.storage.estimate());
    return { metrics, correctness: work.correctness, wasmLinearMemoryBytes: work.wasmLinearMemoryBytes, storage };
  } finally {
    await context.close();
  }
}

function summarize(samples) {
  const names = Object.keys(samples[0].metrics);
  return Object.fromEntries(names.map(name => [name, summarizeDurations(samples.map(sample => sample.metrics[name]))]));
}

function summarizeCorrectness(samples) {
  return {
    rapidRewriteFailures: samples.filter(sample => !sample.correctness.rapidRewrite.passed).length,
    sameSecondRapidRewrites: samples.filter(sample => sample.correctness.rapidRewrite.sameTimestampSecond).length,
    stockOverwriteFailures: samples.filter(sample => sample.correctness.overwriteProbe?.passed === false).length,
    branchFailures: samples.filter(sample => sample.correctness.branchHeadMatches !== true).length,
    reopenStatusFailures: samples.filter(sample => sample.correctness.reopen?.firstDirtyCount > 0).length,
    allMeasuredTreesAndBytesMatch: samples.every(
      sample => sample.correctness.filesVerified && sample.correctness.reopen?.treeMatches !== false
    )
  };
}

async function runProfile(browser, origin, profile, repository) {
  const groups = new Map(configurations.map(configuration => [configuration.label, []]));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = attempt % 2 === 0 ? configurations : [...configurations].reverse();
    for (const configuration of order) {
      console.log(`[git-bench] ${profile} ${configuration.label} ${attempt + 1}/${attempts}`);
      groups.get(configuration.label).push(await sample(browser, origin, configuration, repository));
    }
  }
  return configurations.map(configuration => {
    const samples = groups.get(configuration.label);
    return {
      profile,
      configuration,
      fileCount: repository.fixture.fileCount,
      totalBytes: repository.fixture.totalBytes,
      metrics: summarize(samples),
      correctness: summarizeCorrectness(samples),
      samples
    };
  });
}

async function main() {
  if (!Number.isInteger(attempts) || attempts < 1 || configurations.length === 0)
    throw new Error('invalid benchmark options');
  const root = await mkdtemp(join(tmpdir(), 'rxdb-git-benchmark-'));
  let server;
  let browser;
  const report = {
    status: 'running',
    generatedAt: new Date().toISOString(),
    environment: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      node: process.version
    },
    versions: {},
    sourceSha256: {},
    attempts,
    profiles,
    notes: [
      'MEMFS configurations share the Emscripten FS implementation; isomorphic startup includes that benchmark-only FS runtime.',
      'Native OPFS is a benchmark-only async facade for ordinary files, not a production filesystem.',
      'Git clone uses a loopback native git-http-backend, without internet latency or authentication.',
      'All OPFS builds run with COOP/COEP enabled; variants are forced rather than auto-selected.',
      'Validation and fixture creation are outside operation timings. Reopen includes runtime initialization, restoration, and first status.',
      'Rapid equal-length rewrite correctness is reported separately. Timed ten-file edits wait 1100 ms outside timing to avoid second-resolution stat-cache races.',
      'WasmFS pthreads FS.writeFile appends in Emscripten 6.0.3. Its stock behavior is probed; benchmark edits explicitly use open(w), positioned write, and close.',
      'WASM linear memory is not total browser memory; JS heap and peak RSS are not measured.',
      'Five samples support medians and ranges; p95 nearest-rank equals the maximum and is not a stable tail estimate.'
    ],
    results: []
  };
  try {
    for (const name of [
      'git-browser-benchmark.mjs',
      'git-benchmark-worker.mjs',
      'git-benchmark-fs.mjs',
      'git-benchmark-fixture.mjs',
      'git-benchmark-isomorphic.mjs'
    ]) {
      report.sourceSha256[name] = createHash('sha256')
        .update(await readFile(resolve('scripts', name)))
        .digest('hex');
    }
    for (const name of ['isomorphic-git', 'wasm-git']) {
      report.versions[name] = JSON.parse(await readFile(resolve('node_modules', name, 'package.json'), 'utf8')).version;
    }
    const repositories = {};
    for (const profile of profiles) repositories[profile] = await prepareRepository(root, profile);
    const bundled = await bundle(root);
    report.assetSizes = bundled.sizes;
    const started = await startServer(root, bundled.assets);
    server = started.server;
    browser = await chromium.launch({ headless: true });
    report.environment.browser = browser.version();
    for (const profile of profiles) {
      report.results.push(...(await runProfile(browser, started.origin, profile, repositories[profile])));
      await mkdir(resolve(reportPath, '..'), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    report.status = 'completed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.stack;
    throw error;
  } finally {
    await mkdir(resolve(reportPath, '..'), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await browser?.close();
    await new Promise(resolveServer => (server ? server.close(resolveServer) : resolveServer()));
    await rm(root, { recursive: true, force: true });
  }
  console.log(`[git-bench] completed: ${reportPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
