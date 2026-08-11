import { describe, expect, it, vi } from 'vitest';
import { loadWaSqliteMiniProgramModule } from '../loader.js';
import type {
  MiniProgramWasmInstance,
  MiniProgramWasmRuntime,
  WaSqliteEmscriptenModule,
  WaSqliteModuleFactory
} from '../mini-program.interface.js';

const module = {} as WaSqliteEmscriptenModule;
const instance = { exports: {} } as MiniProgramWasmInstance;

describe('loadWaSqliteMiniProgramModule', () => {
  it('把代码包路径交给 WXWebAssembly 并接回 Emscripten 回调', async () => {
    const instantiate = vi.fn(async () => ({ instance, module: 'compiled' }));
    const moduleFactory: WaSqliteModuleFactory = options =>
      new Promise(resolve => {
        options.instantiateWasm({}, (received, compiled) => {
          expect(received).toBe(instance);
          expect(compiled).toBe('compiled');
          resolve(module);
        });
      });

    await expect(
      loadWaSqliteMiniProgramModule({
        moduleFactory,
        wasmPath: 'assets/sqlite.wasm',
        wasmRuntime: { instantiate } as MiniProgramWasmRuntime
      })
    ).resolves.toBe(module);
    expect(instantiate).toHaveBeenCalledWith('assets/sqlite.wasm', {});
  });

  it('把代码包路径喂给 locateFile，并给 Emscripten 日志打上前缀', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const locatedPaths: string[] = [];
    const moduleFactory: WaSqliteModuleFactory = options => {
      locatedPaths.push(options.locateFile('wa-sqlite.wasm'), options.locateFile('anything-else'));
      options.print('opened');
      options.printErr('slow query');
      return module;
    };

    await expect(
      loadWaSqliteMiniProgramModule({
        moduleFactory,
        wasmPath: 'assets/sqlite.wasm',
        wasmRuntime: { instantiate: vi.fn() } as unknown as MiniProgramWasmRuntime
      })
    ).resolves.toBe(module);

    expect(locatedPaths).toEqual(['assets/sqlite.wasm', 'assets/sqlite.wasm']);
    expect(log).toHaveBeenCalledWith('[wa-sqlite-miniprogram] opened');
    expect(warn).toHaveBeenCalledWith('[wa-sqlite-miniprogram] slow query');
    log.mockRestore();
    warn.mockRestore();
  });

  it('WXWebAssembly 直接返回实例时按无 module 处理', async () => {
    const instantiate = vi.fn(async () => instance);
    const received: unknown[] = [];
    const moduleFactory: WaSqliteModuleFactory = options =>
      new Promise(resolve => {
        options.instantiateWasm({}, (receivedInstance, compiled) => {
          received.push(receivedInstance, compiled);
          resolve(module);
        });
      });

    await expect(loadWaSqliteMiniProgramModule({ moduleFactory, wasmRuntime: { instantiate } })).resolves.toBe(module);
    expect(received).toEqual([instance, undefined]);
  });

  it('实例缺少 exports 时按实例化失败拒绝', async () => {
    const instantiate = vi.fn(async () => ({ instance: {} as MiniProgramWasmInstance }));
    const moduleFactory: WaSqliteModuleFactory = options =>
      new Promise(() => {
        options.instantiateWasm({}, () => undefined);
      });

    await expect(loadWaSqliteMiniProgramModule({ moduleFactory, wasmRuntime: { instantiate } })).rejects.toThrow(
      'WXWebAssembly 无法实例化 wa-sqlite/wa-sqlite.wasm: WXWebAssembly.instantiate 未返回有效实例'
    );
  });

  it('实例化抛出非 Error 值时按字符串化拼进错误信息', async () => {
    const moduleFactory: WaSqliteModuleFactory = options =>
      new Promise(() => {
        options.instantiateWasm({}, () => undefined);
      });
    const wasmRuntime: MiniProgramWasmRuntime = {
      instantiate: async () => {
        throw 'out of memory';
      }
    };

    await expect(loadWaSqliteMiniProgramModule({ moduleFactory, wasmRuntime })).rejects.toThrow(
      'WXWebAssembly 无法实例化 wa-sqlite/wa-sqlite.wasm: out of memory'
    );
  });

  it('实例化失败不会留下永远 pending 的 factory Promise', async () => {
    const failure = new Error('bad wasm');
    const moduleFactory: WaSqliteModuleFactory = options =>
      new Promise(() => {
        options.instantiateWasm({}, () => undefined);
      });
    const wasmRuntime: MiniProgramWasmRuntime = {
      instantiate: async () => {
        throw failure;
      }
    };

    await expect(loadWaSqliteMiniProgramModule({ moduleFactory, wasmRuntime })).rejects.toThrow(
      'WXWebAssembly 无法实例化 wa-sqlite/wa-sqlite.wasm: bad wasm'
    );
  });
});
