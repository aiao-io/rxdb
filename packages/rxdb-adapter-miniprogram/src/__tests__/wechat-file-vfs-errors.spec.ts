import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MiniProgramFileSystemManager,
  MiniProgramWechatApi,
  WaSqliteEmscriptenModule
} from '../mini-program.interface.js';
import type { SQLiteVFS } from '../wa-sqlite.interface.js';
import { createWechatFileVFS, type WechatFileVFS } from '../wechat-file-vfs.js';

const SQLITE_OK = 0;
const SQLITE_IOERR = 10;
const SQLITE_NOTFOUND = 12;
const SQLITE_CANTOPEN = 14;
const SQLITE_IOERR_READ = 266;
const SQLITE_IOERR_SHORT_READ = 522;
const SQLITE_IOERR_WRITE = 778;
const SQLITE_IOERR_TRUNCATE = 1546;
const SQLITE_IOERR_FSTAT = 1802;
const SQLITE_IOERR_DELETE = 2570;
const SQLITE_IOERR_ACCESS = 3338;
const SQLITE_IOERR_CLOSE = 4106;

const SQLITE_OPEN_READWRITE = 0x00000002;
const SQLITE_OPEN_CREATE = 0x00000004;
const SQLITE_OPEN_DELETEONCLOSE = 0x00000008;
const SQLITE_OPEN_TEMP_JOURNAL = 0x00001000;

const READ_WRITE_CREATE = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;
const ROOT = '/data/rxdb-wa-sqlite';
const UNKNOWN_HANDLE = 9999;

/** 源码内部的 VFS 结构体比 wa-sqlite 的 `SQLiteVFS` 多出这些同步方法。 */
type MiniProgramVfs = SQLiteVFS & {
  xRandomness(pVfs: number, length: number, output: number): number;
  xSleep(pVfs: number, microseconds: number): number;
  xCurrentTime(pVfs: number, output: number): number;
  xCurrentTimeInt64(pVfs: number, output: number): number;
  xShmMap(): number;
  xShmLock(): number;
  xShmBarrier(): void;
  xShmUnmap(): number;
};

/** 逐方法注入故障，覆盖微信文件系统的各类同步异常。 */
interface FileSystemFaults {
  accessSync?: (path: string) => void;
  mkdirSync?: (path: string) => void;
  readFileSync?: (path: string) => string | void;
  unlinkSync?: (path: string) => void;
  writeFileSync?: (path: string) => void;
}

class MemoryFileSystem implements MiniProgramFileSystemManager {
  readonly files = new Map<string, Uint8Array>();

  constructor(readonly faults: FileSystemFaults = {}) {}

  accessSync(path: string): void {
    this.faults.accessSync?.(path);
    if (!this.files.has(path)) throw new Error(`ENOENT: ${path}`);
  }

  mkdirSync(path: string): void {
    this.faults.mkdirSync?.(path);
  }

  readFileSync(path: string): string {
    const injected = this.faults.readFileSync?.(path);
    if (typeof injected === 'string') return injected;
    const data = this.files.get(path);
    if (!data) throw new Error(`ENOENT: ${path}`);
    return Buffer.from(data).toString('base64');
  }

  unlinkSync(path: string): void {
    this.faults.unlinkSync?.(path);
    if (!this.files.delete(path)) throw new Error(`ENOENT: ${path}`);
  }

  writeFileSync(path: string, data: ArrayBuffer): void {
    this.faults.writeFileSync?.(path);
    this.files.set(path, Uint8Array.from(new Uint8Array(data)));
  }
}

function createModule(names: Map<number, string>): WaSqliteEmscriptenModule {
  const buffer = new ArrayBuffer(8192);
  return {
    HEAP32: new Int32Array(buffer),
    HEAPF64: new Float64Array(buffer),
    HEAPU8: new Uint8Array(buffer),
    HEAPU32: new Uint32Array(buffer),
    _sqlite3_next_stmt: () => 0,
    UTF8ToString: pointer => names.get(pointer) ?? '',
    stringToUTF8: (value, pointer) => {
      names.set(pointer, value);
    }
  };
}

interface Fixture {
  readonly fileSystem: MemoryFileSystem;
  readonly handle: WechatFileVFS;
  readonly module: WaSqliteEmscriptenModule;
  readonly names: Map<number, string>;
  readonly vfs: MiniProgramVfs;
}

const openHandles: WechatFileVFS[] = [];

