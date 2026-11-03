import { performCompilation } from '@angular/compiler-cli';
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { posix, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { angularTemplate } from './angular-template';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const assets = new Map<string, string>();
let server: Server;
let browser: Browser;
let origin: string;

async function compileInBrowser(page: Page, files: Record<string, string>): Promise<Record<string, string>> {
  return page.evaluate(async sourceFiles => {
    const worker = new Worker('/compiler-worker.js', { type: 'module' });
    return new Promise<Record<string, string>>((resolveCompiled, reject) => {
      worker.onmessage = (event: MessageEvent<{ files?: Record<string, string>; error?: string }>) => {
        worker.terminate();
        if (event.data.error) reject(new Error(event.data.error));
        else resolveCompiled(event.data.files ?? {});
      };
      worker.onerror = error => {
        worker.terminate();
        reject(new Error(error.message));
      };
      worker.postMessage(sourceFiles);
    });
  }, files);
}

async function bundleProject(files: Record<string, string>): Promise<string> {
  const result = await build({
    // 工作目录决定 namespace 内裸导入的 node_modules 查找起点；不固定到仓库根时
    // '@angular/compiler' 会经应用私有链解析成空模块，JIT 在 iframe 里拿不到编译器。
    absWorkingDir: workspaceRoot,
    entryPoints: [angularTemplate.entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    nodePaths: [resolve(workspaceRoot, 'node_modules')],
    plugins: [
      {
        name: 'angular-probe-files',
        setup(plugin) {
          plugin.onResolve({ filter: /^(\.\/|\.\.\/|src\/)/ }, args => {
            const pathname = args.importer ? posix.join(posix.dirname(args.importer), args.path) : args.path;
            const path = [pathname, `${pathname}.ts`].find(candidate => candidate in files);
            return path ? { path, namespace: 'angular-probe' } : undefined;
          });
          plugin.onLoad({ filter: /.*/, namespace: 'angular-probe' }, args => ({
            contents: files[args.path],
            loader: 'js',
            resolveDir: workspaceRoot
          }));
        }
      }
    ]
  });
  return result.outputFiles[0].text;
}

async function loadPreview(page: Page, id: string, files: Record<string, string>): Promise<void> {
  await page.goto(origin);
  const compiled = await compileInBrowser(page, files);
  await loadJavascriptPreview(page, id, await bundleProject(compiled));
}

async function loadJavascriptPreview(page: Page, id: string, javascript: string): Promise<void> {
  assets.set(`/${id}.js`, javascript);
  await page.evaluate(
    ({ previewOrigin, previewId }) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${previewOrigin} 'unsafe-eval'; style-src 'unsafe-inline'"></head><body><app-root></app-root><script type="module" src="${previewOrigin}/${previewId}.js"></script></body></html>`;
      document.body.replaceChildren(iframe);
    },
    { previewOrigin: origin, previewId: id }
  );
}

async function buildExportAot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'angular-workbench-export-'));
  try {
    for (const [filename, source] of Object.entries(angularTemplate.files)) {
      await mkdir(posix.dirname(resolve(root, filename)), { recursive: true });
      await writeFile(resolve(root, filename), source);
    }
    await symlink(resolve(workspaceRoot, 'node_modules'), resolve(root, 'node_modules'), 'dir');
    const configuration = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(configuration.config, ts.sys, root);
    const result = performCompilation({
      rootNames: parsed.fileNames,
      options: {
        ...parsed.options,
        rootDir: root,
        outDir: resolve(root, 'out'),
        strictTemplates: true
      }
    });
    const errors = result.diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
    expect(errors.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([]);
    expect(await readFile(resolve(root, 'out/src/app.js'), 'utf8')).toContain('ɵɵdefineComponent');
    const bundled = await build({
      entryPoints: [resolve(root, 'out/src/main.js')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false
    });
    return bundled.outputFiles[0].text;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('Angular browser JIT probe', () => {
  beforeAll(async () => {
    const compiler = await build({
      stdin: {
        contents: "import { compileAngular } from './angular-compiler'; globalThis.angularCompile = compileAngular;",
        resolveDir: import.meta.dirname,
        loader: 'ts'
      },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      external: [...builtinModules, ...builtinModules.map(name => `node:${name}`)],
      write: false
    });
    assets.set('/compiler.js', compiler.outputFiles[0].text);
    assets.set(
      '/compiler-worker.js',
      `import './compiler.js';
self.onmessage = async event => {
  const files = {};
  try {
    for (const [filename, source] of Object.entries(event.data)) {
      if (filename.endsWith('.ts')) files[filename] = await self.angularCompile(source, filename);
    }
    self.postMessage({ files });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};`
    );
    server = createServer((request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      const asset = assets.get(request.url ?? '');
      response.setHeader('Content-Type', asset ? 'text/javascript' : 'text/html');
      response.end(asset ?? '<!doctype html><html><head><title>Angular probe</title></head><body></body></html>');
    });
    await new Promise<void>(resolveStarted => server.listen(0, '127.0.0.1', resolveStarted));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Angular probe server has no TCP address');
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    if (server)
      await new Promise<void>((resolveClosed, reject) =>
        server.close(error => (error ? reject(error) : resolveClosed()))
      );
  });

  it('compiles TypeScript in a Chromium Worker and runs signals, inject and a child component in an opaque iframe', async () => {
    const page = await browser.newPage();
    try {
      await loadPreview(page, 'angular-success', angularTemplate.files);
      const preview = page.frameLocator('iframe');
      await expect.poll(() => preview.getByRole('button').textContent()).toBe('Count: 0');
      await preview.getByRole('button').click();
      await expect.poll(() => preview.getByRole('button').textContent()).toBe('Count: 1');
      await expect.poll(() => preview.getByTestId('parent-count').textContent()).toBe('Parent: 1');
      const buttonColor = await preview.getByRole('button').evaluate(element => getComputedStyle(element).color);
      expect(buttonColor).toBe('rgb(12, 80, 120)');
      const child = page.frames().find(frame => frame !== page.mainFrame());
      expect(
        await child?.evaluate(() => {
          try {
            return parent.document.title;
          } catch {
            return 'isolated';
          }
        })
      ).toBe('isolated');
    } finally {
      await page.close();
    }
  });

  it('surfaces Angular template parser errors from the preview', async () => {
    const page = await browser.newPage();
    const messages: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') messages.push(message.text());
    });
    try {
      const files = {
        ...angularTemplate.files,
        'src/app.ts': angularTemplate.files['src/app.ts'].replace('state.count()', 'state.count(')
      };
      await loadPreview(page, 'angular-error', files);
      await expect.poll(() => messages.join('\n')).toMatch(/Parser Error|Errors during JIT compilation/);
    } finally {
      await page.close();
    }
  });

  it('exports the same sources to ordinary Angular AOT compilation and preserves browser behavior', async () => {
    const javascript = await buildExportAot();
    const page = await browser.newPage();
    try {
      await page.goto(origin);
      await loadJavascriptPreview(page, 'angular-export-aot', javascript);
      const preview = page.frameLocator('iframe');
      await expect.poll(() => preview.getByRole('button').textContent()).toBe('Count: 0');
      await preview.getByRole('button').click();
      await expect.poll(() => preview.getByTestId('parent-count').textContent()).toBe('Parent: 1');
    } finally {
      await page.close();
    }
  });
});
