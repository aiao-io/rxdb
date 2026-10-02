/**
 * US-211：抖音覆盖写旧文件仍计配额，整文件落盘让库上限只剩约一半、撞配额后热 journal 回滚永久没空间。
 * 分块布局把逻辑文件 `P` 存成 `P.0`、`P.1`…，只重写改过的块；回滚余量在撞配额时让出空间。
 *
 * 块号恒连续、除末块外都是满块，崩溃在任意一步之后都不能打破这两条：
 * 截断先倒序删尾块再写，删除先删 `P.0`（文件立即消失）再倒序删其余，新建时清掉没有 `P.0` 的残块。
 */
import { afterEach, describe, expect, it } from 'vitest';
import type {
  MiniProgramFileLayout,
  MiniProgramFileSystemManager,
  MiniProgramHost,
  WaSqliteEmscriptenModule
} from '../mini-program.interface.js';
import { createMiniProgramFileVFS, type MiniProgramFileVFS } from '../wechat-file-vfs.js';
import { QuotaFileSystem } from './quota-file-system.js';

const SQLITE_OPEN_READWRITE = 0x00000002;
const SQLITE_OPEN_CREATE = 0x00000004;
const SQLITE_OPEN_DELETEONCLOSE = 0x00000008;
const SQLITE_OPEN_MAIN_DB = 0x00000100;
const SQLITE_OPEN_MAIN_JOURNAL = 0x00000800;
const SQLITE_FULL = 13;
const SQLITE_CANTOPEN = 14;

const ROOT = '/data/db';
const DB = `${ROOT}/rxdb-todo.sqlite`;
const JOURNAL = `${DB}-journal`;
const RESERVE = `${DB}.rxdb-reserve`;
const NAME_DB = 64;
const NAME_JOURNAL = 96;
const SCRATCH = 1024;
const DB_FILE = 2048;
const JOURNAL_FILE = 2112;
const OPEN_DB = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_MAIN_DB;
const OPEN_JOURNAL = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_MAIN_JOURNAL;
const CHUNKED: MiniProgramFileLayout = { kind: 'chunked', chunkBytes: 4 };

const handles: MiniProgramFileVFS[] = [];

afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.vfs.close();
});

function createModule(): WaSqliteEmscriptenModule {
  const names = new Map([
    [NAME_DB, 'todo.sqlite'],
    [NAME_JOURNAL, 'todo.sqlite-journal']
  ]);
  const buffer = new ArrayBuffer(8192);
  return {
    HEAP32: new Int32Array(buffer),
    HEAPU8: new Uint8Array(buffer),
    _sqlite3_next_stmt: () => 0,
    UTF8ToString: pointer => names.get(pointer) ?? '',
    stringToUTF8: () => undefined,
    setValue: () => undefined
  };
}

function createHost(fileLayout: MiniProgramFileLayout): MiniProgramHost {
  return {
    platform: 'wechat',
    displayName: '测试小程序',
    shortName: '测试',
    wasmRuntimeName: 'FakeWebAssembly',
    capabilityNames: { fileSystem: 'fake.getFileSystemManager', userDataPath: 'fake.env.USER_DATA_PATH' },
    userDataPath: '/data',
    fileLayout,
    getFileSystemManager: () => undefined,
    requestRandomValues: () => Promise.reject(new Error('unused'))
  };
}

