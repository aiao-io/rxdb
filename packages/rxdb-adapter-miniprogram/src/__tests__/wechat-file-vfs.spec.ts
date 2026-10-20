import { describe, expect, it, vi } from 'vitest';
import type {
  MiniProgramFileSystemManager,
  MiniProgramWechatApi,
  WaSqliteEmscriptenModule
} from '../mini-program.interface.js';
import { createWechatFileVFS, extendFileData } from '../wechat-file-vfs.js';

const SQLITE_OPEN_READWRITE = 0x00000002;
const SQLITE_OPEN_CREATE = 0x00000004;
const SQLITE_OPEN_DELETEONCLOSE = 0x00000008;
const SQLITE_OPEN_MAIN_DB = 0x00000100;
const SQLITE_CANTOPEN = 14;
const SQLITE_IOERR_CLOSE = 4106;

class MemoryFileSystem implements MiniProgramFileSystemManager {
  readonly files = new Map<string, Uint8Array>();

  accessSync(path: string): void {
    if (!this.files.has(path)) throw new Error(`ENOENT: ${path}`);
  }

  mkdirSync(path: string, recursive?: boolean): void {
    void path;
    void recursive;
  }

  readFileSync(path: string): string {
    const data = this.files.get(path);
    if (!data) throw new Error(`ENOENT: ${path}`);
    return Buffer.from(data).toString('base64');
  }

  unlinkSync(path: string): void {
    if (!this.files.delete(path)) throw new Error(`ENOENT: ${path}`);
  }

  writeFileSync(path: string, data: ArrayBuffer): void {
    this.files.set(path, Uint8Array.from(new Uint8Array(data)));
  }
}

function createModule(names: Map<number, string>): WaSqliteEmscriptenModule {
  const buffer = new ArrayBuffer(4096);
  const heapF64 = new Float64Array(buffer);
  return {
    HEAP32: new Int32Array(buffer),
    HEAPU8: new Uint8Array(buffer),
    _sqlite3_next_stmt: () => 0,
    UTF8ToString: pointer => names.get(pointer) ?? '',
    stringToUTF8: (value, pointer) => {
      names.set(pointer, value);
    },
    setValue: (pointer, value) => {
      heapF64[pointer >> 3] = value;
    }
  };
}

