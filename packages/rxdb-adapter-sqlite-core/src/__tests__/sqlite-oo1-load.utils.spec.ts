import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOo1InitOptions,
  defaultPrintErr,
  defaultWarn,
  resolveLocateFile,
  rewriteOpfsProxyWorkerUrl,
  shouldIgnoreSqliteMessage,
  withGlobalOo1LoadLock,
  withPatchedOpfsProxyWorker,
  withSqliteApiConfig
} from '../sqlite-oo1-load.utils.js';

const globalWithConfig = globalThis as typeof globalThis & { sqlite3ApiConfig?: Record<string, unknown> };

describe('sqlite-oo1-load.utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rewriteOpfsProxyWorkerUrl', () => {
    it('preserves the vfs query string that @sqlite.org/sqlite-wasm attaches to the proxy worker URL', () => {
      const scriptUrl = 'http://localhost:4200/node_modules/.pnpm/x/sqlite3-opfs-async-proxy.js?vfs=opfs';
      const opfsProxyPath = '/official-sqlite-wasm/sqlite3-opfs-async-proxy.js';

      const result = rewriteOpfsProxyWorkerUrl(scriptUrl, opfsProxyPath);

      expect(result.toString()).toBe('http://localhost:4200/official-sqlite-wasm/sqlite3-opfs-async-proxy.js?vfs=opfs');
    });

    it('preserves the opfs-wl variant of the vfs query string', () => {
      const scriptUrl = 'http://localhost:4200/pkg/sqlite3-opfs-async-proxy.js?vfs=opfs-wl';
      const opfsProxyPath = '/assets/sqlite3-opfs-async-proxy.js';

      const result = rewriteOpfsProxyWorkerUrl(scriptUrl, opfsProxyPath);

      expect(result.toString()).toBe('http://localhost:4200/assets/sqlite3-opfs-async-proxy.js?vfs=opfs-wl');
    });

    it('lets an explicit query param on opfsProxyPath win over the original', () => {
      const scriptUrl = 'http://localhost:4200/pkg/sqlite3-opfs-async-proxy.js?vfs=opfs';
      const opfsProxyPath = '/assets/sqlite3-opfs-async-proxy.js?vfs=opfs-wl';

      const result = rewriteOpfsProxyWorkerUrl(scriptUrl, opfsProxyPath);

      expect(result.toString()).toBe('http://localhost:4200/assets/sqlite3-opfs-async-proxy.js?vfs=opfs-wl');
    });

    it('returns non-proxy URLs unchanged', () => {
      const scriptUrl = 'http://localhost:4200/pkg/sqlite3.wasm';

      const result = rewriteOpfsProxyWorkerUrl(scriptUrl, '/assets/sqlite3-opfs-async-proxy.js');

      expect(result).toBe(scriptUrl);
    });

    it('应该识别 URL 对象形式的 proxy worker 地址', () => {
      const scriptUrl = new URL('http://localhost:4200/pkg/sqlite3-opfs-async-proxy.js?vfs=opfs');

      const result = rewriteOpfsProxyWorkerUrl(scriptUrl, '/assets/sqlite3-opfs-async-proxy.js');

      expect(result.toString()).toBe('http://localhost:4200/assets/sqlite3-opfs-async-proxy.js?vfs=opfs');
    });

    it('应该识别带版本后缀的 proxy worker 文件名', () => {
      const scriptUrl = 'http://localhost:4200/pkg/sqlite3-opfs-async-proxy-abc123.js';

      const result = rewriteOpfsProxyWorkerUrl(scriptUrl, '/assets/sqlite3-opfs-async-proxy.js');

      expect(result.toString()).toBe('http://localhost:4200/assets/sqlite3-opfs-async-proxy.js');
    });

    it('scriptUrl 无法解析时应该用正则兜底识别并返回 opfsProxyPath', () => {
      // 'http://[' 是非法 host，new URL 会抛错，但正则兜底仍能识别出 proxy 文件名
      const scriptUrl = 'http://[/sqlite3-opfs-async-proxy-x.js';

      const result = rewriteOpfsProxyWorkerUrl(scriptUrl, '/assets/sqlite3-opfs-async-proxy.js');

      expect(result).toBe('/assets/sqlite3-opfs-async-proxy.js');
    });

    it('opfsProxyPath 无法解析为 URL 时应该原样返回 opfsProxyPath', () => {
      const scriptUrl = 'http://localhost:4200/pkg/sqlite3-opfs-async-proxy.js?vfs=opfs';

      const result = rewriteOpfsProxyWorkerUrl(scriptUrl, 'http://[');

      expect(result).toBe('http://[');
    });
  });

  describe('shouldIgnoreSqliteMessage', () => {
    it('命中已知噪音模式时应该返回 true', () => {
      expect(shouldIgnoreSqliteMessage(['sqlite3_wasm_extra_init()'])).toBe(true);
      expect(
        shouldIgnoreSqliteMessage([
          'Ignoring inability to install OPFS sqlite3_vfs: The OPFS sqlite3_vfs cannot run in the main thread because it requires Atomics.wait().'
        ])
      ).toBe(true);
    });

    it('多个参数应该以空格拼接后匹配', () => {
      expect(shouldIgnoreSqliteMessage(['prefix', 'sqlite3_wasm_extra_init()', 42])).toBe(true);
    });

    it('未命中模式时应该返回 false', () => {
      expect(shouldIgnoreSqliteMessage(['ordinary sqlite error'])).toBe(false);
      expect(shouldIgnoreSqliteMessage([])).toBe(false);
    });
  });

  describe('defaultPrintErr / defaultWarn', () => {
    it('defaultPrintErr 应该过滤已知噪音', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      defaultPrintErr('sqlite3_wasm_extra_init()');
      expect(errorSpy).not.toHaveBeenCalled();

      defaultPrintErr('real failure');
      expect(errorSpy).toHaveBeenCalledWith('real failure');
    });

    it('defaultWarn 应该过滤已知噪音并透传其余参数', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      defaultWarn('sqlite3_wasm_extra_init()', 'extra');
      expect(warnSpy).not.toHaveBeenCalled();

      defaultWarn('real warning', 123);
      expect(warnSpy).toHaveBeenCalledWith('real warning', 123);
    });
  });

  describe('withSqliteApiConfig', () => {
    afterEach(() => {
      delete globalWithConfig.sqlite3ApiConfig;
    });

    it('无既有配置时应该在执行后删除全局配置', async () => {
      delete globalWithConfig.sqlite3ApiConfig;

      const result = await withSqliteApiConfig({ warn: 'w' }, async () => {
        expect(globalWithConfig.sqlite3ApiConfig).toEqual({ warn: 'w' });
        return 'done';
      });

      expect(result).toBe('done');
      expect('sqlite3ApiConfig' in globalWithConfig).toBe(false);
    });

    it('有既有配置时应该合并并在执行后还原', async () => {
      const previous = { existing: 1 };
      globalWithConfig.sqlite3ApiConfig = previous;

      await withSqliteApiConfig({ added: 2 }, async () => {
        expect(globalWithConfig.sqlite3ApiConfig).toEqual({ existing: 1, added: 2 });
      });

      expect(globalWithConfig.sqlite3ApiConfig).toBe(previous);
    });

    it('run 抛错时也应该还原全局配置', async () => {
      delete globalWithConfig.sqlite3ApiConfig;

      await expect(
        withSqliteApiConfig({ warn: 'w' }, () => Promise.reject(new Error('load boom')))
      ).rejects.toThrow('load boom');

      expect('sqlite3ApiConfig' in globalWithConfig).toBe(false);
    });
  });

  describe('resolveLocateFile', () => {
    it('locateFile 优先级应该最高', () => {
      const locateFile = (name: string) => `/custom/${name}`;

      expect(resolveLocateFile({ locateFile, wasmPath: '/ignored.wasm' })).toBe(locateFile);
    });

    it('提供 wasmPath 时应该包装为固定返回值的函数', () => {
      const resolved = resolveLocateFile({ wasmPath: '/assets/sqlite3.wasm' });

      expect(resolved?.('sqlite3.wasm')).toBe('/assets/sqlite3.wasm');
    });

    it('未提供任何选项时应该返回 undefined', () => {
      expect(resolveLocateFile()).toBeUndefined();
      expect(resolveLocateFile({})).toBeUndefined();
    });
  });

  describe('withGlobalOo1LoadLock', () => {
    it('应该把并发加载串行化', async () => {
      const order: string[] = [];

      const first = withGlobalOo1LoadLock(async () => {
        order.push('first-start');
        await new Promise(resolve => setTimeout(resolve, 20));
        order.push('first-end');
        return 1;
      });
      const second = withGlobalOo1LoadLock(async () => {
        order.push('second-start');
        return 2;
      });

      await expect(first).resolves.toBe(1);
      await expect(second).resolves.toBe(2);
      expect(order).toEqual(['first-start', 'first-end', 'second-start']);
    });
  });

  describe('withPatchedOpfsProxyWorker', () => {
    it('未启用 opfs 时应该直通执行且不改写 Worker', async () => {
      const originalWorker = globalThis.Worker;

      const result = await withPatchedOpfsProxyWorker(undefined, async () => {
        expect(globalThis.Worker).toBe(originalWorker);
        return 'direct';
      });

      expect(result).toBe('direct');
    });

    it('缺少 opfsProxyPath 时应该直通执行', async () => {
      const originalWorker = globalThis.Worker;

      await withPatchedOpfsProxyWorker({ opfs: true }, async () => {
        expect(globalThis.Worker).toBe(originalWorker);
      });
    });

    it('Worker 不可用时应该直通执行', async () => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
      Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: undefined });

      try {
        const result = await withPatchedOpfsProxyWorker(
          { opfs: true, opfsProxyPath: '/assets/sqlite3-opfs-async-proxy.js' },
          async () => 'no-worker'
        );
        expect(result).toBe('no-worker');
      } finally {
        if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
      }
    });

    it('patch 期间应该重写 proxy worker URL 并在结束后恢复 Worker', async () => {
      const constructed: (string | URL)[] = [];
      class FakeWorker {
        constructor(scriptUrl: string | URL) {
          constructed.push(scriptUrl);
        }
      }
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        writable: true,
        value: FakeWorker as unknown as typeof Worker
      });

      try {
        await withPatchedOpfsProxyWorker(
          { opfs: true, opfsProxyPath: '/assets/sqlite3-opfs-async-proxy.js' },
          async () => {
            expect(globalThis.Worker).not.toBe(FakeWorker);
            new Worker('http://localhost:4200/pkg/sqlite3-opfs-async-proxy.js?vfs=opfs');
            new Worker('http://localhost:4200/pkg/other-worker.js');
          }
        );

        expect(constructed).toHaveLength(2);
        expect(constructed[0].toString()).toBe('http://localhost:4200/assets/sqlite3-opfs-async-proxy.js?vfs=opfs');
        expect(constructed[1]).toBe('http://localhost:4200/pkg/other-worker.js');
        expect(globalThis.Worker).toBe(FakeWorker as unknown as typeof Worker);
      } finally {
        if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
      }
    });

    it('run 抛错时也应该恢复 Worker', async () => {
      class FakeWorker {}
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        writable: true,
        value: FakeWorker as unknown as typeof Worker
      });

      try {
        await expect(
          withPatchedOpfsProxyWorker({ opfs: true, opfsProxyPath: '/assets/p.js' }, () =>
            Promise.reject(new Error('load boom'))
          )
        ).rejects.toThrow('load boom');

        expect(globalThis.Worker).toBe(FakeWorker as unknown as typeof Worker);
      } finally {
        if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
      }
    });
  });

  describe('buildOo1InitOptions', () => {
    it('缺省时应该只包含 defaultPrintErr', () => {
      const initOptions = buildOo1InitOptions();

      expect(initOptions['printErr']).toBe(defaultPrintErr);
      expect('locateFile' in initOptions).toBe(false);
      expect('print' in initOptions).toBe(false);
    });

    it('应该透传自定义 printErr / print / locateFile', () => {
      const printErr = (msg: string) => void msg;
      const print = (msg: string) => void msg;
      const locateFile = (name: string) => `/x/${name}`;

      const initOptions = buildOo1InitOptions({ printErr, print, locateFile });

      expect(initOptions['printErr']).toBe(printErr);
      expect(initOptions['print']).toBe(print);
      expect(initOptions['locateFile']).toBe(locateFile);
    });

    it('提供 wasmPath 时应该生成 locateFile 包装函数', () => {
      const initOptions = buildOo1InitOptions({ wasmPath: '/assets/sqlite3.wasm' });
      const locateFile = initOptions['locateFile'] as (name: string) => string;

      expect(locateFile('sqlite3.wasm')).toBe('/assets/sqlite3.wasm');
    });
  });
});