function createFixture(
  databaseName: string,
  options: { readonly faults?: FileSystemFaults; readonly names?: Map<number, string> } = {}
): Fixture {
  const fileSystem = new MemoryFileSystem(options.faults ?? {});
  const names = options.names ?? new Map<number, string>();
  const module = createModule(names);
  const wechat: MiniProgramWechatApi = {
    env: { USER_DATA_PATH: '/data' },
    getFileSystemManager: () => fileSystem
  };
  const handle = createWechatFileVFS(module, { databaseName, fileSystem, wechat });
  openHandles.push(handle);
  return { fileSystem, handle, module, names, vfs: handle.vfs as MiniProgramVfs };
}

afterEach(async () => {
  for (const handle of openHandles.splice(0)) await handle.vfs.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createWechatFileVFS 引导失败', () => {
  it('目录已存在时吞掉 mkdir 错误，其余错误直接冒泡', () => {
    const fileSystem = new MemoryFileSystem({
      mkdirSync: () => {
        throw new Error('file already exists');
      }
    });
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const module = createModule(new Map());

    const tolerated = createWechatFileVFS(module, { databaseName: 'mkdir-exists.sqlite', fileSystem, wechat });
    openHandles.push(tolerated);
    expect(tolerated.root).toBe(ROOT);

    fileSystem.faults.mkdirSync = () => {
      throw new Error('EACCES: permission denied');
    };
    expect(() => createWechatFileVFS(module, { databaseName: 'mkdir-denied.sqlite', fileSystem, wechat })).toThrow(
      'EACCES: permission denied'
    );
  });

  it('缺少 root 时用 wx.env.USER_DATA_PATH 推导默认目录', () => {
    const { handle } = createFixture('default-root.sqlite');

    expect(handle.root).toBe(ROOT);
  });
});

describe('xOpen 失败路径', () => {
  it('无 CREATE 标志打开不存在的文件返回 SQLITE_CANTOPEN', async () => {
    const { handle, vfs } = createFixture('missing.sqlite', { names: new Map([[64, 'missing.sqlite']]) });

    expect(await vfs.xOpen(0, 64, 128, SQLITE_OPEN_READWRITE, 0)).toBe(SQLITE_CANTOPEN);
    expect(handle.lastError?.message).toContain('file does not exist');
    expect(handle.lastError?.message).toContain('flags=0x2');
  });

  it('accessSync 抛非缺失错误时暴露原始路径与原因', async () => {
    const faults: FileSystemFaults = {};
    const { handle, vfs } = createFixture('access-denied.sqlite', {
      faults,
      names: new Map([[64, 'denied.sqlite']])
    });
    faults.accessSync = () => {
      throw new Error('EACCES: permission denied');
    };

    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_CANTOPEN);
    expect(handle.lastError?.message).toContain(`accessSync ${ROOT}/rxdb-denied.sqlite`);
    expect(handle.lastError?.message).toContain('permission denied');
  });

  it('readFileSync 失败时保留 base64 读取阶段信息', async () => {
    const faults: FileSystemFaults = {};
    const { fileSystem, handle, vfs } = createFixture('read-fail.sqlite', {
      faults,
      names: new Map([[64, 'read-fail.sqlite']])
    });
    fileSystem.files.set(`${ROOT}/rxdb-read-fail.sqlite`, Uint8Array.from([1]));
    faults.readFileSync = () => {
      throw new Error('EIO: read failure');
    };

    expect(await vfs.xOpen(0, 64, 128, SQLITE_OPEN_READWRITE, 0)).toBe(SQLITE_CANTOPEN);
    expect(handle.lastError?.message).toContain('readFileSync(base64): EIO: read failure');
  });

  it('创建空文件失败时保留写入阶段信息', async () => {
    const faults: FileSystemFaults = {};
    const { handle, vfs } = createFixture('write-fail.sqlite', {
      faults,
      names: new Map([[64, 'write-fail.sqlite']])
    });
    faults.writeFileSync = () => {
      throw new Error('ENOSPC: disk full');
    };

    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_CANTOPEN);
    expect(handle.lastError?.message).toContain('writeFileSync(create): ENOSPC: disk full');
  });

  it('zName 为 0 时生成临时文件并在关闭时删除', async () => {
    const { fileSystem, vfs } = createFixture('anonymous.sqlite');
    const flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_TEMP_JOURNAL;

    expect(await vfs.xOpen(0, 0, 128, flags, 0)).toBe(SQLITE_OK);
    const created = [...fileSystem.files.keys()];
    expect(created).toHaveLength(1);
    expect(created[0]).toMatch(/rxdb-temporary-\d+-\d+-128$/);

    expect(await vfs.xClose(128)).toBe(SQLITE_OK);
    expect(fileSystem.files.size).toBe(0);
  });
});