describe('createWechatFileVFS', () => {
  it('同步写入、关闭并重新打开后保留原始字节', async () => {
    const fileSystem = new MemoryFileSystem();
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const names = new Map([[64, 'todo.sqlite']]);
    const module = createModule(names);
    const first = createWechatFileVFS(module, { databaseName: 'todo.sqlite', fileSystem, wechat });
    const flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_MAIN_DB;

    expect(await first.vfs.xOpen(0, 64, 128, flags, 32)).toBe(0);
    module.HEAPU8.set([1, 2, 3, 4], 256);
    expect(await first.vfs.xWrite(128, 256, 4, 0, 0)).toBe(0);
    expect(await first.vfs.xSync(128, 0)).toBe(0);
    expect(await first.vfs.xClose(128)).toBe(0);
    await first.vfs.close();

    const second = createWechatFileVFS(module, { databaseName: 'todo.sqlite', fileSystem, wechat });
    expect(await second.vfs.xOpen(0, 64, 512, flags, 36)).toBe(0);
    expect(await second.vfs.xRead(512, 300, 4, 0, 0)).toBe(0);
    expect([...module.HEAPU8.subarray(300, 304)]).toEqual([1, 2, 3, 4]);
    expect(await second.vfs.xClose(512)).toBe(0);
    await second.vfs.close();
  });

  it('同一数据库只允许一个活动连接', async () => {
    const fileSystem = new MemoryFileSystem();
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const module = createModule(new Map());
    const first = createWechatFileVFS(module, { databaseName: 'same.sqlite', fileSystem, wechat });

    expect(() => createWechatFileVFS(module, { databaseName: 'same.sqlite', fileSystem, wechat })).toThrow(
      '不支持同一数据库的并发连接'
    );
    await first.vfs.close();
    const reopened = createWechatFileVFS(module, { databaseName: 'same.sqlite', fileSystem, wechat });
    await reopened.vfs.close();

    const special = createWechatFileVFS(module, { databaseName: 'a@b.sqlite', fileSystem, wechat });
    try {
      const underscored = createWechatFileVFS(module, { databaseName: 'a_b.sqlite', fileSystem, wechat });
      await underscored.vfs.close();
    } finally {
      await special.vfs.close();
    }
  });

  it('为特殊字符和 Unicode basename 生成不碰撞的安全路径', async () => {
    const fileSystem = new MemoryFileSystem();
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const names = new Map([
      [64, 'a@b.sqlite'],
      [96, 'a_b.sqlite'],
      [128, 'a%40b.sqlite'],
      [160, 'nested/待办.sqlite']
    ]);
    const module = createModule(names);
    const handle = createWechatFileVFS(module, { databaseName: 'mapping.sqlite', fileSystem, wechat });
    const flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;

    try {
      expect(await handle.vfs.xOpen(0, 64, 256, flags, 0)).toBe(0);
      expect(await handle.vfs.xOpen(0, 96, 288, flags, 0)).toBe(0);
      expect(await handle.vfs.xOpen(0, 128, 320, flags, 0)).toBe(0);
      expect(await handle.vfs.xOpen(0, 160, 352, flags, 0)).toBe(0);

      expect([...fileSystem.files.keys()]).toEqual([
        '/data/rxdb-wa-sqlite/rxdb-a%40b.sqlite',
        '/data/rxdb-wa-sqlite/rxdb-a_b.sqlite',
        '/data/rxdb-wa-sqlite/rxdb-a%2540b.sqlite',
        '/data/rxdb-wa-sqlite/rxdb-%E5%BE%85%E5%8A%9E.sqlite'
      ]);
    } finally {
      await handle.vfs.close();
    }
  });

  it('canonical path 重复规范化后保持不变', async () => {
    const fileSystem = new MemoryFileSystem();
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const names = new Map([[64, 'nested/待办@100%.sqlite']]);
    const module = createModule(names);
    const handle = createWechatFileVFS(module, { databaseName: '待办@100%.sqlite', fileSystem, wechat });
    const expected = '/data/rxdb-wa-sqlite/rxdb-%E5%BE%85%E5%8A%9E%40100%25.sqlite';

    try {
      expect(await handle.vfs.xFullPathname(0, 64, 512, 128)).toBe(0);
      expect(names.get(128)).toBe(expected);
      expect(await handle.vfs.xFullPathname(0, 128, 512, 192)).toBe(0);
      expect(names.get(192)).toBe(expected);
      expect(await handle.vfs.xOpen(0, 192, 256, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, 0)).toBe(0);
      expect([...fileSystem.files.keys()]).toEqual([expected]);
    } finally {
      await handle.vfs.close();
    }
  });

  it('拒绝被输出缓冲区或 mxPathname 截断的路径', async () => {
    const fileSystem = new MemoryFileSystem();
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const names = new Map([
      [64, 'todo.sqlite'],
      [96, `${'a'.repeat(512)}.sqlite`]
    ]);
    const module = createModule(names);
    const handle = createWechatFileVFS(module, { databaseName: 'length.sqlite', fileSystem, wechat });
    const path = '/data/rxdb-wa-sqlite/rxdb-todo.sqlite';

    try {
      expect(await handle.vfs.xFullPathname(0, 64, path.length, 128)).toBe(SQLITE_CANTOPEN);
      expect(names.has(128)).toBe(false);
      expect(await handle.vfs.xFullPathname(0, 96, 1024, 192)).toBe(SQLITE_CANTOPEN);
      expect(names.has(192)).toBe(false);
      expect(handle.lastError?.message).toContain('mxPathname=512');
    } finally {
      await handle.vfs.close();
    }
  });

  it('同步填充 SQLite 随机字节', async () => {
    const fileSystem = new MemoryFileSystem();
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const module = createModule(new Map());
    const handle = createWechatFileVFS(module, { databaseName: 'random.sqlite', fileSystem, wechat });
    const getRandomValues = vi.fn((target: Uint8Array) => {
      target.set([0, 128, 255]);
      return target;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const vfs = handle.vfs as typeof handle.vfs & {
      xRandomness(pVfs: number, length: number, output: number): number;
    };

    try {
      expect(vfs.xRandomness(0, 3, 128)).toBe(3);
      expect([...module.HEAPU8.subarray(128, 131)]).toEqual([0, 128, 255]);
      expect(getRandomValues).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      await handle.vfs.close();
    }
  });

  it('使用逻辑数据库名的同一编码规则清理回滚日志', async () => {
    const fileSystem = new MemoryFileSystem();
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const names = new Map([[64, '清理@100%.sqlite']]);
    const module = createModule(names);
    const handle = createWechatFileVFS(module, { databaseName: '清理@100%.sqlite', fileSystem, wechat });
    const flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;

    try {
      expect(await handle.vfs.xFullPathname(0, 64, 512, 128)).toBe(0);
      expect(await handle.vfs.xOpen(0, 128, 256, flags | SQLITE_OPEN_MAIN_DB, 0)).toBe(0);
      names.set(192, `${names.get(128)}-journal`);
      expect(await handle.vfs.xOpen(0, 192, 288, flags, 0)).toBe(0);
      fileSystem.writeFileSync(`${names.get(128)}-wal`, new ArrayBuffer(0));
      fileSystem.writeFileSync(`${names.get(128)}-shm`, new ArrayBuffer(0));
      expect(await handle.vfs.xClose(256)).toBe(0);
      expect(await handle.vfs.xClose(288)).toBe(0);

      handle.clear();
      expect(fileSystem.files.size).toBe(0);
    } finally {
      await handle.vfs.close();
    }
  });

  it('临时文件删除失败时返回关闭错误', async () => {
    const fileSystem = new MemoryFileSystem();
    vi.spyOn(fileSystem, 'unlinkSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const module = createModule(new Map([[64, 'temporary.sqlite']]));
    const handle = createWechatFileVFS(module, { databaseName: 'delete-error.sqlite', fileSystem, wechat });

    try {
      const flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_DELETEONCLOSE;
      expect(await handle.vfs.xOpen(0, 64, 256, flags, 0)).toBe(0);
      expect(await handle.vfs.xClose(256)).toBe(SQLITE_IOERR_CLOSE);
      expect(handle.lastError?.message).toContain('permission denied');
    } finally {
      await handle.vfs.close();
    }
  });

  it('截短之后再越过末尾写：中间的空洞读出 0，落盘的文件不多不少', async () => {
    const fileSystem = new MemoryFileSystem();
    const wechat: MiniProgramWechatApi = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    };
    const module = createModule(new Map([[64, 'hole.sqlite']]));
    const handle = createWechatFileVFS(module, { databaseName: 'hole.sqlite', fileSystem, wechat });
    const flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_MAIN_DB;

    try {
      expect(await handle.vfs.xOpen(0, 64, 128, flags, 32)).toBe(0);
      module.HEAPU8.fill(0xff, 1024, 2048);
      expect(await handle.vfs.xWrite(128, 1024, 1024, 0, 0)).toBe(0);
      expect(await handle.vfs.xTruncate(128, 16, 0)).toBe(0);
      module.HEAPU8[1024] = 7;
      expect(await handle.vfs.xWrite(128, 1024, 1, 600, 0)).toBe(0);

      expect(await handle.vfs.xRead(128, 2048, 601, 0, 0)).toBe(0);
      expect(module.HEAPU8.subarray(2048, 2064).every(byte => byte === 0xff)).toBe(true);
      expect(module.HEAPU8.subarray(2064, 2648).every(byte => byte === 0)).toBe(true);
      expect(module.HEAPU8[2648]).toBe(7);
      expect(await handle.vfs.xSync(128, 0)).toBe(0);
      expect([...fileSystem.files.values()].map(file => file.length)).toEqual([601]);
      expect(await handle.vfs.xClose(128)).toBe(0);
    } finally {
      await handle.vfs.close();
    }
  });
});

describe('extendFileData', () => {
  it('加长后保留原内容，加长的部分为 0', () => {
    expect([...extendFileData(Uint8Array.of(1, 2, 3), 8)]).toEqual([1, 2, 3, 0, 0, 0, 0, 0]);
  });

  it('逐页追加 4 MiB：缓冲只换新几次，不是每追加一页就整库重拷一遍', () => {
    const page = 4096;
    const pages = 1024;
    let data: Uint8Array = new Uint8Array(0);
    let reallocations = 0;
    for (let index = 0; index < pages; index++) {
      const next = extendFileData(data, (index + 1) * page);
      if (next.buffer !== data.buffer) reallocations++;
      next.fill(index % 251, index * page);
      data = next;
    }

    // 余量至少 1 MiB：4 MiB 里换新不超过每 MiB 一次，外加起步那一次
    expect(reallocations).toBeLessThanOrEqual(5);
    expect(data.length).toBe(pages * page);
    for (let index = 0; index < pages; index++) expect(data[index * page]).toBe(index % 251);
  });
});
