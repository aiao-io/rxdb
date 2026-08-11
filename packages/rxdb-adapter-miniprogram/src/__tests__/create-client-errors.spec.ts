import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MiniProgramFileSystemManager,
  MiniProgramWasmRuntime,
  MiniProgramWechatApi,
  WaSqliteEmscriptenModule,
  WaSqliteMiniProgramOptions,
  WaSqliteModuleFactory
} from '../mini-program.interface.js';

/** 每个用例通过它决定 `Factory` 返回的假 sqlite3 门面。 */
let vfsRegister = vi.fn<(vfs: unknown, makeDefault: boolean) => number>();
/** 非 undefined 时让 VFS 的 close 在真正关闭后再抛错，用于覆盖清理失败分支。 */
let closeFailure: Error | undefined;
const closedVfsNames: string[] = [];

vi.mock('wa-sqlite', async () => {
  const actual = await vi.importActual<typeof import('wa-sqlite')>('wa-sqlite');
  return { ...actual, Factory: () => ({ vfs_register: (...args: [unknown, boolean]) => vfsRegister(...args) }) };
});

vi.mock('../loader.js', () => ({
  loadWaSqliteMiniProgramModule: async () => ({}) as WaSqliteEmscriptenModule
}));

vi.mock('../wechat-file-vfs.js', async () => {
  const actual = await vi.importActual<typeof import('../wechat-file-vfs.js')>('../wechat-file-vfs.js');
  return {
    ...actual,
    createWechatFileVFS: (
      module: WaSqliteEmscriptenModule,
      options: Parameters<typeof actual.createWechatFileVFS>[1]
    ) => {
      const handle = actual.createWechatFileVFS(module, options);
      const close = handle.vfs.close;
      handle.vfs.close = () => {
        close();
        closedVfsNames.push(handle.vfs.name);
        if (closeFailure) throw closeFailure;
      };
      return handle;
    }
  };
});

const { createWaSqliteMiniProgramClient } = await import('../create-client.js');

class MemoryFileSystem implements MiniProgramFileSystemManager {
  readonly files = new Map<string, Uint8Array>();

  accessSync(path: string): void {
    if (!this.files.has(path)) throw new Error(`ENOENT: ${path}`);
  }

  mkdirSync(): void {
    return undefined;
  }

  readFileSync(path: string): string {
    const file = this.files.get(path);
    if (!file) throw new Error(`ENOENT: ${path}`);
    return Buffer.from(file).toString('base64');
  }

  unlinkSync(path: string): void {
    if (!this.files.delete(path)) throw new Error(`ENOENT: ${path}`);
  }

  writeFileSync(path: string, data: ArrayBuffer): void {
    this.files.set(path, Uint8Array.from(new Uint8Array(data)));
  }
}

const wechat: MiniProgramWechatApi = {
  env: { USER_DATA_PATH: '/data' },
  getFileSystemManager: () => new MemoryFileSystem()
};

const options: WaSqliteMiniProgramOptions = {
  databaseRoot: '/data/register-fail',
  moduleFactory: (() => undefined) as unknown as WaSqliteModuleFactory,
  wasmRuntime: { instantiate: async () => ({ exports: {} }) } as MiniProgramWasmRuntime,
  wechat
};

beforeEach(() => {
  vfsRegister = vi.fn(() => 0);
  closeFailure = undefined;
  closedVfsNames.length = 0;
});

afterEach(() => vi.restoreAllMocks());

describe('VFS 注册失败', () => {
  it('vfs_register 返回非 SQLITE_OK 时关闭 VFS 并带出返回码', async () => {
    vfsRegister = vi.fn(() => 1);

    await expect(createWaSqliteMiniProgramClient('register-code', options)).rejects.toThrow(
      'wa-sqlite 微信 VFS 注册失败: 1'
    );
    expect(vfsRegister).toHaveBeenCalledWith(expect.objectContaining({ name: 'wechat-file' }), true);
    expect(closedVfsNames).toEqual(['wechat-file']);
  });

  it('vfs_register 直接抛错时同样关闭 VFS 并原样抛出', async () => {
    const failure = new Error('vfs slot exhausted');
    vfsRegister = vi.fn(() => {
      throw failure;
    });

    await expect(createWaSqliteMiniProgramClient('register-throw', options)).rejects.toThrow(failure);
    expect(closedVfsNames).toEqual(['wechat-file']);
  });

  it('清理步骤自身出错时记录日志，仍抛出注册失败的原因', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    closeFailure = new Error('flush failed');
    vfsRegister = vi.fn(() => 1);

    await expect(createWaSqliteMiniProgramClient('register-cleanup', options)).rejects.toThrow(
      'wa-sqlite 微信 VFS 注册失败: 1'
    );
    expect(error).toHaveBeenCalledWith(
      '[rxdb-adapter-miniprogram] VFS 注册失败后的清理步骤出错：',
      expect.objectContaining({ message: 'flush failed' })
    );
  });

  it('注册失败已释放数据库占用，同名数据库可以再次尝试', async () => {
    vfsRegister = vi.fn(() => 1);
    await expect(createWaSqliteMiniProgramClient('register-retry', options)).rejects.toThrow('VFS 注册失败');

    await expect(createWaSqliteMiniProgramClient('register-retry', options)).rejects.toThrow('VFS 注册失败');
    expect(closedVfsNames).toEqual(['wechat-file', 'wechat-file']);
  });
});