describe('base64 往返与损坏数据', () => {
  it('还原空文件、三种补位长度以及全部 256 种字节值', async () => {
    const cases = [
      new Uint8Array(0),
      Uint8Array.from([0xff]),
      Uint8Array.from([0xfb, 0xef]),
      Uint8Array.from([0xfb, 0xef, 0xbe]),
      Uint8Array.from({ length: 256 }, (_, index) => index)
    ];
    const names = new Map(cases.map((_, index) => [64 + index, `case-${index}`]));
    const { fileSystem, module, vfs } = createFixture('base64.sqlite', { names });
    const output = 2048;

    for (const [index, expected] of cases.entries()) {
      const pointer = 64 + index;
      const file = 128 + index * 8;
      fileSystem.files.set(`${ROOT}/rxdb-case-${index}`, expected);

      expect(await vfs.xOpen(0, pointer, file, SQLITE_OPEN_READWRITE, 0)).toBe(SQLITE_OK);
      expect(await vfs.xFileSize(file, 1024)).toBe(SQLITE_OK);
      expect(module.HEAPU32[1024 >> 2]).toBe(expected.length);
      if (expected.length > 0) expect(await vfs.xRead(file, output, expected.length, 0, 0)).toBe(SQLITE_OK);
      expect([...module.HEAPU8.subarray(output, output + expected.length)]).toEqual([...expected]);
    }
  });

  it('base64 长度或字符非法时打开失败', async () => {
    const faults: FileSystemFaults = {};
    const names = new Map([[64, 'corrupt.sqlite']]);
    const { fileSystem, handle, vfs } = createFixture('corrupt.sqlite', { faults, names });
    fileSystem.files.set(`${ROOT}/rxdb-corrupt.sqlite`, Uint8Array.from([1]));

    faults.readFileSync = () => 'abc';
    expect(await vfs.xOpen(0, 64, 128, SQLITE_OPEN_READWRITE, 0)).toBe(SQLITE_CANTOPEN);
    expect(handle.lastError?.message).toContain('invalid base64 length');

    faults.readFileSync = () => 'a@b=';
    expect(await vfs.xOpen(0, 64, 128, SQLITE_OPEN_READWRITE, 0)).toBe(SQLITE_CANTOPEN);
    expect(handle.lastError?.message).toContain('invalid base64 character');
  });
});