function openVfs(fileSystem: MiniProgramFileSystemManager, fileLayout: MiniProgramFileLayout = CHUNKED) {
  const module = createModule();
  const handle = createMiniProgramFileVFS(module, {
    databaseName: 'todo.sqlite',
    root: ROOT,
    host: createHost(fileLayout),
    fileSystem
  });
  handles.push(handle);
  const { vfs } = handle;
  const write = (file: number, bytes: number[], offset: number) => {
    module.HEAPU8.set(bytes, SCRATCH);
    return vfs.xWrite(file, SCRATCH, bytes.length, offset, 0);
  };
  const read = async (file: number, length: number) => {
    expect(await vfs.xRead(file, SCRATCH, length, 0, 0)).toBe(0);
    return [...module.HEAPU8.subarray(SCRATCH, SCRATCH + length)];
  };
  const size = async (file: number) => {
    expect(await vfs.xFileSize(file, SCRATCH)).toBe(0);
    return module.HEAP32[SCRATCH >> 2];
  };
  const exists = async (name: number) => {
    expect(await vfs.xAccess(0, name, 0, SCRATCH)).toBe(0);
    return module.HEAP32[SCRATCH >> 2] === 1;
  };
  return { handle, vfs, write, read, size, exists };
}

async function closeVfs(handle: MiniProgramFileVFS): Promise<void> {
  handles.splice(handles.indexOf(handle), 1);
  await handle.vfs.close();
}

function sizes(fileSystem: QuotaFileSystem): Record<string, number> {
  return Object.fromEntries([...fileSystem.files].map(([path, data]) => [path, data.byteLength]));
}

/** 执行 `action`，返回期间新增的文件操作。 */
async function operationsDuring(fileSystem: QuotaFileSystem, action: () => unknown): Promise<string[]> {
  const start = fileSystem.operations.length;
  await action();
  return fileSystem.operations.slice(start);
}

