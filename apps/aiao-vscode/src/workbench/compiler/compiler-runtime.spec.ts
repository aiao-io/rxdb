import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workbenchImportMap } from '../assets.js';
import { loadRuntimeBundle } from './compiler-runtime.js';

describe('固定运行时资源与摘要', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { href: 'https://ide.test/' });
  });
  afterEach(() => vi.unstubAllGlobals());

  function fixture() {
    const imports = workbenchImportMap('https://assets.test/');
    const modules = Object.fromEntries(
      Object.entries(imports).map(([specifier, url]) => [
        new URL(url).pathname.split('/').at(-1)!.slice(0, -3),
        specifier
      ])
    );
    const sources = Object.fromEntries(
      [
        ...Object.values(imports).map(url => new URL(url).pathname.slice(1)),
        'runtime/chunk-shared.js',
        'git/worker.js'
      ].map(path => [path, `export const marker=${JSON.stringify(path)};`])
    );
    const manifest = {
      version: 1,
      modules,
      assets: Object.entries(sources).map(([path, content]) => ({
        path,
        bytes: Buffer.byteLength(content),
        sha256: createHash('sha256').update(content).digest('hex')
      }))
    };
    const fetch = vi.fn(async (url: string) => {
      if (url === 'https://assets.test/manifest.json') return new Response(JSON.stringify(manifest));
      const source = sources[new URL(url).pathname.slice(1)];
      return source === undefined ? new Response('', { status: 404 }) : new Response(source);
    });
    vi.stubGlobal('fetch', fetch);
    return { sources, manifest, fetch };
  }

  it('只拉取 runtime JS，核对摘要并把固定裸模块映射到虚拟路径', async () => {
    const { fetch } = fixture();
    const result = await loadRuntimeBundle(new URL('https://assets.test/'));
    expect(result.runtimeImports['react']).toBe('runtime/react.js');
    expect(result.runtimeFiles['runtime/chunk-shared.js']).toContain('marker');
    expect(result.runtimeFiles['git/worker.js']).toBeUndefined();
    expect(fetch.mock.calls.some(([url]) => url.includes('/git/'))).toBe(false);
  });

  it('内容摘要变化或资源缺失都明确失败，不信任缓存命中', async () => {
    const { sources } = fixture();
    sources['runtime/react.js'] = sources['runtime/react.js'].replace('marker', 'tamper');
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('SHA-256');
    delete sources['runtime/react.js'];
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('未缓存');
  });

  it('资源长度与 manifest 不一致时失败', async () => {
    const { sources } = fixture();
    sources['runtime/react.js'] += '\n';
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('长度');
  });

  it('manifest 不能授予未知依赖或越界资源路径', async () => {
    const { manifest } = fixture();
    manifest.modules['react'] = 'unknown';
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('依赖映射');
    manifest.modules['react'] = 'react';
    manifest.assets[0].path = '../private.js';
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('路径');
  });

  it('manifest 缺失版本、增加依赖映射或缺失固定入口均不能运行', async () => {
    const { manifest } = fixture();
    manifest.version = 2;
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('版本');
    manifest.version = 1;
    manifest.modules['unknown'] = 'unknown';
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('未知依赖');
    delete manifest.modules['unknown'];
    manifest.assets = manifest.assets.filter(asset => asset.path !== 'runtime/vue.js');
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('入口未缓存');
  });

  it.each([
    'runtime//react.js',
    '/runtime/react.js',
    'runtime/./react.js',
    'runtime/react.js?latest',
    'runtime\\react.js'
  ])('拒绝非规范资源路径：%s', async path => {
    const { manifest } = fixture();
    manifest.assets[0].path = path;
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('路径');
  });

  it('资源条目重复、摘要格式错误与超限清单均给出诊断', async () => {
    const { manifest } = fixture();
    manifest.assets.push({ ...manifest.assets[0] });
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('重复');
    manifest.assets.pop();
    manifest.assets[0].sha256 = 'invalid';
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('摘要');
    manifest.assets[0].sha256 = 'a'.repeat(64);
    manifest.assets[0].bytes = 33 * 1024 * 1024;
    await expect(loadRuntimeBundle(new URL('https://assets.test/'))).rejects.toThrow('上限');
  });
});