describe('文件句柄与只读约束', () => {
  it('所有 I/O 方法遇到未知句柄都返回对应的 IOERR', async () => {
    const { handle, vfs } = createFixture('unknown-handle.sqlite');

    expect(await vfs.xRead(UNKNOWN_HANDLE, 256, 4, 0, 0)).toBe(SQLITE_IOERR_READ);
    expect(await vfs.xWrite(UNKNOWN_HANDLE, 256, 4, 0, 0)).toBe(SQLITE_IOERR_WRITE);
    expect(await vfs.xTruncate(UNKNOWN_HANDLE, 4, 0)).toBe(SQLITE_IOERR_TRUNCATE);
    expect(await vfs.xSync(UNKNOWN_HANDLE, 0)).toBe(SQLITE_IOERR_WRITE);
    expect(await vfs.xFileSize(UNKNOWN_HANDLE, 256)).toBe(SQLITE_IOERR_FSTAT);
    expect(handle.lastError?.message).toBe(`unknown SQLite file handle: ${UNKNOWN_HANDLE}`);
  });

  it('未知句柄的 xClose 视为已关闭', async () => {
    const { vfs } = createFixture('close-unknown.sqlite');

    expect(await vfs.xClose(UNKNOWN_HANDLE)).toBe(SQLITE_OK);
  });

  it('没有 READWRITE 标志的文件拒绝写入和截断', async () => {
    const { handle, vfs } = createFixture('read-only.sqlite', { names: new Map([[64, 'read-only.sqlite']]) });

    expect(await vfs.xOpen(0, 64, 128, SQLITE_OPEN_CREATE, 0)).toBe(SQLITE_OK);
    expect(await vfs.xWrite(128, 256, 4, 0, 0)).toBe(SQLITE_IOERR_WRITE);
    expect(handle.lastError?.message).toContain('file is read-only');
    expect(await vfs.xTruncate(128, 0, 0)).toBe(SQLITE_IOERR_TRUNCATE);
    expect(handle.lastError?.message).toContain('file is read-only');
  });

  it('flush 失败时 xClose 返回 SQLITE_IOERR_CLOSE', async () => {
    const faults: FileSystemFaults = {};
    const { handle, vfs } = createFixture('flush-fail.sqlite', { faults, names: new Map([[64, 'flush.sqlite']]) });

    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_OK);
    expect(await vfs.xWrite(128, 256, 4, 0, 0)).toBe(SQLITE_OK);
    faults.writeFileSync = () => {
      throw new Error('ENOSPC: disk full');
    };

    expect(await vfs.xClose(128)).toBe(SQLITE_IOERR_CLOSE);
    expect(handle.lastError?.message).toContain('ENOSPC: disk full');

    faults.writeFileSync = undefined;
    expect(await vfs.xClose(128)).toBe(SQLITE_OK);
  });

  it('临时文件已被外部删除时 xClose 仍然成功', async () => {
    const faults: FileSystemFaults = {};
    const { vfs } = createFixture('vanished.sqlite', { faults, names: new Map([[64, 'vanished.sqlite']]) });
    const flags = READ_WRITE_CREATE | SQLITE_OPEN_DELETEONCLOSE;

    expect(await vfs.xOpen(0, 64, 128, flags, 0)).toBe(SQLITE_OK);
    faults.unlinkSync = () => {
      throw new Error('文件不存在');
    };

    expect(await vfs.xClose(128)).toBe(SQLITE_OK);
  });

  it('删除临时文件抛出非 Error 值时也会被包装成 lastError', async () => {
    const faults: FileSystemFaults = {};
    const { handle, vfs } = createFixture('non-error.sqlite', { faults, names: new Map([[64, 'non-error.sqlite']]) });
    const flags = READ_WRITE_CREATE | SQLITE_OPEN_DELETEONCLOSE;

    expect(await vfs.xOpen(0, 64, 128, flags, 0)).toBe(SQLITE_OK);
    faults.unlinkSync = () => {
      throw { errMsg: 'unlink:fail permission' };
    };

    expect(await vfs.xClose(128)).toBe(SQLITE_IOERR_CLOSE);
    expect(handle.lastError?.message).toBe('unlink:fail permission');
  });
});

describe('读写、截断与文件大小', () => {
  it('读取越过文件尾时补零并返回 SQLITE_IOERR_SHORT_READ', async () => {
    const { module, vfs } = createFixture('short-read.sqlite', { names: new Map([[64, 'short-read.sqlite']]) });

    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_OK);
    module.HEAPU8.set([1, 2], 256);
    expect(await vfs.xWrite(128, 256, 2, 0, 0)).toBe(SQLITE_OK);
    module.HEAPU8.fill(0xff, 512, 516);

    expect(await vfs.xRead(128, 512, 4, 0, 0)).toBe(SQLITE_IOERR_SHORT_READ);
    expect([...module.HEAPU8.subarray(512, 516)]).toEqual([1, 2, 0, 0]);
  });

  it('32 位无符号偏移量按 2^32 合成，不会变成负数', async () => {
    const { module, vfs } = createFixture('offset.sqlite', { names: new Map([[64, 'offset.sqlite']]) });

    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_OK);
    module.HEAPU8.fill(0xff, 512, 516);

    expect(await vfs.xRead(128, 512, 4, -1, 0)).toBe(SQLITE_IOERR_SHORT_READ);
    expect([...module.HEAPU8.subarray(512, 516)]).toEqual([0, 0, 0, 0]);
  });

  it('截断可增长、缩短，尺寸相同则不标脏', async () => {
    const { fileSystem, module, vfs } = createFixture('truncate.sqlite', { names: new Map([[64, 'truncate.sqlite']]) });
    const path = `${ROOT}/rxdb-truncate.sqlite`;

    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_OK);
    module.HEAPU8.set([1, 2, 3, 4], 256);
    expect(await vfs.xWrite(128, 256, 4, 0, 0)).toBe(SQLITE_OK);

    expect(await vfs.xTruncate(128, 8, 0)).toBe(SQLITE_OK);
    expect(await vfs.xFileSize(128, 512)).toBe(SQLITE_OK);
    expect(module.HEAPU32[512 >> 2]).toBe(8);
    expect(module.HEAPU32[(512 >> 2) + 1]).toBe(0);

    expect(await vfs.xTruncate(128, 8, 0)).toBe(SQLITE_OK);
    expect(await vfs.xTruncate(128, 2, 0)).toBe(SQLITE_OK);
    expect(await vfs.xSync(128, 0)).toBe(SQLITE_OK);
    expect([...(fileSystem.files.get(path) ?? [])]).toEqual([1, 2]);
  });
});