describe('分块布局', () => {
  it('按块落盘：除末块外都是满块，不留单文件；重开后按序拼回', async () => {
    const fileSystem = new QuotaFileSystem();
    const first = openVfs(fileSystem);
    expect(await first.vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0)).toBe(0);
    expect(await first.write(DB_FILE, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0)).toBe(0);
    expect(await first.vfs.xSync(DB_FILE, 0)).toBe(0);
    expect(await first.vfs.xClose(DB_FILE)).toBe(0);
    await closeVfs(first.handle);

    expect(sizes(fileSystem)).toEqual({ [`${DB}.0`]: 4, [`${DB}.1`]: 4, [`${DB}.2`]: 2 });

    const second = openVfs(fileSystem);
    expect(await second.vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0)).toBe(0);
    expect(await second.size(DB_FILE)).toBe(10);
    expect(await second.read(DB_FILE, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('只重写改过的块', async () => {
    const fileSystem = new QuotaFileSystem();
    const { vfs, write } = openVfs(fileSystem);
    await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0);
    await write(DB_FILE, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0);
    await vfs.xSync(DB_FILE, 0);

    const operations = await operationsDuring(fileSystem, async () => {
      await write(DB_FILE, [60], 5);
      expect(await vfs.xSync(DB_FILE, 0)).toBe(0);
    });
    expect(operations).toEqual([`write ${DB}.1 4`]);
  });

  it('截断先倒序删尾块，再写新的末块；截到 0 仍保留 P.0 作存在标记', async () => {
    const fileSystem = new QuotaFileSystem();
    const { vfs, write, size, exists } = openVfs(fileSystem);
    await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0);
    await write(DB_FILE, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], 0);
    await vfs.xSync(DB_FILE, 0);

    const shrink = await operationsDuring(fileSystem, async () => {
      expect(await vfs.xTruncate(DB_FILE, 5, 0)).toBe(0);
      expect(await vfs.xSync(DB_FILE, 0)).toBe(0);
    });
    expect(shrink).toEqual([`unlink ${DB}.3`, `unlink ${DB}.2`, `write ${DB}.1 1`]);

    const empty = await operationsDuring(fileSystem, async () => {
      await vfs.xTruncate(DB_FILE, 0, 0);
      await vfs.xSync(DB_FILE, 0);
    });
    expect(empty).toEqual([`unlink ${DB}.1`, `write ${DB}.0 0`]);
    expect(await size(DB_FILE)).toBe(0);
    expect(await exists(NAME_DB)).toBe(true);
  });

  it('新块写撞配额留下的空文件记作已落盘，回滚截断时一并删掉，块号不留空洞', async () => {
    const fileSystem = new QuotaFileSystem();
    const { vfs, write } = openVfs(fileSystem);
    await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0);
    await write(DB_FILE, [1, 2, 3, 4, 5, 6], 0);
    await vfs.xSync(DB_FILE, 0);

    // 覆盖 .1、新建 .2 都够，新建 .3 时撞配额，宿主留下空的 .3
    fileSystem.quotaBytes = 12;
    await write(DB_FILE, [7, 8, 9, 10, 11, 12, 13], 6);
    expect(await vfs.xSync(DB_FILE, 0)).toBe(SQLITE_FULL);
    expect(sizes(fileSystem)).toEqual({ [`${DB}.0`]: 4, [`${DB}.1`]: 4, [`${DB}.2`]: 4, [`${DB}.3`]: 0 });

    expect(await vfs.xTruncate(DB_FILE, 6, 0)).toBe(0);
    expect(await vfs.xSync(DB_FILE, 0)).toBe(0);
    expect(sizes(fileSystem)).toEqual({ [`${DB}.0`]: 4, [`${DB}.1`]: 2 });
  });

  it('越过末尾写入时补齐中间块，块号不留空洞', async () => {
    const fileSystem = new QuotaFileSystem();
    const { vfs, write } = openVfs(fileSystem);
    await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0);
    await write(DB_FILE, [1, 2], 0);
    await vfs.xSync(DB_FILE, 0);

    const operations = await operationsDuring(fileSystem, async () => {
      await write(DB_FILE, [9], 9);
      await vfs.xSync(DB_FILE, 0);
    });
    expect(operations).toEqual([`write ${DB}.0 4`, `write ${DB}.1 4`, `write ${DB}.2 2`]);
  });

  it('删除先删 P.0 让文件立即消失，再倒序删其余块', async () => {
    const fileSystem = new QuotaFileSystem();
    const { vfs, write, exists } = openVfs(fileSystem);
    await vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL, 0);
    await write(JOURNAL_FILE, [1, 2, 3, 4, 5, 6, 7, 8, 9], 0);
    await vfs.xClose(JOURNAL_FILE);

    const operations = await operationsDuring(fileSystem, async () => {
      expect(await vfs.xDelete(0, NAME_JOURNAL, 0)).toBe(0);
    });
    expect(operations).toEqual([`unlink ${JOURNAL}.0`, `unlink ${JOURNAL}.2`, `unlink ${JOURNAL}.1`]);
    expect(await exists(NAME_JOURNAL)).toBe(false);
  });

  it('新建时先清掉没有 P.0 的残块，不把它们拼进新文件', async () => {
    const fileSystem = new QuotaFileSystem();
    fileSystem.files.set(`${DB}.1`, new Uint8Array(4));
    fileSystem.files.set(`${DB}.2`, new Uint8Array(4));
    const { vfs, size } = openVfs(fileSystem);

    expect(await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0)).toBe(0);
    expect(await size(DB_FILE)).toBe(0);
    expect(sizes(fileSystem)).toEqual({ [`${DB}.0`]: 0 });
  });

  it.each([
    ['非末块不满', [3, 4]],
    ['块比 chunkBytes 大', [5]]
  ])('%s视为损坏，拒绝打开且不改动文件', async (_label, chunkSizes) => {
    const fileSystem = new QuotaFileSystem();
    chunkSizes.forEach((bytes, index) => fileSystem.files.set(`${DB}.${index}`, new Uint8Array(bytes)));
    const { handle, vfs } = openVfs(fileSystem);

    expect(await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0)).toBe(SQLITE_CANTOPEN);
    expect(handle.lastError?.message).toContain('分块文件损坏');
    expect(fileSystem.operations).toEqual([]);
  });

  it('库目录里已有单文件布局的数据库时拒绝创建，不猜迁移', () => {
    const fileSystem = new QuotaFileSystem();
    fileSystem.files.set(DB, new Uint8Array(4096));

    expect(() => openVfs(fileSystem)).toThrow(`测试文件 VFS 声明了分块布局，但 ${DB} 是单文件布局`);
  });

  it.each([0, -4, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('chunkBytes 为 %s 时拒绝', chunkBytes => {
    expect(() => openVfs(new QuotaFileSystem(), { kind: 'chunked', chunkBytes })).toThrow(
      new TypeError(`测试小程序的 host.fileLayout.chunkBytes 必须是正整数: ${chunkBytes}`)
    );
  });

  it('未知布局拒绝，不回退到单文件', () => {
    const fileLayout = { kind: 'striped' } as unknown as MiniProgramFileLayout;
    expect(() => openVfs(new QuotaFileSystem(), fileLayout)).toThrow(
      new TypeError('测试小程序的 host.fileLayout.kind 未知: striped')
    );
  });

  it('clear 删掉全部块与回滚余量', async () => {
    const fileSystem = new QuotaFileSystem();
    const { handle, vfs, write } = openVfs(fileSystem);
    await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0);
    await vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL, 0);
    await write(DB_FILE, [1, 2, 3, 4, 5], 0);
    await vfs.xClose(DB_FILE);
    await vfs.xClose(JOURNAL_FILE);

    handle.clear();
    expect(sizes(fileSystem)).toEqual({});
  });
});

