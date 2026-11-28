import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, resolveConfig } from 'vite';
import { assert, describe, expect, it } from 'vitest';

const configFile = resolve(import.meta.dirname, '../../vite.config.mts');

describe('benchmark Vite config', () => {
  it('lets Vite crawl workspace source dependencies before the CI benchmark starts', async () => {
    const config = await resolveConfig({ configFile }, 'serve');

    expect(config.optimizeDeps.exclude).not.toContain('@aiao/rxdb');
    expect(config.optimizeDeps.exclude).not.toContain('@aiao/rxdb-plugin-search');
  });

  it('loads the Git demo vendor assets from the website base path', { timeout: 30_000 }, async ({ onTestFinished }) => {
    const outDir = await mkdtemp(join(tmpdir(), 'git-opfs-demo-'));
    onTestFinished(() => rm(outDir, { recursive: true, force: true }));
    await build({
      configFile,
      base: '/benchmarks-app/',
      logLevel: 'warn',
      build: {
        outDir,
        rollupOptions: { input: resolve(import.meta.dirname, '../../browser-git-opfs-demo.html') }
      }
    });

    const assetDir = join(outDir, 'assets');
    const worker = (await readdir(assetDir)).find(name => name.startsWith('worker-') && name.endsWith('.js'));
    assert(worker);
    const source = await readFile(join(assetDir, worker), 'utf8');
    expect.soft(source).toContain('/benchmarks-app/git-demo/vendor/lg2_opfs_auto.js');
    expect((await readdir(join(outDir, 'git-demo/vendor'))).sort()).toEqual([
      'lg2_opfs_auto.js',
      'lg2_opfs_jspi.js',
      'lg2_opfs_jspi.wasm'
    ]);
  });
});
