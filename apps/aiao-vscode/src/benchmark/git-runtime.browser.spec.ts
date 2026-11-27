import { build } from 'esbuild';
import { unzipSync } from 'fflate';
import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const execFile = promisify(execFileCallback);
let browser: Browser;
let page: Page;
let directory: string;
let closeServer: () => Promise<void>;
let origin: string;
const measurements: { action: string; milliseconds: number }[] = [];
const checks: string[] = [];

async function call<T>(action: string, payload: unknown, workerName = 'gitProbe'): Promise<T> {
  const start = performance.now();
  const value = await page.evaluate(
    ({ action, payload, workerName }) =>
      new Promise<T>((resolveResult, reject) => {
        const target = globalThis as unknown as Record<string, Worker>;
        target[workerName] ??= new Worker('/worker.js', { type: 'module' });
        const timer = setTimeout(() => reject(new Error(`timeout: ${action}`)), 30_000);
        target[workerName].onmessage = ({
          data
        }: MessageEvent<{ result?: T; error?: { code: string; message: string } }>) => {
          clearTimeout(timer);
          if (data.error) reject(Object.assign(new Error(data.error.message), { code: data.error.code }));
          else resolveResult(data.result as T);
        };
        target[workerName].onerror = event => {
          clearTimeout(timer);
          reject(new Error(event.message));
        };
        target[workerName].postMessage({ id: 1, action, payload });
      }),
    { action, payload, workerName }
  );
  measurements.push({ action, milliseconds: performance.now() - start });
  return value;
}

async function installFaultWorker(mode: 'quota' | 'interrupt', filename = 'interrupted.txt'): Promise<void> {
  await page.evaluate(
    async ({ mode, filename }) => {
      const wrapper = `
      let failure = ${JSON.stringify(mode)};
      const original = FileSystemFileHandle.prototype.createSyncAccessHandle;
      FileSystemFileHandle.prototype.createSyncAccessHandle = async function (...args) {
        if (failure && this.name === ${JSON.stringify(filename)}) {
          const mode = failure;
          failure = '';
          if (mode === 'quota') throw new DOMException('Injected quota failure', 'QuotaExceededError');
          self.postMessage({ interrupted: true });
          await new Promise(() => {});
        }
        return original.apply(this, args);
      };
      await import(${JSON.stringify(new URL('/worker.js', origin).href)});
      self.postMessage({ ready: true });
    `;
      const worker = new Worker(URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' })), {
        type: 'module'
      });
      const target = globalThis as unknown as Record<string, Worker>;
      target['faultProbe'] = worker;
      await new Promise<void>((resolveReady, reject) => {
        worker.onmessage = () => resolveReady();
        worker.onerror = event => reject(new Error(event.message));
      });
    },
    { mode, filename }
  );
}

async function restart(): Promise<void> {
  await page.evaluate(() => {
    const target = globalThis as unknown as { gitProbe?: Worker };
    target.gitProbe?.terminate();
    target.gitProbe = undefined;
  });
}

async function installCountingWorker(): Promise<void> {
  await page.evaluate(async () => {
    const wrapper = `
      const counts = {};
      const original = FileSystemFileHandle.prototype.createSyncAccessHandle;
      FileSystemFileHandle.prototype.createSyncAccessHandle = async function (...args) {
        if (/^f-[0-9]+[.]ts$/.test(this.name)) counts[this.name] = (counts[this.name] || 0) + 1;
        return original.apply(this, args);
      };
      self.addEventListener('message', event => {
        if (event.data.action !== 'sourceWriteCounts') return;
        event.stopImmediatePropagation(); self.postMessage({ id: event.data.id, result: counts });
      });
      await import(${JSON.stringify(new URL('/worker.js', location.origin).href)}); self.postMessage({ ready: true });
    `;
    const worker = new Worker(URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' })), {
      type: 'module'
    });
    (globalThis as unknown as Record<string, Worker>)['countingProbe'] = worker;
    await new Promise<void>((resolveReady, reject) => {
      worker.onmessage = () => resolveReady();
      worker.onerror = event => reject(new Error(event.message));
    });
  });
}

async function installJournalFaultWorker(mode: 'create' | 'write' | 'close' | 'interrupt'): Promise<void> {
  await page.evaluate(async mode => {
    const wrapper = `
      let failure = ${JSON.stringify(mode)};
      const original = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = async function (...args) {
        if (this.name !== 'recovery.bin') return original.apply(this, args);
        const handle = this;
        if (failure === 'create') { failure = ''; throw new DOMException('journal create failed', 'QuotaExceededError'); }
        const stream = await original.apply(this, args);
        return {
          write: async value => {
            if (failure === 'write') { failure = ''; throw new DOMException('journal write failed', 'QuotaExceededError'); }
            return stream.write(value);
          },
          close: async () => {
            if (failure === 'close') { failure = ''; throw new DOMException('journal close failed', 'QuotaExceededError'); }
            if (failure === 'interrupt') {
              self.postMessage({ interrupted: true, unpublishedBytes: (await handle.getFile()).size });
              await new Promise(() => {});
            }
            return stream.close();
          },
          abort: reason => stream.abort(reason)
        };
      };
      await import(${JSON.stringify(new URL('/worker.js', origin).href)});
      self.postMessage({ ready: true });
    `;
    const target = globalThis as unknown as Record<string, Worker>;
    target['journalProbe']?.terminate();
    const worker = new Worker(URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' })), {
      type: 'module'
    });
    target['journalProbe'] = worker;
    await new Promise<void>((resolveReady, reject) => {
      worker.onmessage = () => resolveReady();
      worker.onerror = event => reject(new Error(event.message));
    });
  }, mode);
}

