import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import { linkReleasePeers } from '../../../scripts/audit/link-release-peers.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'us404-packed-consumers-')));
const keepOutput = process.argv.includes('--keep');
const requested = process.argv.find(value => value.startsWith('--consumer='))?.slice('--consumer='.length);
const environment = {
  ...process.env,
  CI: 'true',
  NG_CLI_ANALYTICS: 'false',
  PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
  NX_NO_CLOUD: 'true'
};
const reportPath = join(workspaceRoot, 'benchmarks/reports/browser-workbench-consumers-us404.json');
const packed = new Map();
const manifests = new Map();
const consumers = {
  core: { package: '@aiao/browser-workbench', extension: 'ts', dependencies: {} },
  react: {
    package: '@aiao/browser-workbench-react',
    extension: 'tsx',
    dependencies: { react: '19.3.1', 'react-dom': '19.3.1', '@types/react': '19.3.0', '@types/react-dom': '19.3.0' }
  },
  vue: { package: '@aiao/browser-workbench-vue', extension: 'ts', dependencies: { vue: '3.5.44' } },
  angular: {
    package: '@aiao/browser-workbench-angular',
    extension: 'ts',
    dependencies: {
      '@angular/common': '22.2.3',
      '@angular/core': '22.2.3',
      '@angular/forms': '22.2.3',
      '@angular/platform-browser': '22.2.3',
      '@angular/compiler': '22.2.3',
      '@angular/compiler-cli': '22.2.3',
      '@angular/build': '22.2.4',
      '@angular/cli': '22.2.4',
      rxjs: '7.8.2',
      tslib: '2.8.1'
    }
  }
};

function run(command, arguments_, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, arguments_, { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', value => {
      output += value;
    });
    child.stderr.on('data', value => {
      output += value;
    });
    child.on('error', reject);
    child.on('exit', code =>
      code === 0 ?
        resolveRun(output)
      : reject(new Error(`${command} ${arguments_.join(' ')} failed (${code})\n${output}`))
    );
  });
}

async function packageDirectory(name) {
  const source = join(workspaceRoot, 'packages', name.slice('@aiao/'.length));
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  let directory = source;
  try {
    const config = JSON.parse(await readFile(join(source, 'ng-package.json'), 'utf8'));
    directory = resolve(source, config.dest);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await access(join(directory, 'package.json'));
  return { directory, manifest };
}

async function packPackage(name, tarballs) {
  if (packed.has(name)) return;
  const { directory, manifest } = await packageDirectory(name);
  const dependencies = { ...manifest.dependencies, ...manifest.peerDependencies };
  for (const dependency of Object.keys(dependencies).filter(value => value.startsWith('@aiao/')))
    await packPackage(dependency, tarballs);
  const previous = new Set(await readdir(tarballs));
  linkReleasePeers(workspaceRoot, `packages/${name.slice('@aiao/'.length)}`);
  process.stdout.write(`Packing ${name}\n`);
  await run(
    'pnpm',
    ['--config.verify-deps-before-run=false', 'pack', '--pack-destination', tarballs, '--silent'],
    directory
  );
  const outputs = (await readdir(tarballs)).filter(file => file.endsWith('.tgz') && !previous.has(file));
  if (outputs.length !== 1) throw new Error(`${name}: expected one actual pnpm pack tarball`);
  const archive = join(tarballs, outputs[0]);
  const content = JSON.parse(await run('tar', ['-xOf', archive, 'package/package.json'], temporaryRoot));
  for (const entries of [content.dependencies, content.peerDependencies]) {
    if (Object.values(entries ?? {}).some(value => value.startsWith('workspace:')))
      throw new Error(`${name}: packed runtime manifest still contains workspace protocol`);
  }
  packed.set(name, archive);
  manifests.set(name, content);
}

function closure(name, output = new Set()) {
  if (output.has(name)) return output;
  output.add(name);
  const manifest = manifests.get(name);
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }).filter(value =>
    value.startsWith('@aiao/')
  ))
    closure(dependency, output);
  return output;
}

