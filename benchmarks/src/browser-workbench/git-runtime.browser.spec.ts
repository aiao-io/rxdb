import { build } from 'esbuild';
import { unzipSync } from 'fflate';
import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

async function installFaultWorker(mode: 'quota' | 'interrupt'): Promise<void> {
  await page.evaluate(async mode => {
    const wrapper = `
      let failure = ${JSON.stringify(mode)};
      const original = FileSystemFileHandle.prototype.createSyncAccessHandle;
      FileSystemFileHandle.prototype.createSyncAccessHandle = async function (...args) {
        if (failure && this.name === 'interrupted.txt') {
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
    target.faultProbe = worker;
    await new Promise<void>((resolveReady, reject) => {
      worker.onmessage = () => resolveReady();
      worker.onerror = event => reject(new Error(event.message));
    });
  }, mode);
}

async function restart(): Promise<void> {
  await page.evaluate(() => {
    const target = globalThis as unknown as { gitProbe?: Worker };
    target.gitProbe?.terminate();
    target.gitProbe = undefined;
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
    target.journalProbe?.terminate();
    const worker = new Worker(URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' })), { type: 'module' });
    target.journalProbe = worker;
    await new Promise<void>((resolveReady, reject) => { worker.onmessage = () => resolveReady(); worker.onerror = event => reject(new Error(event.message)); });
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
    for (const name of ['lg2_opfs_auto.js', 'lg2_opfs_jspi.js', 'lg2_opfs_jspi.wasm']) {
      await cp(resolve('node_modules/wasm-git', name), join(assets, 'vendor', name));
    }
    await build({
      entryPoints: [resolve('../packages/browser-workbench/src/git/git-worker.ts')],
      outfile: join(assets, 'worker.js'),
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
        response.end(await readFile(join(assets, path)));
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
        status: checks.length === 10 ? 'passed' : 'failed',
        checks,
        measurements,
        wasmLinearMemoryBytes: metrics.memoryBytes,
        storage: await page.evaluate(() => navigator.storage.estimate()),
        caveats: [
          'Single fixture run; timings are observations rather than performance thresholds.',
          'Wasm linear memory excludes JS caches and browser process memory.'
        ]
      };
      await writeFile(resolve('reports/browser-workbench-git-us404.json'), `${JSON.stringify(report, null, 2)}\n`);
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
          target.faultProbe.onmessage = ({ data }: MessageEvent<{ interrupted?: boolean; error?: unknown }>) => {
            if (!data.interrupted) {
              clearTimeout(timer);
              reject(new Error(JSON.stringify(data)));
              return;
            }
            clearTimeout(timer);
            target.faultProbe.terminate();
            resolveInterrupted();
          };
          target.faultProbe.postMessage({
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
      await expect(call('save', { projectId: 'journal-stream', files: [{ path: 'main.ts', content: 'failed' }] }, 'journalProbe')).rejects.toThrow(`journal ${phase} failed`);
      await restart();
      expect(await call('open', { projectId: 'journal-stream' })).toEqual(before);
      expect((await call<number[]>('export', { projectId: 'journal-stream' })).length).toBeGreaterThan(0);
    }
    await installJournalFaultWorker('interrupt');
    const unpublishedBytes = await page.evaluate(() => new Promise<number>((resolveInterrupted, reject) => {
      const target = globalThis as unknown as Record<string, Worker>;
      const timer = setTimeout(() => reject(new Error('journal interruption not reached')), 15_000);
      target.journalProbe.onmessage = ({ data }: MessageEvent<{ interrupted?: boolean; unpublishedBytes?: number; error?: unknown }>) => {
        clearTimeout(timer);
        if (!data.interrupted) { reject(new Error(JSON.stringify(data))); return; }
        target.journalProbe.terminate(); resolveInterrupted(data.unpublishedBytes ?? -1);
      };
      target.journalProbe.postMessage({ id: 1, action: 'save', payload: { projectId: 'journal-stream', files: [{ path: 'main.ts', content: 'never published' }] } });
    }));
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
    await call('init', { projectId: 'ignored-restore', files: [{ path: '.gitignore', content: 'notes.txt\n' }, { path: 'main.ts', content: 'old' }] });
    await call('stage', { projectId: 'ignored-restore', paths: ['.gitignore', 'main.ts'] });
    const first = await call<string>('commit', { projectId: 'ignored-restore', message: 'old tracked tree' });
    await call('save', { projectId: 'ignored-restore', files: [{ path: 'main.ts', content: 'new' }, { path: 'notes.txt', bytes: [0, 255, 128] }] });
    await call('stage', { projectId: 'ignored-restore', paths: ['main.ts'] });
    await call('commit', { projectId: 'ignored-restore', message: 'new tracked tree' });
    expect((await call<{ raw: string }>('status', { projectId: 'ignored-restore' })).raw).toBe('');
    const restored = await call<{ files: { path: string; bytes: number[] }[] }>('restore', { projectId: 'ignored-restore', oid: first });
    expect(restored.files.find(file => file.path === 'notes.txt')?.bytes).toEqual([0, 255, 128]);
    expect(restored.files.find(file => file.path === 'main.ts')?.bytes).toEqual([...new TextEncoder().encode('old')]);
    checks.push('restore-preserves-ignored-binary-worktree-files');
  }, 60_000);

  it('rejects a restore target that would overwrite an ignored local file before changing bytes', async () => {
    await call('init', { projectId: 'ignored-conflict', files: [{ path: '.gitignore', content: '' }, { path: 'notes.txt', content: 'historical tracked content' }] });
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
    await call('init', { projectId: 'renamed-path', files: [{ path: 'old.ts', content: 'export const value = 1;\n' }] });
    await call('stage', { projectId: 'renamed-path', paths: ['old.ts'] });
    await call('commit', { projectId: 'renamed-path', message: 'initial path' });
    await call('rename', { projectId: 'renamed-path', path: 'old.ts', destination: 'new name -> final.ts' });
    await call('stage', { projectId: 'renamed-path', paths: ['old.ts', 'new name -> final.ts'] });
    const renamed = await call<{ raw: string; entries: { path: string; index: string }[] }>('status', { projectId: 'renamed-path' });
    expect(renamed.entries.find(entry => entry.index === 'R')?.path, renamed.raw).toBe('new name -> final.ts');
    await call('save', { projectId: 'renamed-path', files: [{ path: 'new name -> final.ts', content: 'export const value = 2;\n' }] });
    const modified = await call<{ entries: { path: string }[] }>('status', { projectId: 'renamed-path' });
    await call('stage', { projectId: 'renamed-path', paths: modified.entries.map(entry => entry.path) });
    await call('commit', { projectId: 'renamed-path', message: 'renamed and edited' });
    expect((await call<{ raw: string }>('status', { projectId: 'renamed-path' })).raw).toBe('');
    checks.push('staged-rename-path-remains-machine-readable-after-edit');
  }, 60_000);

  it('stages a literal filename without treating wildcard characters as other file selectors', async () => {
    const selected = ['pattern*.ts', 'question?.ts', 'array[1].ts'];
    const unselected = ['pattern-other.ts', 'question1.ts', 'array1.ts'];
    await call('init', { projectId: 'literal-stage', files: [...selected, ...unselected].map(path => ({ path, content: path })) });
    await call('stage', { projectId: 'literal-stage', paths: selected });
    const status = await call<{ entries: { path: string; index: string }[] }>('status', { projectId: 'literal-stage' });
    for (const path of selected) expect(status.entries.find(entry => entry.path === path)?.index).toBe('A');
    for (const path of unselected) expect(status.entries.find(entry => entry.path === path)?.index).toBe('?');
    checks.push('literal-stage-paths-never-expand-to-unselected-files');
  }, 60_000);
});