describe('xDelete 与 xAccess', () => {
  it('删除不存在的文件成功，删除失败时返回 SQLITE_IOERR_DELETE', async () => {
    const faults: FileSystemFaults = {};
    const names = new Map([[64, 'delete.sqlite']]);
    const { fileSystem, handle, vfs } = createFixture('delete.sqlite', { faults, names });
    const path = `${ROOT}/rxdb-delete.sqlite`;
    fileSystem.files.set(path, Uint8Array.from([1]));

    expect(await vfs.xDelete(0, 64, 0)).toBe(SQLITE_OK);
    expect(fileSystem.files.has(path)).toBe(false);
    expect(await vfs.xDelete(0, 64, 0)).toBe(SQLITE_OK);

    faults.unlinkSync = () => {
      throw { errMsg: 'unlink:fail busy' };
    };
    expect(await vfs.xDelete(0, 64, 0)).toBe(SQLITE_IOERR_DELETE);
    expect(handle.lastError?.message).toBe(`xDelete ${path}: unlink:fail busy`);
  });

  it('探测不存在的文件写 0 并返回 OK，探测失败返回 SQLITE_IOERR_ACCESS', async () => {
    const faults: FileSystemFaults = {};
    const names = new Map([[64, 'access.sqlite']]);
    const { fileSystem, handle, module, vfs } = createFixture('access.sqlite', { faults, names });
    const path = `${ROOT}/rxdb-access.sqlite`;

    expect(await vfs.xAccess(0, 64, 0, 512)).toBe(SQLITE_OK);
    expect(module.HEAP32[512 >> 2]).toBe(0);

    fileSystem.files.set(path, Uint8Array.from([1]));
    expect(await vfs.xAccess(0, 64, 0, 512)).toBe(SQLITE_OK);
    expect(module.HEAP32[512 >> 2]).toBe(1);

    faults.accessSync = () => {
      throw 'access blocked';
    };
    expect(await vfs.xAccess(0, 64, 0, 512)).toBe(SQLITE_IOERR_ACCESS);
    expect(module.HEAP32[512 >> 2]).toBe(0);
    expect(handle.lastError?.message).toBe(`xAccess ${path}: access blocked`);
  });
});

describe('文件名编码规则', () => {
  it('encodeURIComponent 不转义的非安全字符按码位手工转义', async () => {
    const { fileSystem, vfs } = createFixture('tilde.sqlite', { names: new Map([[64, "sync~te'mp.sqlite"]]) });

    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_OK);
    expect([...fileSystem.files.keys()]).toEqual([`${ROOT}/rxdb-sync%7Ete%27mp.sqlite`]);
  });

  it('前缀相同但字符非法的路径不当作 canonical path 复用', async () => {
    const names = new Map([[64, `${ROOT}/rxdb-bad name.sqlite`]]);
    const { fileSystem, vfs } = createFixture('canonical.sqlite', { names });

    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_OK);
    expect([...fileSystem.files.keys()]).toEqual([`${ROOT}/rxdb-rxdb-bad%20name.sqlite`]);
  });
});

