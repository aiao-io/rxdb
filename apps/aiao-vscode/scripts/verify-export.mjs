import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const packageRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'us404-clean-export-'));
const updateLocks = process.argv.includes('--update-locks');
const keepOutput = process.argv.includes('--keep');
const requested = process.argv.find(value => value.startsWith('--template='))?.split('=')[1];
const environment = {
  ...process.env,
  CI: 'true',
  NG_CLI_ANALYTICS: 'false',
  PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
  NX_NO_CLOUD: 'true'
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

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

async function serve(directory) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json'
  };
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const path = resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (path !== directory && !path.startsWith(directory + sep)) {
      response.statusCode = 403;
      response.end();
      return;
    }
    try {
      const content = await readFile(path);
      response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
      response.end(content);
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise(resolveStarted => server.listen(0, '127.0.0.1', resolveStarted));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Export verifier has no TCP address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolveClosed => server.close(() => resolveClosed()))
  };
}

let browser;
try {
  const templateModule = join(temporaryRoot, 'templates.mjs');
  await build({
    stdin: {
      contents:
        "export {frontendTemplates} from './src/workbench/templates.ts';export {angularTemplate} from './src/workbench/templates-angular.ts';",
      resolveDir: packageRoot
    },
    outfile: templateModule,
    platform: 'node',
    format: 'esm',
    bundle: true
  });
  const { frontendTemplates, angularTemplate } = await import(pathToFileURL(templateModule).href);
  const templates = { ...frontendTemplates, angular: angularTemplate };
  const names = requested ? [requested] : Object.keys(templates);
  const locks = {};
  if (updateLocks && names.length !== 4) throw new Error('Lock regeneration must verify all four templates');
  browser = await chromium.launch({ headless: true });
  const report = {
    node: process.version,
    pnpm: (await run('pnpm', ['--version'], temporaryRoot)).trim(),
    browser: browser.version(),
    generatedAt: new Date().toISOString(),
    templates: []
  };
  for (const name of names) {
    const template = templates[name];
    if (!template) throw new Error(`Unknown export template: ${name}`);
    const directory = join(temporaryRoot, name);
    for (const [path, source] of Object.entries(template.files)) {
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, source);
    }
    if (updateLocks)
      await run(
        'pnpm',
        ['--config.verify-deps-before-run=false', 'install', '--ignore-scripts', '--lockfile-only', '--prefer-offline'],
        directory
      );
    const lock = await readFile(join(directory, 'pnpm-lock.yaml'), 'utf8');
    if (!lock.includes('lockfileVersion:')) throw new Error(`${name}: missing native pnpm lockfile`);
    locks[name] = lock;
    await rm(join(directory, 'node_modules'), { recursive: true, force: true });
    const installStarted = performance.now();
    await run(
      'pnpm',
      ['--config.verify-deps-before-run=false', 'install', '--ignore-scripts', '--frozen-lockfile', '--prefer-offline'],
      directory
    );
    const installedDependency = await realpath(
      join(directory, 'node_modules', name === 'angular' ? '@angular/core' : 'vite')
    );
    if (installedDependency.startsWith(workspaceRoot + sep))
      throw new Error(`${name}: clean install unexpectedly resolved into workspace sources`);
    const installMs = performance.now() - installStarted;
    const buildStarted = performance.now();
    await run('pnpm', ['--config.verify-deps-before-run=false', 'run', 'build'], directory);
    const buildMs = performance.now() - buildStarted;
    const staticRoot = join(directory, 'dist', name === 'angular' ? 'browser' : '');
    await access(join(staticRoot, 'index.html'));
    const server = await serve(staticRoot);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(server.origin);
      const button = page.getByRole('button');
      await button.waitFor();
      await button.click();
      const expected = name === 'angular' ? 'Count: 1' : '次数 1';
      await page.waitForFunction(
        expectedText => document.querySelector('button')?.textContent?.trim() === expectedText,
        expected
      );
      if (name === 'angular') {
        await page.waitForFunction(
          () => document.querySelector('[data-testid="parent-count"]')?.textContent === 'Parent: 1'
        );
      } else {
        await page.waitForFunction(() => {
          const image = document.querySelector('img');
          return image?.complete && image.naturalWidth > 0;
        });
      }
      if (errors.length) throw new Error(`${name}: browser errors: ${errors.join('\n')}`);
      report.templates.push({
        template: name,
        status: 'passed',
        lockSHA256: digest(lock),
        packageSHA256: digest(template.files['package.json']),
        installMs: Math.round(installMs),
        buildMs: Math.round(buildMs),
        browserInteraction: expected
      });
      console.log(`✓ ${name}: clean frozen install, ordinary production build, browser interaction`);
    } finally {
      await page.close();
      await server.close();
    }
  }
  if (updateLocks) {
    const source = `/** 由 aiao-vscode:verify-export --update-locks 生成的原生 pnpm 锁文件。 */\nexport const templateLocks: Readonly<Record<'vanilla' | 'react' | 'vue' | 'angular', string>> = ${JSON.stringify(locks, null, 2)};\n`;
    await writeFile(join(packageRoot, 'src/workbench/template-locks.ts'), source);
  }
  const reportPath = join(packageRoot, 'benchmarks/browser-workbench-export-latest.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Export verification report: ${reportPath}`);
  if (keepOutput) console.log(`Exported projects: ${temporaryRoot}`);
} finally {
  await browser?.close();
  if (!keepOutput) await rm(temporaryRoot, { recursive: true, force: true });
}