async function materializeArchive(bytes: number[], name: string): Promise<string> {
  const target = join(directory, name);
  await mkdir(target, { recursive: true });
  for (const [path, data] of Object.entries(unzipSync(new Uint8Array(bytes)))) {
    const output = join(target, path);
    if (path.endsWith('/')) await mkdir(output, { recursive: true });
    else {
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, data);
    }
  }
  return target;
}

describe('browser workbench Git persistence', () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'us404-git-'));
    const assets = join(directory, 'assets');
    await mkdir(join(assets, 'vendor'), { recursive: true });
    const wasmGitRoot = dirname(createRequire(import.meta.url).resolve('wasm-git/package.json'));
    for (const name of ['lg2_opfs_auto.js', 'lg2_opfs_jspi.js', 'lg2_opfs_jspi.wasm']) {
      await cp(join(wasmGitRoot, name), join(assets, 'vendor', name));
    }
    await build({
      entryPoints: [resolve(workspaceRoot, 'apps/aiao-vscode/src/workbench/git/git-worker.ts')],
      outfile: join(assets, 'worker.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022'
    });
    await build({
      stdin: {
        contents: `export { createGitBackend } from ${JSON.stringify(resolve(workspaceRoot, 'apps/aiao-vscode/src/workbench/git-backend.ts'))};`,
        resolveDir: process.cwd()
      },
      outfile: join(assets, 'client.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022'
    });
    const server = createServer(async (request, response) => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (path === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Git workbench probe</title>');
        return;
      }
      if (path.includes('..')) {
        response.writeHead(403).end();
        return;
      }
      try {
        response.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        const resource =
          path.startsWith('/git/') ? `/vendor/${path.slice('/git/'.length)}`
          : path === '/git-worker.js' ? '/worker.js'
          : path;
        response.end(await readFile(join(assets, resource)));
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server has no TCP address');
    origin = `http://127.0.0.1:${address.port}`;
    closeServer = () =>
      new Promise<void>((resolveClose, reject) => server.close(error => (error ? reject(error) : resolveClose())));
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(origin);
  }, 60_000);

  afterAll(async () => {
    if (page && browser) {
      const metrics = await call<{ memoryBytes: number }>('metrics', { projectId: 'recovery' });
      const report = {
        recordedAt: new Date().toISOString(),
        browser: await browser.version(),
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        nativeGit: (await execFile('git', ['--version'])).stdout.trim(),
        wasmGit: JSON.parse(await readFile(resolve('node_modules/wasm-git/package.json'), 'utf8')).version as string,
        variant: 'jspi',
        status: checks.length === 17 ? 'passed' : 'failed',
        checks,
        measurements,
        wasmLinearMemoryBytes: metrics.memoryBytes,
        storage: await page.evaluate(() => navigator.storage.estimate()),
        caveats: [
          'Single fixture run; timings are observations rather than performance thresholds.',
          'Wasm linear memory excludes JS caches and browser process memory.'
        ]
      };
      await writeFile(
        resolve(workspaceRoot, 'apps/aiao-vscode/benchmarks/browser-workbench-git-us404.json'),
        `${JSON.stringify(report, null, 2)}\n`
      );
    }
    await browser?.close();
    await closeServer?.();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('retains staged, unstaged, deleted and binary bytes across Worker restart and native Git round trip', async () => {
    await call('init', {
      projectId: 'persistence',
      files: [
        { path: 'src/main.ts', content: 'export const value = 1;\n' },
        { path: 'delete.txt', content: 'delete me\n' },
        { path: 'asset.bin', bytes: [0, 255, 13, 10, 128] }
      ]
    });
    await call('stage', { projectId: 'persistence', paths: ['src/main.ts', 'delete.txt', 'asset.bin'] });
    expect((await call<{ raw: string }>('status', { projectId: 'persistence' })).raw).toContain('A  src/main.ts');
    const initial = await call<string>('commit', { projectId: 'persistence', message: 'initial' });
    await call('save', {
      projectId: 'persistence',
      files: [{ path: 'src/main.ts', content: 'export const value = 2;\n' }]
    });
    await call('stage', { projectId: 'persistence', paths: ['src/main.ts'] });
    await call('save', {
      projectId: 'persistence',
      files: [{ path: 'src/main.ts', content: 'export const value = 3;\n' }]
    });
    await call('remove', { projectId: 'persistence', path: 'delete.txt' });
    const before = await call('snapshot', { projectId: 'persistence' });
    const status = await call<{ head: string; raw: string }>('status', { projectId: 'persistence' });
    expect(status.head).toBe(initial);
    expect(status.raw).toContain('MM src/main.ts');
    await restart();
    expect(await call('snapshot', { projectId: 'persistence' })).toEqual(before);
    expect(await call('status', { projectId: 'persistence' })).toEqual(status);
    const archive = await call<number[]>('export', { projectId: 'persistence' });
    const native = await materializeArchive(archive, 'native');
    expect((await execFile('git', ['-C', native, 'rev-parse', 'HEAD'])).stdout.trim()).toBe(initial);
    expect((await execFile('git', ['-C', native, 'show', ':src/main.ts'])).stdout).toBe('export const value = 2;\n');
    expect((await execFile('git', ['-C', native, 'status', '--porcelain'])).stdout).toContain('MM src/main.ts');
    await execFile('git', ['-C', native, 'fsck', '--full']);
    expect([...(await readFile(join(native, 'asset.bin')))]).toEqual([0, 255, 13, 10, 128]);
    await call('import', { projectId: 'imported', archive });
    expect((await call<{ files: unknown[] }>('snapshot', { projectId: 'imported' })).files).toEqual(
      (before as { files: unknown[] }).files
    );
    expect(await call('status', { projectId: 'imported' })).toEqual(status);
    await call('stage', { projectId: 'imported', paths: ['src/main.ts', 'delete.txt'] });
    await call('commit', { projectId: 'imported', message: 'import continuation' });
    expect((await call<{ raw: string }>('status', { projectId: 'imported' })).raw).toBe('');
    checks.push('restart-staged-unstaged-deletion-binary-native-git-import-continuation');
  }, 120_000);

  it('restores reachable commit files while preserving HEAD and index and rejects dirty or foreign restores', async () => {
    await call('init', { projectId: 'restore', files: [{ path: 'file.txt', content: 'one\n' }] });
    await call('stage', { projectId: 'restore', paths: ['file.txt'] });
    const first = await call<string>('commit', { projectId: 'restore', message: 'one' });
    await call('save', {
      projectId: 'restore',
      files: [
        { path: 'file.txt', content: 'two\n' },
        { path: 'new.txt', content: 'new\n' }
      ]
    });
    await call('stage', { projectId: 'restore', paths: ['file.txt', 'new.txt'] });
    const second = await call<string>('commit', { projectId: 'restore', message: 'two' });
    const before = unzipSync(new Uint8Array(await call<number[]>('export', { projectId: 'restore' })));
    await call('restore', { projectId: 'restore', oid: first });
    const status = await call<{ head: string; raw: string }>('status', { projectId: 'restore' });
    expect(status.head).toBe(second);
    expect(status.raw).toContain(' M file.txt');
    expect(status.raw).toContain(' D new.txt');
    const after = unzipSync(new Uint8Array(await call<number[]>('export', { projectId: 'restore' })));
    expect(after['.git/HEAD']).toEqual(before['.git/HEAD']);
    expect(after['.git/index']).toEqual(before['.git/index']);
    await expect(call('restore', { projectId: 'restore', oid: first })).rejects.toThrow(/dirty/i);
    await expect(call('restore', { projectId: 'restore', oid: '0'.repeat(40) })).rejects.toThrow();
    checks.push('restore-reachable-tree-preserves-head-index-dirty-rejected');
  }, 120_000);

  it('serializes concurrent writes, isolates project roots and rejects traversal and case collisions', async () => {
    await call('init', { projectId: 'isolation', files: [{ path: 'a.txt', content: 'a' }] });
    await expect(
      call('save', { projectId: 'isolation', files: [{ path: '../persistence/asset.bin', content: 'bad' }] })
    ).rejects.toThrow();
    await expect(
      call('save', { projectId: 'isolation', files: [{ path: '.git/config', content: 'bad' }] })
    ).rejects.toThrow();
    await expect(
      call('save', { projectId: 'isolation', files: [{ path: 'A.txt', content: 'bad' }] })
    ).rejects.toThrow();
    await call('rename', { projectId: 'isolation', path: 'a.txt', destination: 'nested/b.txt' });
    const snapshot = await call<{ files: { path: string; bytes: number[] }[] }>('snapshot', { projectId: 'isolation' });
    expect(snapshot.files).toEqual([{ path: 'nested/b.txt', bytes: [97] }]);
    await Promise.all([
      call('save', { projectId: 'isolation', files: [{ path: 'first.txt', content: 'first' }] }, 'firstWorker'),
      call('save', { projectId: 'isolation', files: [{ path: 'second.txt', content: 'second' }] }, 'secondWorker')
    ]);
    const saved = await call<{ revision: number; files: { path: string }[] }>('snapshot', { projectId: 'isolation' });
    expect(saved.revision).toBe(4);
    expect(saved.files.map(file => file.path)).toEqual(['first.txt', 'nested/b.txt', 'second.txt']);
    await expect(
      call('save', { projectId: 'isolation', expectedRevision: 1, files: [{ path: 'stale.txt', content: 'stale' }] })
    ).rejects.toThrow(/revision/i);
    checks.push('two-worker-lock-revision-conflict-isolated-paths');
  }, 60_000);

  it('rolls back a quota failure and an interrupted multi-file write before acknowledging a new revision', async () => {
    await call('init', { projectId: 'recovery', files: [{ path: 'stable.txt', content: 'before' }] });
    const initial = await call('snapshot', { projectId: 'recovery' });
    await installFaultWorker('quota');
    await expect(
      call(
        'save',
        {
          projectId: 'recovery',
          files: [
            { path: 'stable.txt', content: 'after' },
            { path: 'interrupted.txt', content: 'fail' }
          ]
        },
        'faultProbe'
      )
    ).rejects.toThrow(/quota/i);
    expect(await call('snapshot', { projectId: 'recovery' })).toEqual(initial);
    await installFaultWorker('interrupt');
    await page.evaluate(
      () =>
        new Promise<void>((resolveInterrupted, reject) => {
          const target = globalThis as unknown as Record<string, Worker>;
          const timer = setTimeout(() => reject(new Error('interruption not reached')), 15_000);
          target['faultProbe'].onmessage = ({ data }: MessageEvent<{ interrupted?: boolean; error?: unknown }>) => {
            if (!data.interrupted) {
              clearTimeout(timer);
              reject(new Error(JSON.stringify(data)));
              return;
            }
            clearTimeout(timer);
            target['faultProbe'].terminate();
            resolveInterrupted();
          };
          target['faultProbe'].postMessage({
            id: 1,
            action: 'save',
            payload: {
              projectId: 'recovery',
              files: [
                { path: 'stable.txt', content: 'partial' },
                { path: 'interrupted.txt', content: 'stop' }
              ]
            }
          });
        })
    );
    await restart();
    expect(await call('snapshot', { projectId: 'recovery' })).toEqual(initial);
    await call('save', { projectId: 'recovery', files: [{ path: 'stable.txt', content: 'continued' }] });
    expect((await call<{ revision: number }>('snapshot', { projectId: 'recovery' })).revision).toBe(2);
    checks.push('quota-rollback-and-terminated-worker-journal-recovery');
  }, 60_000);

  it('rejects commits before staging and repeated submits without creating empty commits', async () => {
    await call('init', { projectId: 'premature', files: [{ path: 'main.ts', content: 'untracked' }] });
    await expect(call('commit', { projectId: 'premature', message: 'premature empty commit' })).rejects.toThrow(
      /staged/i
    );
    expect(await call('history', { projectId: 'premature' })).toEqual([]);
    await call('stage', { projectId: 'premature', paths: ['main.ts'] });
    await call('commit', { projectId: 'premature', message: 'actual content' });
    await expect(call('commit', { projectId: 'premature', message: 'duplicate submit' })).rejects.toThrow(/staged/i);
    expect(await call('history', { projectId: 'premature' })).toHaveLength(1);
    expect((await call<{ raw: string }>('status', { projectId: 'premature' })).raw).toBe('');
    checks.push('premature-and-repeated-commits-rejected-without-empty-history');
  }, 60_000);

  it('survives initial recovery journal stream failures and Worker termination before journal publication', async () => {
    await call('init', { projectId: 'journal-stream', files: [{ path: 'main.ts', content: 'original' }] });
    const before = await call('snapshot', { projectId: 'journal-stream' });
    for (const phase of ['create', 'write', 'close'] as const) {
      await installJournalFaultWorker(phase);
      await expect(
        call('save', { projectId: 'journal-stream', files: [{ path: 'main.ts', content: 'failed' }] }, 'journalProbe')
      ).rejects.toThrow(`journal ${phase} failed`);
      await restart();
      expect(await call('open', { projectId: 'journal-stream' })).toEqual(before);
      expect((await call<number[]>('export', { projectId: 'journal-stream' })).length).toBeGreaterThan(0);
    }
    await installJournalFaultWorker('interrupt');
    const unpublishedBytes = await page.evaluate(
      () =>
        new Promise<number>((resolveInterrupted, reject) => {
          const target = globalThis as unknown as Record<string, Worker>;
          const timer = setTimeout(() => reject(new Error('journal interruption not reached')), 15_000);
          target['journalProbe'].onmessage = ({
            data
          }: MessageEvent<{ interrupted?: boolean; unpublishedBytes?: number; error?: unknown }>) => {
            clearTimeout(timer);
            if (!data.interrupted) {
              reject(new Error(JSON.stringify(data)));
              return;
            }
            target['journalProbe'].terminate();
            resolveInterrupted(data.unpublishedBytes ?? -1);
          };
          target['journalProbe'].postMessage({
            id: 1,
            action: 'save',
            payload: { projectId: 'journal-stream', files: [{ path: 'main.ts', content: 'never published' }] }
          });
        })
    );
    expect(unpublishedBytes).toBe(0);
    await restart();
    expect(await call('open', { projectId: 'journal-stream' })).toEqual(before);
    const exported = await call<number[]>('export', { projectId: 'journal-stream' });
    const native = await materializeArchive(exported, 'journal-native');
    await execFile('git', ['-C', native, 'fsck', '--full']);
    expect(await readFile(join(native, 'main.ts'), 'utf8')).toBe('original');
    checks.push('unpublished-journal-create-write-close-failure-and-worker-interruption');
  }, 90_000);

  it('preserves ignored local bytes while restoring a tracked commit tree', async () => {
    await call('init', {
      projectId: 'ignored-restore',
      files: [
        { path: '.gitignore', content: 'notes.txt\n' },
        { path: 'main.ts', content: 'old' }
      ]
    });
    await call('stage', { projectId: 'ignored-restore', paths: ['.gitignore', 'main.ts'] });
    const first = await call<string>('commit', { projectId: 'ignored-restore', message: 'old tracked tree' });
    await call('save', {
      projectId: 'ignored-restore',
      files: [
        { path: 'main.ts', content: 'new' },
        { path: 'notes.txt', bytes: [0, 255, 128] }
      ]
    });
    await call('stage', { projectId: 'ignored-restore', paths: ['main.ts'] });
    await call('commit', { projectId: 'ignored-restore', message: 'new tracked tree' });
    expect((await call<{ raw: string }>('status', { projectId: 'ignored-restore' })).raw).toBe('');
    const restored = await call<{ files: { path: string; bytes: number[] }[] }>('restore', {
      projectId: 'ignored-restore',
      oid: first
    });
    expect(restored.files.find(file => file.path === 'notes.txt')?.bytes).toEqual([0, 255, 128]);
    expect(restored.files.find(file => file.path === 'main.ts')?.bytes).toEqual([...new TextEncoder().encode('old')]);
    checks.push('restore-preserves-ignored-binary-worktree-files');
  }, 60_000);

  it('rejects a restore target that would overwrite an ignored local file before changing bytes', async () => {
    await call('init', {
      projectId: 'ignored-conflict',
      files: [
        { path: '.gitignore', content: '' },
        { path: 'notes.txt', content: 'historical tracked content' }
      ]
    });
    await call('stage', { projectId: 'ignored-conflict', paths: ['.gitignore', 'notes.txt'] });
    const first = await call<string>('commit', { projectId: 'ignored-conflict', message: 'tracked notes' });
    await call('remove', { projectId: 'ignored-conflict', path: 'notes.txt' });
    await call('save', { projectId: 'ignored-conflict', files: [{ path: '.gitignore', content: 'notes.txt\n' }] });
    await call('stage', { projectId: 'ignored-conflict', paths: ['.gitignore', 'notes.txt'] });
    await call('commit', { projectId: 'ignored-conflict', message: 'ignore local notes' });
    await call('save', { projectId: 'ignored-conflict', files: [{ path: 'notes.txt', bytes: [0, 255, 13] }] });
    const before = await call('snapshot', { projectId: 'ignored-conflict' });
    await expect(call('restore', { projectId: 'ignored-conflict', oid: first })).rejects.toThrow(/ignored|conflict/i);
    expect(await call('snapshot', { projectId: 'ignored-conflict' })).toEqual(before);
    checks.push('restore-rejects-ignored-target-conflicts-without-mutation');
  }, 60_000);

  it('returns the actual renamed path for staging subsequent edits instead of the human rename display', async () => {
    await call('init', {
      projectId: 'renamed-path',
      files: [{ path: 'old.ts', content: 'export const value = 1;\n' }]
    });
    await call('stage', { projectId: 'renamed-path', paths: ['old.ts'] });
    await call('commit', { projectId: 'renamed-path', message: 'initial path' });
    await call('rename', { projectId: 'renamed-path', path: 'old.ts', destination: 'new name -> final.ts' });
    await call('stage', { projectId: 'renamed-path', paths: ['old.ts', 'new name -> final.ts'] });
    const renamed = await call<{ raw: string; entries: { path: string; index: string }[] }>('status', {
      projectId: 'renamed-path'
    });
    expect(renamed.entries.find(entry => entry.index === 'R')?.path, renamed.raw).toBe('new name -> final.ts');
    await call('save', {
      projectId: 'renamed-path',
      files: [{ path: 'new name -> final.ts', content: 'export const value = 2;\n' }]
    });
    const modified = await call<{ entries: { path: string }[] }>('status', { projectId: 'renamed-path' });
    await call('stage', { projectId: 'renamed-path', paths: modified.entries.map(entry => entry.path) });
    await call('commit', { projectId: 'renamed-path', message: 'renamed and edited' });
    expect((await call<{ raw: string }>('status', { projectId: 'renamed-path' })).raw).toBe('');
    checks.push('staged-rename-path-remains-machine-readable-after-edit');
  }, 60_000);

  it('stages a literal filename without treating wildcard characters as other file selectors', async () => {
    const selected = ['pattern*.ts', 'question?.ts', 'array[1].ts'];
    const unselected = ['pattern-other.ts', 'question1.ts', 'array1.ts'];
    await call('init', {
      projectId: 'literal-stage',
      files: [...selected, ...unselected].map(path => ({ path, content: path }))
    });
    await call('stage', { projectId: 'literal-stage', paths: selected });
    const status = await call<{ entries: { path: string; index: string }[] }>('status', { projectId: 'literal-stage' });
    for (const path of selected) expect(status.entries.find(entry => entry.path === path)?.index).toBe('A');
    for (const path of unselected) expect(status.entries.find(entry => entry.path === path)?.index).toBe('?');
    checks.push('literal-stage-paths-never-expand-to-unselected-files');
  }, 60_000);

  it('reads exact HEAD/index/worktree diff text with BOM and CRLF without changing the repository', async () => {
    const first = '\uFEFFfirst\r\n';
    const staged = '\uFEFFstaged\r\n';
    const working = '\uFEFFworking\r\n';
    await call('init', {
      projectId: 'diff-exact',
      files: [
        { path: 'file.ts', content: first },
        { path: 'asset.bin', bytes: [0, 255, 1] }
      ]
    });
    await call('stage', { projectId: 'diff-exact', paths: ['file.ts', 'asset.bin'] });
    await call('commit', { projectId: 'diff-exact', message: 'initial diff content' });
    await call('save', { projectId: 'diff-exact', files: [{ path: 'file.ts', content: staged }] });
    await call('stage', { projectId: 'diff-exact', paths: ['file.ts'] });
    await call('save', {
      projectId: 'diff-exact',
      files: [
        { path: 'file.ts', content: working },
        { path: 'asset.bin', bytes: [0, 254, 2] }
      ]
    });
    const before = await call('snapshot', { projectId: 'diff-exact' });
    const archiveBefore = unzipSync(new Uint8Array(await call<number[]>('export', { projectId: 'diff-exact' })));
    const changes = await call<{ base: { text: string }; modified: { text: string } }>('readDiff', {
      projectId: 'diff-exact',
      path: 'file.ts',
      kind: 'working'
    });
    expect(changes.base.text).toBe(staged);
    expect(changes.modified.text).toBe(working);
    const cached = await call<{ base: { text: string }; modified: { text: string } }>('readDiff', {
      projectId: 'diff-exact',
      path: 'file.ts',
      kind: 'staged'
    });
    expect(cached.base.text).toBe(first);
    expect(cached.modified.text).toBe(staged);
    const binary = await call<{
      base: { exists: boolean; binary: boolean; text: null; byteLength: number };
      modified: { binary: boolean };
    }>('readDiff', { projectId: 'diff-exact', path: 'asset.bin', kind: 'working' });
    expect(binary.base).toEqual({ exists: true, binary: true, text: null, byteLength: 3 });
    expect(binary.modified.binary).toBe(true);
    expect(await call('snapshot', { projectId: 'diff-exact' })).toEqual(before);
    const archiveAfter = unzipSync(new Uint8Array(await call<number[]>('export', { projectId: 'diff-exact' })));
    expect(archiveAfter['.git/index']).toEqual(archiveBefore['.git/index']);
    expect(archiveAfter['.git/HEAD']).toEqual(archiveBefore['.git/HEAD']);
    expect(Object.keys(archiveAfter).filter(path => path.startsWith('.git/'))).toEqual(
      Object.keys(archiveBefore).filter(path => path.startsWith('.git/'))
    );
    for (const [path, bytes] of Object.entries(archiveBefore))
      if (path.startsWith('.git/')) expect(archiveAfter[path]).toEqual(bytes);
    checks.push('exact-bom-crlf-binary-diffs-preserve-head-index-and-working-bytes');
  }, 60_000);

  it('unstages one path while retaining other staged bytes and all working revisions', async () => {
    await call('init', {
      projectId: 'unstage-one',
      files: [
        { path: 'a.ts', content: 'a1' },
        { path: 'b.ts', content: 'b1' }
      ]
    });
    await call('stage', { projectId: 'unstage-one', paths: ['a.ts', 'b.ts'] });
    const head = await call<string>('commit', { projectId: 'unstage-one', message: 'initial' });
    await call('save', {
      projectId: 'unstage-one',
      files: [
        { path: 'a.ts', content: 'a2' },
        { path: 'b.ts', content: 'b2' }
      ]
    });
    await call('stage', { projectId: 'unstage-one', paths: ['a.ts', 'b.ts'] });
    await call('save', { projectId: 'unstage-one', files: [{ path: 'a.ts', content: 'a3' }] });
    const before = await call('snapshot', { projectId: 'unstage-one' });
    await call('unstage', { projectId: 'unstage-one', paths: ['a.ts'] });
    expect(await call('snapshot', { projectId: 'unstage-one' })).toEqual(before);
    const status = await call<{ head: string; raw: string }>('status', { projectId: 'unstage-one' });
    expect(status.head).toBe(head);
    expect(status.raw).toContain(' M a.ts');
    expect(status.raw).toContain('M  b.ts');
    const native = await materializeArchive(
      await call<number[]>('export', { projectId: 'unstage-one' }),
      'unstage-native'
    );
    expect((await execFile('git', ['-C', native, 'show', ':a.ts'])).stdout).toBe('a1');
    expect((await execFile('git', ['-C', native, 'show', ':b.ts'])).stdout).toBe('b2');
    await call('init', { projectId: 'unstage-unborn', files: [{ path: 'new*.ts', content: 'new' }] });
    await call('stage', { projectId: 'unstage-unborn', paths: ['new*.ts'] });
    await call('unstage', { projectId: 'unstage-unborn', paths: ['new*.ts'] });
    expect((await call<{ raw: string; head: null }>('status', { projectId: 'unstage-unborn' })).raw).toBe('?? new*.ts');
    checks.push('per-file-unstage-keeps-other-index-working-bytes-and-unborn-head');
  }, 60_000);

  it('discards only the selected saved working file back to index and deletes confirmed untracked additions', async () => {
    await call('init', {
      projectId: 'discard-one',
      files: [
        { path: 'a.ts', content: 'one' },
        { path: 'b.ts', content: 'keep' },
        { path: 'asset.bin', bytes: [0, 255, 1] }
      ]
    });
    await call('stage', { projectId: 'discard-one', paths: ['a.ts', 'b.ts', 'asset.bin'] });
    await call('commit', { projectId: 'discard-one', message: 'initial' });
    await call('save', { projectId: 'discard-one', files: [{ path: 'a.ts', content: 'staged' }] });
    await call('stage', { projectId: 'discard-one', paths: ['a.ts'] });
    await call('save', {
      projectId: 'discard-one',
      files: [
        { path: 'a.ts', content: 'working' },
        { path: 'b.ts', content: 'untouched working' },
        { path: 'asset.bin', bytes: [0, 254, 2] },
        { path: 'new.ts', content: 'new' }
      ]
    });
    const archiveBefore = unzipSync(new Uint8Array(await call<number[]>('export', { projectId: 'discard-one' })));
    const discarded = await call<{ files: { path: string; bytes: number[] }[] }>('discardWorking', {
      projectId: 'discard-one',
      path: 'a.ts'
    });
    expect(discarded.files.find(file => file.path === 'a.ts')?.bytes).toEqual([...new TextEncoder().encode('staged')]);
    expect(discarded.files.find(file => file.path === 'b.ts')?.bytes).toEqual([
      ...new TextEncoder().encode('untouched working')
    ]);
    await call('discardWorking', { projectId: 'discard-one', path: 'asset.bin' });
    await call('discardWorking', { projectId: 'discard-one', path: 'new.ts' });
    const after = await call<{ files: { path: string; bytes: number[] }[] }>('snapshot', { projectId: 'discard-one' });
    expect(after.files.find(file => file.path === 'asset.bin')?.bytes).toEqual([0, 255, 1]);
    expect(after.files.some(file => file.path === 'new.ts')).toBe(false);
    const archiveAfter = unzipSync(new Uint8Array(await call<number[]>('export', { projectId: 'discard-one' })));
    expect(archiveAfter['.git/index']).toEqual(archiveBefore['.git/index']);
    expect(archiveAfter['.git/HEAD']).toEqual(archiveBefore['.git/HEAD']);
    checks.push('per-file-discard-restores-index-bytes-and-keeps-staged-and-other-files');
  }, 60_000);

  it('reads renamed staged content against the original path and unstages both rename sides', async () => {
    await call('init', {
      projectId: 'unstage-rename',
      files: [{ path: 'old name.ts', content: 'initial renamed text' }]
    });
    await call('stage', { projectId: 'unstage-rename', paths: ['old name.ts'] });
    await call('commit', { projectId: 'unstage-rename', message: 'initial' });
    await call('rename', { projectId: 'unstage-rename', path: 'old name.ts', destination: 'new name.ts' });
    await call('stage', { projectId: 'unstage-rename', paths: ['old name.ts', 'new name.ts'] });
    const diff = await call<{ base: { text: string }; modified: { text: string } }>('readDiff', {
      projectId: 'unstage-rename',
      path: 'new name.ts',
      kind: 'staged'
    });
    expect(diff.base.text).toBe('initial renamed text');
    expect(diff.modified.text).toBe('initial renamed text');
    await call('save', {
      projectId: 'unstage-rename',
      files: [{ path: 'new name.ts', content: 'working renamed text' }]
    });
    await call('unstage', { projectId: 'unstage-rename', paths: ['new name.ts'] });
    const status = await call<{ raw: string }>('status', { projectId: 'unstage-rename' });
    expect(status.raw).toContain(' D old name.ts');
    expect(status.raw).toContain('?? new name.ts');
    checks.push('rename-diff-and-unstage-respect-original-and-new-paths');
  }, 60_000);

  it('round-trips BOM and CRLF through the public Git backend without rewriting encoding on save', async () => {
    await page.addScriptTag({
      type: 'module',
      content:
        "import { createGitBackend } from '/client.js'; globalThis.publicGitBackend = createGitBackend(location.origin + '/');"
    });
    const result = await page.evaluate(async () => {
      const backend = (
        globalThis as unknown as {
          publicGitBackend: {
            create(id: string, files: Record<string, string>): Promise<{ files: Record<string, string> }>;
            open(id: string): Promise<{ revision: string; files: Record<string, string> }>;
            save(
              id: string,
              files: Record<string, string>,
              revision: string
            ): Promise<{ files: Record<string, string> }>;
            exportArchive(id: string): Promise<Uint8Array>;
            dispose(): void;
          };
        }
      ).publicGitBackend;
      try {
        const text = '\uFEFFpublic text\r\n';
        const created = await backend.create('bom-public', { 'main.ts': text });
        const opened = await backend.open('bom-public');
        const saved = await backend.save('bom-public', opened.files, opened.revision);
        return {
          created: created.files['main.ts'],
          opened: opened.files['main.ts'],
          saved: saved.files['main.ts'],
          archive: [...(await backend.exportArchive('bom-public'))]
        };
      } finally {
        backend.dispose();
      }
    });
    expect(result.created).toBe('\uFEFFpublic text\r\n');
    expect(result.opened).toBe(result.created);
    expect(result.saved).toBe(result.created);
    const archive = unzipSync(new Uint8Array(result.archive));
    expect([...archive['main.ts']]).toEqual([...new TextEncoder().encode('\uFEFFpublic text\r\n')]);
    checks.push('public-backend-create-open-save-preserves-bom-crlf-exactly');
  }, 60_000);

  it('rolls back real OPFS failures during unstage index persistence and single-file discard', async () => {
    await call('init', { projectId: 'scm-failure', files: [{ path: 'a.ts', content: 'head' }] });
    await call('stage', { projectId: 'scm-failure', paths: ['a.ts'] });
    await call('commit', { projectId: 'scm-failure', message: 'initial' });
    await call('save', { projectId: 'scm-failure', files: [{ path: 'a.ts', content: 'staged' }] });
    await call('stage', { projectId: 'scm-failure', paths: ['a.ts'] });
    await call('save', { projectId: 'scm-failure', files: [{ path: 'a.ts', content: 'working' }] });
    const before = await call('snapshot', { projectId: 'scm-failure' });
    const status = await call('status', { projectId: 'scm-failure' });
    const index = unzipSync(new Uint8Array(await call<number[]>('export', { projectId: 'scm-failure' })))['.git/index'];
    await installFaultWorker('quota', 'index');
    await expect(call('unstage', { projectId: 'scm-failure', paths: ['a.ts'] }, 'faultProbe')).rejects.toThrow(
      /quota/i
    );
    await restart();
    expect(await call('snapshot', { projectId: 'scm-failure' })).toEqual(before);
    expect(await call('status', { projectId: 'scm-failure' })).toEqual(status);
    await installFaultWorker('quota', 'a.ts');
    await expect(call('discardWorking', { projectId: 'scm-failure', path: 'a.ts' }, 'faultProbe')).rejects.toThrow(
      /quota/i
    );
    await restart();
    expect(await call('snapshot', { projectId: 'scm-failure' })).toEqual(before);
    expect(await call('status', { projectId: 'scm-failure' })).toEqual(status);
    expect(
      unzipSync(new Uint8Array(await call<number[]>('export', { projectId: 'scm-failure' })))['.git/index']
    ).toEqual(index);
    checks.push('scm-unstage-and-discard-quota-rollback-preserve-index-and-working');
  }, 60_000);

  it('writes only changed and new source paths in a full 50-file save and leaves unchanged OPFS mtimes intact', async () => {
    await installCountingWorker();
    const files = Array.from({ length: 50 }, (_, index) => ({
      path: `f-${index}.ts`,
      content: `export const value = ${index};\n`
    }));
    await call('init', { projectId: 'save-counts', files }, 'countingProbe');
    await call('stage', { projectId: 'save-counts', paths: files.map(file => file.path) }, 'countingProbe');
    await call('commit', { projectId: 'save-counts', message: 'initial 50 files' }, 'countingProbe');
    const before = await call<Record<string, number>>(
      'sourceWriteCounts',
      { projectId: 'save-counts' },
      'countingProbe'
    );
    const mtime = await page.evaluate(async () => {
      let directory = await navigator.storage.getDirectory();
      for (const part of ['aiao-browser-workbench', 'projects', 'save-counts', 'repository'])
        directory = await directory.getDirectoryHandle(part);
      return (await (await directory.getFileHandle('f-40.ts')).getFile()).lastModified;
    });
    const next = files.map(file =>
      file.path === 'f-25.ts' ? { ...file, content: 'export const value = 99;\n' } : file
    );
    next.push({ path: 'f-50.ts', content: 'new source\n' });
    const saved = await call<{ revision: number }>(
      'save',
      { projectId: 'save-counts', files: next, expectedRevision: 1 },
      'countingProbe'
    );
    expect(saved.revision).toBe(2);
    const after = await call<Record<string, number>>(
      'sourceWriteCounts',
      { projectId: 'save-counts' },
      'countingProbe'
    );
    expect(after['f-25.ts']).toBe(before['f-25.ts'] + 1);
    expect(after['f-50.ts']).toBe(1);
    for (const file of files.filter(file => file.path !== 'f-25.ts')) expect(after[file.path]).toBe(before[file.path]);
    expect(
      await page.evaluate(async () => {
        let directory = await navigator.storage.getDirectory();
        for (const part of ['aiao-browser-workbench', 'projects', 'save-counts', 'repository'])
          directory = await directory.getDirectoryHandle(part);
        return (await (await directory.getFileHandle('f-40.ts')).getFile()).lastModified;
      })
    ).toBe(mtime);
    const status = await call<{ raw: string }>('status', { projectId: 'save-counts' }, 'countingProbe');
    expect(status.raw).toContain(' M f-25.ts');
    expect(status.raw).toContain('?? f-50.ts');
    const noop = await call<{ revision: number }>(
      'save',
      { projectId: 'save-counts', files: next, expectedRevision: 2 },
      'countingProbe'
    );
    expect(noop.revision).toBe(3);
    expect(await call('sourceWriteCounts', { projectId: 'save-counts' }, 'countingProbe')).toEqual(after);
    checks.push('full-save-50-files-writes-only-changed-new-paths-and-preserves-mtime');
  }, 60_000);
});