async function writeConsumer(name, options) {
  const directory = join(temporaryRoot, name);
  await mkdir(directory);
  const local = Object.fromEntries(
    [...closure(options.package)].map(dependency => [dependency, `file:${packed.get(dependency)}`])
  );
  const dependencies = {
    ...local,
    ...options.dependencies,
    typescript: '6.0.3',
    ...(name === 'angular' ? {} : { vite: '8.3.5' })
  };
  const manifest = {
    name: `us404-${name}-packed-consumer`,
    private: true,
    type: 'module',
    scripts: { build: name === 'angular' ? 'ng build' : 'tsc --noEmit && vite build' },
    dependencies
  };
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest, null, 2));
  await writeFile(
    join(directory, 'pnpm-workspace.yaml'),
    `packages: []\nautoInstallPeers: false\nstrictPeerDependencies: true\nnodeLinker: hoisted\noverrides:\n${Object.entries(
      local
    )
      .map(([dependency, path]) => `  ${JSON.stringify(dependency)}: ${JSON.stringify(path)}`)
      .join('\n')}\n`
  );
  const root = name === 'angular' ? '<app-root></app-root>' : '<div id="app"></div>';
  const script = name === 'angular' ? '' : `<script type="module" src="/main.${options.extension}"></script>`;
  await writeFile(
    join(directory, 'index.html'),
    `<!doctype html><html><head><meta charset="UTF-8"><title>Published ${name} workbench consumer</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#app{height:100%;margin:0}*{box-sizing:border-box}</style></head><body>${root}${script}</body></html>`
  );
  await cp(
    join(import.meta.dirname, 'consumers', name, `main.${options.extension}.fixture`),
    join(directory, `main.${options.extension}`)
  );
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
      jsx: 'react-jsx',
      lib: ['ES2022', 'DOM'],
      experimentalDecorators: name === 'angular',
      useDefineForClassFields: false
    },
    files: [`main.${options.extension}`],
    ...(name === 'angular' ? { angularCompilerOptions: { strictTemplates: true } } : {})
  };
  await writeFile(join(directory, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
  if (name === 'angular') {
    await writeFile(
      join(directory, 'angular.json'),
      JSON.stringify(
        {
          version: 1,
          projects: {
            consumer: {
              projectType: 'application',
              root: '',
              architect: {
                build: {
                  builder: '@angular/build:application',
                  options: {
                    browser: 'main.ts',
                    index: 'index.html',
                    tsConfig: 'tsconfig.json',
                    outputPath: 'dist',
                    assets: [{ glob: '**/*', input: 'public', output: '/' }],
                    optimization: true,
                    sourceMap: false
                  }
                }
              }
            }
          }
        },
        null,
        2
      )
    );
  }
  return { directory, local };
}

async function copyPublishedAssets(directory) {
  const core = join(directory, 'node_modules/@aiao/browser-workbench');
  const resolved = await realpath(core);
  if (resolved.startsWith(workspaceRoot + sep) || !resolved.startsWith(temporaryRoot + sep))
    throw new Error('Consumer resolved a workspace symlink instead of a packed installation');
  const source = join(core, 'dist/assets');
  const target = join(directory, 'public/browser-workbench-assets');
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  for (const asset of manifest.assets) {
    const bytes = await readFile(join(target, asset.path));
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
      throw new Error(`Published asset digest differs: ${asset.path}`);
  }
  for (const name of [
    'git/lg2_opfs_auto.js',
    'git/lg2_opfs_jspi.js',
    'git/lg2_opfs_jspi.wasm',
    'git/COPYING',
    'esbuild.wasm'
  ])
    await access(join(target, name));
  const installed = [];
  for (const packageName of Object.keys(
    JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).dependencies
  ).filter(value => value.startsWith('@aiao/'))) {
    const path = await realpath(join(directory, 'node_modules', packageName));
    if (!path.startsWith(temporaryRoot + sep))
      throw new Error(`Consumer package escaped isolated install: ${packageName}`);
    installed.push({
      package: packageName,
      version: JSON.parse(await readFile(join(path, 'package.json'), 'utf8')).version
    });
  }
  return { assets: manifest.assets.length, installed };
}

async function serve(directory) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.wasm': 'application/wasm'
  };
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    const path = resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(directory + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
      if (pathname.startsWith('/browser-workbench-assets/runtime/')) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      }
      response.end(await readFile(path));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolveStarted => server.listen(0, '127.0.0.1', resolveStarted));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Consumer verifier has no TCP address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolveClosed => server.close(() => resolveClosed()))
  };
}