describe('回滚余量', () => {
  it('新建主 journal 之前先占好 2×chunkBytes 的余量', async () => {
    const fileSystem = new QuotaFileSystem();
    const { handle, vfs } = openVfs(fileSystem);
    expect(handle.reserveHeld).toBe(false);

    const operations = await operationsDuring(fileSystem, async () => {
      expect(await vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL, 0)).toBe(0);
    });
    expect(operations).toEqual([`write ${RESERVE} 8`, `write ${JOURNAL}.0 0`]);
    expect(handle.reserveHeld).toBe(true);
  });

  it('落盘撞配额时让出余量，报 SQLITE_FULL 并保留平台原文', async () => {
    const fileSystem = new QuotaFileSystem();
    const { handle, vfs, write } = openVfs(fileSystem);
    await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0);
    await vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL, 0);
    await write(DB_FILE, [1, 2, 3, 4, 5, 6], 0);
    fileSystem.quotaBytes = fileSystem.usedBytes;

    expect(await vfs.xSync(DB_FILE, 0)).toBe(SQLITE_FULL);
    expect(fileSystem.files.has(RESERVE)).toBe(false);
    expect(handle.reserveHeld).toBe(false);
    expect(handle.lastError?.cause).toBe(fileSystem.lastQuotaError);

    // 让出的余量正好够回滚按块重写
    expect(await vfs.xSync(DB_FILE, 0)).toBe(0);
  });

  it('让不出余量时仍报 SQLITE_FULL，原因接在平台原文后面', async () => {
    const fileSystem = new QuotaFileSystem();
    const { handle, vfs, write } = openVfs(fileSystem);
    await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0);
    await vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL, 0);
    await write(DB_FILE, [1, 2, 3, 4, 5, 6], 0);
    fileSystem.quotaBytes = fileSystem.usedBytes;
    const unlink = fileSystem.unlinkSync.bind(fileSystem);
    fileSystem.unlinkSync = path => {
      if (path === RESERVE) throw new Error('unlinkSync:fail permission denied');
      unlink(path);
    };

    expect(await vfs.xSync(DB_FILE, 0)).toBe(SQLITE_FULL);
    expect(handle.reserveHeld).toBe(true);
    expect(handle.lastError?.message).toContain(`让出回滚余量 ${RESERVE} 失败: unlinkSync:fail permission denied`);
    expect(handle.lastError?.cause).toBeInstanceOf(Error);
    expect((handle.lastError?.cause as Error).cause).toBe(fileSystem.lastQuotaError);
    fileSystem.quotaBytes = Number.POSITIVE_INFINITY;
  });

  it('余量建不起来不阻止打开，reserveHeld 如实为 false', async () => {
    const fileSystem = new QuotaFileSystem(0);
    const { handle, vfs } = openVfs(fileSystem);

    expect(await vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL, 0)).toBe(0);
    expect(handle.reserveHeld).toBe(false);
    expect(fileSystem.files.has(RESERVE)).toBe(false);
  });

  it('已有热 journal 时不建余量，空间留给回滚', async () => {
    const fileSystem = new QuotaFileSystem();
    fileSystem.files.set(`${JOURNAL}.0`, new Uint8Array(4));
    const { handle, vfs } = openVfs(fileSystem);

    expect(await vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL, 0)).toBe(0);
    expect(fileSystem.files.has(RESERVE)).toBe(false);
    expect(handle.reserveHeld).toBe(false);
  });

  it('余量文件已在就直接认领，不重写', async () => {
    const fileSystem = new QuotaFileSystem();
    fileSystem.files.set(RESERVE, new Uint8Array(8));
    const { handle, vfs } = openVfs(fileSystem);

    const operations = await operationsDuring(fileSystem, () =>
      vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL, 0)
    );
    expect(operations).toEqual([`write ${JOURNAL}.0 0`]);
    expect(handle.reserveHeld).toBe(true);
  });

  it('余量文件大小不对（写撞配额留下的空文件）不认领，按 2×chunkBytes 重写', async () => {
    const fileSystem = new QuotaFileSystem();
    fileSystem.files.set(RESERVE, new Uint8Array(0));
    const { handle, vfs } = openVfs(fileSystem);

    const operations = await operationsDuring(fileSystem, () =>
      vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL, 0)
    );
    expect(operations).toEqual([`write ${RESERVE} 8`, `write ${JOURNAL}.0 0`]);
    expect(handle.reserveHeld).toBe(true);
  });

  it('单文件布局不建余量，文件与现状逐字一致', async () => {
    const fileSystem = new QuotaFileSystem();
    const { handle, vfs, write } = openVfs(fileSystem, { kind: 'single' });
    await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0);
    await vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL, 0);
    await write(DB_FILE, [1, 2, 3, 4, 5], 0);
    await vfs.xSync(DB_FILE, 0);

    expect(sizes(fileSystem)).toEqual({ [DB]: 5, [JOURNAL]: 0 });
    expect(handle.reserveHeld).toBe(false);
  });
});