describe('剩余 VFS 回调', () => {
  it('锁、扇区与设备特性返回固定的单连接语义', async () => {
    const { module, vfs } = createFixture('locks.sqlite');
    module.HEAP32[512 >> 2] = 1;

    expect(await vfs.xLock(128, 1)).toBe(SQLITE_OK);
    expect(await vfs.xUnlock(128, 0)).toBe(SQLITE_OK);
    expect(await vfs.xCheckReservedLock(128, 512)).toBe(SQLITE_OK);
    expect(module.HEAP32[512 >> 2]).toBe(0);
    expect(await vfs.xFileControl(128, 1, 0)).toBe(SQLITE_NOTFOUND);
    expect(await vfs.xSectorSize(128)).toBe(4096);
    expect(await vfs.xDeviceCharacteristics(128)).toBe(0);
  });

  it('共享内存回调一律拒绝，WAL 无法启用', () => {
    const { vfs } = createFixture('shm.sqlite');

    expect(vfs.xShmMap()).toBe(SQLITE_IOERR);
    expect(vfs.xShmLock()).toBe(SQLITE_IOERR);
    expect(vfs.xShmBarrier()).toBeUndefined();
    expect(vfs.xShmUnmap()).toBe(SQLITE_OK);
  });

  it('时间回调写出儒略日与 int64 毫秒', () => {
    const { module, vfs } = createFixture('clock.sqlite');
    vi.spyOn(Date, 'now').mockReturnValue(1_786_214_400_000);

    expect(vfs.xSleep(0, 1000)).toBe(0);
    expect(vfs.xCurrentTime(0, 512)).toBe(SQLITE_OK);
    expect(module.HEAPF64[512 >> 3]).toBeCloseTo(1_786_214_400_000 / 86400000 + 2440587.5, 6);

    expect(vfs.xCurrentTimeInt64(0, 1024)).toBe(SQLITE_OK);
    const low = module.HEAPU32[1024 >> 2];
    const high = module.HEAPU32[(1024 >> 2) + 1];
    expect(high * 0x100000000 + low).toBe(1_786_214_400_000 + 210866760000000);
  });

  it('xGetLastError 只在有错误且缓冲够大时写出信息', async () => {
    const names = new Map([[64, 'last-error.sqlite']]);
    const { handle, names: written, vfs } = createFixture('last-error.sqlite', { names });

    expect(vfs.xGetLastError(0, 512, 256)).toBe(SQLITE_OK);
    expect(written.has(256)).toBe(false);

    expect(await vfs.xOpen(0, 64, 128, SQLITE_OPEN_READWRITE, 0)).toBe(SQLITE_CANTOPEN);
    expect(vfs.xGetLastError(0, 1, 256)).toBe(SQLITE_OK);
    expect(written.has(256)).toBe(false);

    expect(vfs.xGetLastError(0, 512, 256)).toBe(SQLITE_OK);
    expect(written.get(256)).toBe(handle.lastError?.message);
  });

  it('未引导安全随机源时 xRandomness 直接抛错', () => {
    const { vfs } = createFixture('randomness.sqlite');
    vi.stubGlobal('crypto', undefined);

    expect(() => vfs.xRandomness(0, 4, 256)).toThrow('微信小程序安全随机源尚未引导');
  });

  it('close 幂等，isReady/hasAsyncMethod 声明纯同步 VFS', async () => {
    const names = new Map([[64, 'idempotent.sqlite']]);
    const { fileSystem, handle, module, vfs } = createFixture('idempotent.sqlite', { names });
    const writeFileSync = vi.spyOn(fileSystem, 'writeFileSync');

    expect(await vfs.isReady()).toBe(true);
    expect(vfs.hasAsyncMethod('xRead')).toBe(false);
    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_OK);
    module.HEAPU8.set([7], 256);
    expect(await vfs.xWrite(128, 256, 1, 0, 0)).toBe(SQLITE_OK);
    writeFileSync.mockClear();

    await handle.vfs.close();
    expect(writeFileSync).toHaveBeenCalledOnce();
    await handle.vfs.close();
    expect(writeFileSync).toHaveBeenCalledOnce();
  });
});

describe('clear', () => {
  it('仍有打开的文件时拒绝清理', async () => {
    const { handle, vfs } = createFixture('clear-busy.sqlite', { names: new Map([[64, 'clear-busy.sqlite']]) });

    expect(await vfs.xOpen(0, 64, 128, READ_WRITE_CREATE, 0)).toBe(SQLITE_OK);
    expect(() => handle.clear()).toThrow('关闭数据库后才能清理微信 VFS 文件');
  });

  it('删除失败且不是缺失文件时直接抛出', () => {
    const faults: FileSystemFaults = {};
    const { fileSystem, handle } = createFixture('clear-fail.sqlite', { faults });
    fileSystem.files.set(`${ROOT}/rxdb-clear-fail.sqlite`, Uint8Array.from([1]));
    faults.unlinkSync = () => {
      throw new Error('EACCES: permission denied');
    };

    expect(() => handle.clear()).toThrow('EACCES: permission denied');
  });
});