async function browserWorkflow(browser, directory, name) {
  const root = join(directory, 'dist', name === 'angular' ? 'browser' : '');
  await access(join(root, 'index.html'));
  const server = await serve(root);
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  const failedRequests = [];
  const workers = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('requestfailed', request =>
    failedRequests.push({ url: request.url(), failure: request.failure()?.errorText })
  );
  context.on('response', response => {
    requests.push({ url: response.url().replace(server.origin, ''), status: response.status() });
  });
  page.on('worker', worker => workers.push(worker.url().replace(server.origin, '')));
  try {
    await page.goto(server.origin);
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: '项目名称', exact: true })
      .fill(`${name} published project`);
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true })
      .fill('vanilla');
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('[data-slot="save-status"]')?.textContent?.includes('已保存')
    );
    if (name === 'core') await page.locator('[data-editor-path] textarea').first().waitFor();
    else await page.locator('.cm-editor').first().waitFor();
    const run = page.getByRole('button', { name: '运行', exact: true });
    await run.click();
    await expect(run).toBeEnabled({ timeout: 60000 });
    const preview = page.frameLocator('iframe[title="项目隔离预览"]');
    await preview.getByRole('heading', { name: '本地 TypeScript 模板' }).waitFor();
    await preview.getByRole('button', { name: '次数 0' }).click();
    await preview.getByRole('button', { name: '次数 1' }).waitFor();
    await page.reload();
    await page.waitForFunction(() =>
      document.querySelector('[data-slot="save-status"]')?.textContent?.includes('已保存')
    );
    await run.click();
    await expect(run).toBeEnabled({ timeout: 60000 });
    await page.frameLocator('iframe[title="项目隔离预览"]').getByRole('button', { name: '次数 0' }).waitFor();
    await page.getByRole('button', { name: '切换 Git 视图', exact: true }).click();
    await page.locator('[data-scm-group="working"] [data-scm-path="src/label.ts"]').click();
    const diff = page.getByRole('region', { name: 'src/label.ts 双栏差异', exact: true });
    await expect(diff.locator('.cm-mergeView')).toBeVisible();
    await expect(diff.locator('.cm-editor')).toHaveCount(2);
    await expect(diff.locator('.cm-content[aria-readonly="true"][contenteditable="false"]')).toHaveCount(2);
    const wasmRequests = requests.filter(item => item.url.endsWith('.wasm') && item.status === 200);
    if (
      !workers.some(value => value.includes('git-worker')) ||
      !workers.some(value => value.includes('compiler-worker'))
    )
      throw new Error(`${name}: actual Git/compiler Workers did not load`);
    if (
      !wasmRequests.some(value => value.url.endsWith('lg2_opfs_jspi.wasm')) ||
      !wasmRequests.some(value => value.url.endsWith('esbuild.wasm'))
    )
      throw new Error(`${name}: published Git/compiler WASM did not load`);
    if (errors.length || failedRequests.length || requests.some(item => item.status >= 400))
      throw new Error(
        `${name}: browser errors ${JSON.stringify({ errors, failedRequests, responses: requests.filter(item => item.status >= 400) })}`
      );
    return {
      workers,
      wasmRequests,
      errors,
      failedRequests,
      interactions: [
        'create-vanilla',
        'framework-editor',
        'compile-worker',
        'opaque-preview',
        'counter-interaction',
        'reload-opfs-project',
        'run-after-reload',
        'readonly-git-diff-with-shared-codemirror'
      ]
    };
  } catch (error) {
    error.message += `\nconsumer=${name}\nerrors=${JSON.stringify(errors)}\nrequests=${JSON.stringify(requests)}\nfailed=${JSON.stringify(failedRequests)}\nbody=${await page.locator('body').innerText()}`;
    throw error;
  } finally {
    await context.close();
    await server.close();
  }
}

let browser;
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  pnpm: '',
  browser: '',
  status: 'failed',
  tarballs: [],
  consumers: []
};
try {
  const names = requested ? [requested] : Object.keys(consumers);
  if (names.some(name => !consumers[name])) throw new Error(`Unknown consumer: ${requested}`);
  const tarballs = join(temporaryRoot, 'tarballs');
  await mkdir(tarballs);
  for (const name of names) await packPackage(consumers[name].package, tarballs);
  report.pnpm = (await run('pnpm', ['--version'], temporaryRoot)).trim();
  report.tarballs = await Promise.all(
    [...packed].map(async ([name, path]) => ({
      name,
      filename: path.split(sep).at(-1),
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex')
    }))
  );
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  for (const name of names) {
    process.stdout.write(`Installing isolated ${name} consumer\n`);
    const { directory } = await writeConsumer(name, consumers[name]);
    const installStarted = performance.now();
    await run(
      'pnpm',
      [
        '--config.verify-deps-before-run=false',
        'install',
        '--ignore-scripts',
        '--prefer-offline',
        '--no-frozen-lockfile'
      ],
      directory
    );
    const installMs = performance.now() - installStarted;
    const assets = await copyPublishedAssets(directory);
    process.stdout.write(`Building ${name} with its normal production toolchain\n`);
    const buildStarted = performance.now();
    await run('pnpm', ['--config.verify-deps-before-run=false', 'run', 'build'], directory);
    const buildMs = performance.now() - buildStarted;
    process.stdout.write(`Running real browser against published ${name} workbench\n`);
    const verification = await browserWorkflow(browser, directory, name);
    report.consumers.push({ name, installMs, buildMs, ...assets, ...verification });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  report.status = 'passed';
  process.stdout.write(`Verified ${report.consumers.length} independent packed workbench consumers.\n`);
} catch (error) {
  report.error = error.stack ?? String(error);
  throw error;
} finally {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close();
  if (keepOutput) process.stdout.write(`Consumer evidence kept at ${temporaryRoot}\n`);
  else await rm(temporaryRoot, { recursive: true, force: true });
}