describe('xClose', () => {
  it.each([{ kind: 'single' }, CHUNKED] as MiniProgramFileLayout[])(
    '%o：落盘失败也释放句柄，旧文件原样保留，断开不再重落',
    async fileLayout => {
      const fileSystem = new QuotaFileSystem();
      const { handle, vfs, write } = openVfs(fileSystem, fileLayout);
      await vfs.xOpen(0, NAME_DB, DB_FILE, OPEN_DB, 0);
      const before = sizes(fileSystem);
      await write(DB_FILE, [1, 2, 3, 4, 5], 0);
      fileSystem.quotaBytes = fileSystem.usedBytes;

      expect(await vfs.xClose(DB_FILE)).toBe(SQLITE_FULL);
      expect(handle.lastError?.cause).toBe(fileSystem.lastQuotaError);
      await closeVfs(handle);
      expect(sizes(fileSystem)).toEqual(before);
    }
  );

  it('deleteOnClose 的文件直接删，不先落盘', async () => {
    const fileSystem = new QuotaFileSystem();
    const { vfs, write } = openVfs(fileSystem);
    await vfs.xOpen(0, NAME_JOURNAL, JOURNAL_FILE, OPEN_JOURNAL | SQLITE_OPEN_DELETEONCLOSE, 0);
    await write(JOURNAL_FILE, [1, 2, 3, 4, 5], 0);

    const operations = await operationsDuring(fileSystem, () => vfs.xClose(JOURNAL_FILE));
    expect(operations).toEqual([`unlink ${JOURNAL}.0`]);
  });
});
