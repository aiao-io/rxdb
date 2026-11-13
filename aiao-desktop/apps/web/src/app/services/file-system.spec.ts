import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { LEGACY_APP_IDS, bundleDirName } from '../disk/application-projection';
import { DesktopFile } from '../disk/desktop-file.entity';
import { DESKTOP, DISK_ROOTS, DiskPath, HOME, TRASH } from '../disk/disk-path';
import { DiskError } from '../disk/disk-store';
import { SEED_VERSION } from '../disk/disk-volume';
import { infoPlist, parseInfoPlist } from '../disk/formats/plist';
import { RxdbDiskStore } from '../disk/rxdb-disk-store';
import { configureServices } from '../testing/angular';
import { stubLocks } from '../testing/browser';
import { FakeDesktopData, restoreEntityStubs, stubFindAll } from '../testing/fake-desktop-data';
import { ApplicationCatalog } from './application-catalog';
import { DESKTOP_APPS, applicationManifests } from './desktop-apps';
import { FileSystem, HOME_PATH, PLACES, describeDiskError } from './file-system';

/** 种子里的图片要在浏览器里渲染；Node 里换成固定的字节。 */
vi.mock('./photo-encoder', () => ({ photoEncoder: () => async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }));

const NOW = new Date('2026-07-27T16:34:00Z');
const RECENTS_KEY = 'finder:recents';

interface Options {
  readonly data?: FakeDesktopData;
  readonly readyError?: Error;
  readonly recents?: unknown;
}

function setup({ data = new FakeDesktopData(), readyError, recents }: Options = {}) {
  const locks = stubLocks();
  const files = data.table<DesktopFile>(DesktopFile);
  stubFindAll(DesktopFile, files.rows$);
  if (readyError) data.ready = Promise.reject(readyError);
  const stored = new Map<string, unknown>(recents === undefined ? [] : [[RECENTS_KEY, recents]]);
  const preferences = {
    get: vi.fn((key: string, guard: (value: unknown) => boolean) =>
      guard(stored.get(key)) ? stored.get(key) : undefined
    ),
    set: vi.fn(async (key: string, value: unknown) => {
      stored.set(key, value);
    })
  };
  configureServices([
    FileSystem,
    ApplicationCatalog,
    { provide: DESKTOP_APPS, useValue: DESKTOP_APP_MANIFESTS },
    { provide: DesktopData, useValue: data },
    { provide: Preferences, useValue: preferences }
  ]);
  const fs = TestBed.inject(FileSystem);
  const catalog = TestBed.inject(ApplicationCatalog);
  const changes: (readonly DiskPath[])[] = [];
  fs.changes.subscribe(paths => changes.push(paths));
  return { fs, catalog, data, files, preferences, locks, changes };
}

/** 推进假时钟：活查询合并同一批写入的 30ms 窗口过去，树才会刷新。 */
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(40);
};

/** 挂载并等到目录树就绪。 */
async function mounted(options?: Options) {
  const context = setup(options);
  await flush();
  await context.fs.whenReady();
  return context;
}

const folderNames = (fs: FileSystem, path: DiskPath): string[] =>
  (fs.nodeAt(path)?.children ?? []).map(child => child.name);

const infoOf = (dir: string): DiskPath => ['Applications', dir, 'Contents', 'Info.plist'];

/** 预装包的目录名，按清单。 */
const bundleDirs = (): string[] =>
  applicationManifests(DESKTOP_APP_MANIFESTS)
    .map(app => bundleDirName(app))
    .sort((a, b) => a.localeCompare(b));

/**
 * 在 FileSystem 挂载之前，往库里放一块「旧版种子建成」的磁盘：已有完成标记（所以不会重新复制内置内容），
 * /Applications 里是旧的手写包（没有 AiaoAppId），另有用户自己的文件。
 */
async function seedLegacyDisk(data: FakeDesktopData, names: readonly string[]): Promise<RxdbDiskStore> {
  const store = new RxdbDiskStore({
    repository: () => data.repository(DesktopFile) as never,
    instantiate: fields => data.instantiate(DesktopFile, fields) as never,
    storage: () => data.storage as never,
    now: Date.now
  });
  const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
  for (const name of names) {
    const identifier = `io.aiao.desktop.${name.toLowerCase().replace(/\s+/g, '-')}`;
    await store.write(infoOf(`${name}.app`), encode(infoPlist({ name, identifier, version: '26.0' })));
    await store.write(['Applications', `${name}.app`, 'Contents', 'PkgInfo'], encode('APPL????'));
  }
  data.table(SystemPreference).seed([{ key: 'seed:disk', value: { version: SEED_VERSION, seededAt: NOW.getTime() } }]);
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  restoreEntityStubs();
  vi.useRealTimers();
});

describe('FileSystem 挂载', () => {
  it('首次挂载复制内置磁盘并写完成标记，目录树就绪后状态变为 ready', async () => {
    const { fs, data, locks } = setup();
    expect(fs.state()).toBe('mounting');
    expect(fs.root().children).toEqual([]);

    await flush();
    await fs.whenReady();
    expect(fs.state()).toBe('ready');
    expect(fs.error()).toBeNull();
    expect(fs.nodeAt([...DESKTOP, 'prasenx.txt'])).toMatchObject({ name: 'prasenx.txt', kind: 'file' });
    expect(folderNames(fs, ['Applications']).length).toBeGreaterThan(10);
    expect(data.storage.upload).toHaveBeenCalled();
    expect(locks).toHaveBeenCalledWith('aiao-desktop-disk', expect.any(Function));

    const marker = data.table(SystemPreference).rows.find(row => row['key'] === 'seed:disk');
    expect(marker?.['value']).toEqual({ version: SEED_VERSION, seededAt: NOW.getTime() });
  });

  it('再次挂载同一个库：保留用户的改动，不重新复制内置内容', async () => {
    const first = await mounted();
    await first.fs.newFolder(DESKTOP);
    await first.fs.moveToTrash([...DESKTOP, 'prasenx.txt']);
    await flush();
    const uploads = first.data.storage.upload.mock.calls.length;

    const second = await mounted({ data: first.data });
    expect(folderNames(second.fs, DESKTOP)).toContain('untitled folder');
    expect(folderNames(second.fs, DESKTOP)).not.toContain('prasenx.txt');
    expect(first.data.storage.upload.mock.calls.length).toBe(uploads);
  });

  it('库连不上时状态为 failed 并带原因，whenReady 照样完成；之后的磁盘操作报「不可用」', async () => {
    const { fs } = setup({ readyError: new Error('OPFS is unavailable') });
    await flush();
    await fs.whenReady();
    expect(fs.state()).toBe('failed');
    expect(fs.error()).toBe('OPFS is unavailable');

    await expect(fs.newFolder(DESKTOP)).rejects.toThrow('Macintosh HD is unavailable: OPFS is unavailable');
    await expect(fs.readText([...DESKTOP, 'prasenx.txt'])).rejects.toThrow('Macintosh HD is unavailable');
    await expect(fs.erase()).rejects.toThrow('Macintosh HD is unavailable: OPFS is unavailable');
  });

  it('活查询出错时状态变为 failed', async () => {
    const { fs, files } = await mounted();
    files.fail(new Error('query broke'));
    expect(fs.state()).toBe('failed');
    expect(fs.error()).toBe('query broke');
  });

  it('宿主销毁后不再跟随文件行的变化', async () => {
    const { fs, files } = await mounted();
    const desktop = files.rows.find(row => row.name === 'Desktop');
    const add = (name: string): void =>
      files.seed([{ name, type: 'file', parentId: desktop?.id, size: 0, modifiedAt: NOW }]);

    add('before.txt');
    await flush();
    expect(fs.nodeAt([...DESKTOP, 'before.txt'])).not.toBeNull();

    TestBed.resetTestingModule();
    add('after.txt');
    await flush();
    expect(fs.nodeAt([...DESKTOP, 'after.txt'])).toBeNull();
  });
});

describe('FileSystem 预装应用（Applications 是应用清单的系统投影）', () => {
  it('挂载后 /Applications 与清单一一对应：每个包带 Info.plist，应用目录服务知道哪些包归系统', async () => {
    const { fs, catalog, data } = await mounted();
    expect(folderNames(fs, ['Applications'])).toEqual(bundleDirs());
    expect(catalog.owned().size).toBe(bundleDirs().length);
    const info = parseInfoPlist(await fs.readText(infoOf('Safari.app')));
    expect(info).toMatchObject({ appId: 'safari', identifier: 'io.aiao.desktop.safari' });
    expect(catalog.appIdAt(['Applications', '几猫3A大作.app'])).toBe('saltline');
    expect(data.table(SystemPreference).rows.some(row => row['key'] === 'seed:disk')).toBe(true);
  });

  it('再次挂载同一个库：对账幂等，不重复补写', async () => {
    const first = await mounted();
    const uploads = first.data.storage.upload.mock.calls.length;
    const second = await mounted({ data: first.data });
    expect(first.data.storage.upload.mock.calls.length).toBe(uploads);
    expect(second.catalog.owned().size).toBe(bundleDirs().length);
  });

  it('旧种子建成的库：缺的预装包补出来、旧包补上标识，用户放进包里的文件和同名的非包条目原样保留', async () => {
    const data = new FakeDesktopData();
    const names = Object.keys(LEGACY_APP_IDS).filter(name => name !== 'Maps' && name !== 'Mail');
    const store = await seedLegacyDisk(data, names);
    const mine = new TextEncoder().encode('mine');
    await store.write(['Applications', 'Safari.app', 'Contents', 'Resources', 'mine.txt'], mine);
    await store.write(['Applications', 'Mail.app'], new TextEncoder().encode('a file, not a bundle'));

    const { fs, catalog } = await mounted({ data });
    expect(await fs.readText(['Applications', 'Safari.app', 'Contents', 'Resources', 'mine.txt'])).toBe('mine');
    expect(parseInfoPlist(await fs.readText(infoOf('Safari.app'))).appId).toBe('safari');
    expect(fs.nodeAt(['Applications', 'Maps.app'])).not.toBeNull();
    expect(await fs.readText(['Applications', 'Mail.app'])).toBe('a file, not a bundle');
    expect(catalog.conflicts()).toContainEqual({ appId: 'mail', dir: 'Mail.app', reason: 'occupied' });
    expect(catalog.conflictNote()).toContain('Mail.app can’t be shown here');
    expect(catalog.packageOf('mail')).toBeNull();
    expect(catalog.packageOf('maps')).toBe('Maps.app');
  });

  it('moveToTrash 拒绝预装包：说明是「不能移进废纸篓」，包还在 Applications，也没有通知终端', async () => {
    const { fs, changes } = await mounted();
    await expect(fs.moveToTrash(['Applications', 'Safari.app'])).rejects.toMatchObject({
      code: 'EACCES',
      message: 'The item “Safari.app” can’t be moved to the Trash because it’s part of a preinstalled application.'
    });
    await flush();
    expect(fs.nodeAt(['Applications', 'Safari.app'])).not.toBeNull();
    expect(fs.nodeAt([...TRASH, 'Safari.app'])).toBeNull();
    expect(changes).toEqual([]);
  });

  it('包里系统写入的子项同样不能移进废纸篓；用户放进包里的文件可以', async () => {
    const { fs } = await mounted();
    await expect(fs.moveToTrash(['Applications', 'Safari.app', 'Contents'])).rejects.toMatchObject({ code: 'EACCES' });

    const mine = ['Applications', 'Safari.app', 'readme.md'];
    await fs.writeText(mine, 'my notes');
    await fs.moveToTrash(mine);
    await flush();
    expect(fs.nodeAt(mine)).toBeNull();
    expect(await fs.readText([...TRASH, 'readme.md'])).toBe('my notes');
    expect(fs.nodeAt(['Applications', 'Safari.app'])).not.toBeNull();
  });

  it('同名的非包条目不受保护：可以移进废纸篓', async () => {
    const { fs } = await mounted();
    await fs.writeText([...DESKTOP, 'Safari.app'], 'a copy, not a bundle');
    await fs.moveToTrash([...DESKTOP, 'Safari.app']);
    await flush();
    expect(fs.nodeAt([...TRASH, 'Safari.app'])).not.toBeNull();
  });

  it('交给外部任务的存储带着保护：Finder、TextEdit、终端回写的写入、删除、移动都被预装包拒绝', async () => {
    const { fs } = await mounted();
    const safari = ['Applications', 'Safari.app'];
    await expect(fs.run(store => store.remove(safari))).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.run(store => store.write(infoOf('Safari.app'), new Uint8Array(1)))).rejects.toMatchObject({
      code: 'EACCES'
    });
    await expect(fs.run(store => store.move(safari, ['Applications', 'Renamed.app']))).rejects.toMatchObject({
      code: 'EACCES'
    });
    await expect(fs.run(store => store.remove(['Applications']))).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.writeText(infoOf('Safari.app'), 'overwritten')).rejects.toMatchObject({ code: 'EACCES' });

    await fs.run(store => store.write([...safari, 'mine.txt'], new Uint8Array(1)));
    expect(await fs.run(store => store.kindOf([...safari, 'mine.txt']))).toBe('file');
    expect(parseInfoPlist(await fs.readText(infoOf('Safari.app'))).appId).toBe('safari');
  });

  it('erase 后由清单重新生成 /Applications：用户的改动清掉，预装包原样回来', async () => {
    const { fs, catalog } = await mounted();
    await fs.writeText(['Applications', 'Safari.app', 'mine.txt'], 'mine');
    await fs.writeText(['Applications', 'Extra.txt'], 'extra');

    await fs.erase();
    await flush();
    expect(folderNames(fs, ['Applications'])).toEqual(bundleDirs());
    expect(fs.nodeAt(['Applications', 'Safari.app', 'mine.txt'])).toBeNull();
    expect(catalog.owned().size).toBe(bundleDirs().length);
    expect(parseInfoPlist(await fs.readText(infoOf('Safari.app'))).appId).toBe('safari');
  });
});

describe('FileSystem 查询', () => {
  it('get 按 Finder 路径取节点：磁盘路径、废纸篓；虚拟位置与不存在的路径为 null', async () => {
    const { fs } = await mounted();
    expect(fs.get(['Macintosh HD', ...DESKTOP])?.name).toBe('Desktop');
    expect(fs.get(['Macintosh HD'])?.name).toBe('Macintosh HD');
    expect(fs.get(['Trash'])?.name).toBe('.Trash');
    expect(fs.get(['Trash', 'old-draft.md'])?.kind).toBe('file');
    expect(fs.get(['Macintosh HD', 'nope'])).toBeNull();
    expect(fs.get(['AirDrop'])).toBeNull();
  });

  it('findPath 把节点的磁盘路径转成 Finder 路径；废纸篓里的条目以 Trash 开头', async () => {
    const { fs } = await mounted();
    const note = fs.nodeAt([...DESKTOP, 'prasenx.txt']);
    const trashed = fs.nodeAt([...TRASH, 'old-draft.md']);
    expect(note && fs.findPath(note)).toEqual(['Macintosh HD', ...DESKTOP, 'prasenx.txt']);
    expect(trashed && fs.findPath(trashed)).toEqual(['Trash', 'old-draft.md']);
    expect(fs.findPath({ ...(note ?? fs.root()), path: null })).toBeNull();
  });

  it('deepSearch 递归查名字，不区分大小写', async () => {
    const { fs } = await mounted();
    const names = fs.deepSearch(fs.nodeAt(HOME), 'ON-RESTRAINT').map(node => node.name);
    expect(names).toEqual(['on-restraint.md']);
    expect(fs.deepSearch(null, 'x')).toEqual([]);
  });

  it('建好后的快捷位置指向各自的 Finder 路径', () => {
    expect(PLACES['Desktop']).toEqual(['Macintosh HD', ...DESKTOP]);
    expect(PLACES['Trash']).toEqual(['Trash']);
    expect(PLACES['AirDrop']).toBeNull();
    expect(PLACES['Macintosh HD']).toEqual(['Macintosh HD']);
    expect(HOME_PATH).toEqual(['Macintosh HD', ...HOME]);
  });

  it('describeDiskError 取错误自带的说明，其他值转成字符串', () => {
    expect(describeDiskError(new DiskError('ENOENT', ['a']))).toBe('ENOENT: /a');
    expect(describeDiskError(new Error('boom'))).toBe('boom');
    expect(describeDiskError('plain')).toBe('plain');
  });
});

describe('FileSystem 最近使用', () => {
  it('没有记录时用初始的五个文件', async () => {
    const { fs } = await mounted();
    expect(fs.recents().map(node => node.name)).toEqual([
      'index.html',
      'prasenx.txt',
      'on-restraint.md',
      'render-final.mp4',
      'Interface Guidelines.pdf'
    ]);
  });

  it('有记录时按记录排列，跳过已经不存在的路径和文件夹', async () => {
    const { fs } = await mounted({
      recents: [
        [...DESKTOP, 'todo-gone.md'],
        DESKTOP,
        [...DESKTOP, 'prasenx.txt'],
        [...HOME, 'Documents', 'Writing', 'shadow-notes.md']
      ]
    });
    expect(fs.recents().map(node => node.name)).toEqual(['prasenx.txt', 'shadow-notes.md']);
  });

  it('记录格式不合规时回到初始的五个文件', async () => {
    const { fs } = await mounted({ recents: [['ok', 1]] });
    expect(fs.recents()).toHaveLength(5);
  });

  it('noteOpened 把刚打开的文件排到最前，去重，最多保留 20 个，存进系统偏好', async () => {
    const { fs, preferences } = await mounted();
    const interface_ = [...DESKTOP, 'Interface Guidelines.pdf'];
    fs.noteOpened(interface_);
    const [key, saved] = preferences.set.mock.calls[0] as unknown as [string, DiskPath[]];
    expect(key).toBe(RECENTS_KEY);
    expect(saved[0]).toEqual(interface_);
    expect(saved.filter(path => path.join('/') === interface_.join('/'))).toHaveLength(1);
    expect(saved).toHaveLength(5);

    for (let index = 0; index < 25; index++) fs.noteOpened([...DESKTOP, `file-${index}.txt`]);
    const last = preferences.set.mock.calls.at(-1)?.[1] as DiskPath[];
    expect(last).toHaveLength(20);
    expect(last[0]).toEqual([...DESKTOP, 'file-24.txt']);
  });

  it('偏好写不进去时 noteOpened 不报错', async () => {
    const { fs, preferences } = await mounted();
    preferences.set.mockRejectedValueOnce(new Error('库写入失败'));
    expect(() => fs.noteOpened([...DESKTOP, 'prasenx.txt'])).not.toThrow();
    await flush();
  });
});

describe('FileSystem 新建文件夹', () => {
  it('在目录里新建「untitled folder」，重名时追加序号，并通知终端同步', async () => {
    const { fs, changes } = await mounted();
    expect(await fs.newFolder(DESKTOP)).toBe('untitled folder');
    expect(await fs.newFolder(DESKTOP)).toBe('untitled folder 2');
    await flush();
    expect(fs.nodeAt([...DESKTOP, 'untitled folder 2'])?.kind).toBe('folder');
    expect(changes).toEqual([[[...DESKTOP, 'untitled folder']], [[...DESKTOP, 'untitled folder 2']]]);
  });

  it('卷根与 System 里不允许新建，不通知也不改磁盘', async () => {
    const { fs, changes } = await mounted();
    for (const dir of [[], ['System'], ['System', 'Library']]) {
      await expect(fs.newFolder(dir)).rejects.toMatchObject({
        code: 'EACCES',
        message: 'The folder “untitled folder” can’t be created because you don’t have permission.'
      });
    }
    expect(changes).toEqual([]);
    expect(folderNames(fs, ['System']).includes('untitled folder')).toBe(false);
  });
});

describe('FileSystem 废纸篓', () => {
  it('moveToTrash 把条目移进 ~/.Trash，通知终端同步旧路径和新路径，废纸篓变满', async () => {
    const { fs, changes } = await mounted();
    await fs.emptyTrash();
    await flush();
    expect(fs.trashFull()).toBe(false);

    await fs.moveToTrash([...DESKTOP, 'prasenx.txt']);
    await flush();
    expect(fs.nodeAt([...DESKTOP, 'prasenx.txt'])).toBeNull();
    expect(fs.nodeAt([...TRASH, 'prasenx.txt'])?.kind).toBe('file');
    expect(fs.trashFull()).toBe(true);
    expect(changes.at(-1)).toEqual([
      [...DESKTOP, 'prasenx.txt'],
      [...TRASH, 'prasenx.txt']
    ]);
  });

  it('废纸篓里已有同名条目时追加序号', async () => {
    const { fs } = await mounted();
    await fs.writeText([...DESKTOP, 'a.txt'], 'one');
    await fs.writeText([...HOME, 'Documents', 'a.txt'], 'two');
    await fs.moveToTrash([...DESKTOP, 'a.txt']);
    await fs.moveToTrash([...HOME, 'Documents', 'a.txt']);
    await flush();
    expect(await fs.readText([...TRASH, 'a.txt'])).toBe('one');
    expect(await fs.readText([...TRASH, 'a 2.txt'])).toBe('two');
  });

  it('macOS 必需的条目不能移走：卷根、顶层目录、System、主目录及其标准文件夹', async () => {
    const { fs, changes } = await mounted();
    const required: [DiskPath, string][] = [
      [[], 'Macintosh HD'],
      [['Users'], 'Users'],
      [['System', 'Library'], 'Library'],
      [HOME, 'prasenjit'],
      [[...HOME, 'Documents'], 'Documents'],
      [[...HOME, '.Trash'], '.Trash']
    ];
    for (const [path, name] of required) {
      await expect(fs.moveToTrash(path)).rejects.toMatchObject({
        code: 'EACCES',
        message: `The item “${name}” can’t be moved to the Trash because it’s required by macOS.`
      });
    }
    expect(changes).toEqual([]);
  });

  it('主目录里自己建的文件夹可以移走', async () => {
    const { fs } = await mounted();
    await fs.writeText([...HOME, 'Mine', 'x.txt'], 'x');
    await fs.moveToTrash([...HOME, 'Mine']);
    await flush();
    expect(fs.nodeAt([...TRASH, 'Mine', 'x.txt'])).not.toBeNull();
  });

  it('已经在废纸篓里的条目不能再移进去', async () => {
    const { fs } = await mounted();
    await expect(fs.moveToTrash([...TRASH, 'old-draft.md'])).rejects.toMatchObject({
      code: 'EEXIST',
      message: '“old-draft.md” is already in the Trash.'
    });
  });

  it('要移走的条目不存在时报 ENOENT，不通知', async () => {
    const { fs, changes } = await mounted();
    await expect(fs.moveToTrash([...DESKTOP, 'ghost.txt'])).rejects.toMatchObject({ code: 'ENOENT' });
    expect(changes).toEqual([]);
  });

  it('emptyTrash 删光废纸篓并释放文件体，通知被删的路径', async () => {
    const { fs, data, changes } = await mounted();
    const blobs = data.storage.blobs.size;
    await fs.emptyTrash();
    await flush();
    expect(folderNames(fs, TRASH)).toEqual([]);
    expect(fs.trashFull()).toBe(false);
    expect(changes.at(-1)).toEqual([[...TRASH, 'old-draft.md']]);
    expect(data.storage.blobs.size).toBe(blobs - 1);
  });

  it('废纸篓不存在或本来就是空的：emptyTrash 照常完成，通知空列表', async () => {
    const { fs, changes } = await mounted();
    await fs.run(store => store.remove(TRASH));
    await fs.emptyTrash();
    await fs.emptyTrash();
    expect(changes).toEqual([[], []]);
  });
});

describe('FileSystem 读写', () => {
  it('writeText 写入后可以读回文本和字节，并通知终端同步该路径', async () => {
    const { fs, changes } = await mounted();
    const path = [...DESKTOP, 'hello.txt'];
    await fs.writeText(path, '你好，world');
    expect(await fs.readText(path)).toBe('你好，world');
    expect(new TextDecoder().decode(await fs.read(path))).toBe('你好，world');
    expect(changes).toEqual([[path]]);
  });

  it('覆盖写入替换内容，旧文件体被释放', async () => {
    const { fs, data } = await mounted();
    const path = [...DESKTOP, 'draft.md'];
    await fs.writeText(path, 'v1');
    const blobs = data.storage.blobs.size;
    await fs.writeText(path, 'v2');
    expect(await fs.readText(path)).toBe('v2');
    expect(data.storage.blobs.size).toBe(blobs);
  });

  it('读不存在的文件报 ENOENT', async () => {
    const { fs } = await mounted();
    await expect(fs.readText([...DESKTOP, 'ghost.txt'])).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('树随写入刷新：新文件出现在 Finder 能读到的目录树里', async () => {
    const { fs } = await mounted();
    await fs.writeText([...DESKTOP, 'fresh.txt'], 'new');
    expect(fs.nodeAt([...DESKTOP, 'fresh.txt'])).toBeNull();
    await flush();
    expect(fs.nodeAt([...DESKTOP, 'fresh.txt'])).toMatchObject({ kind: 'file', bytes: 3 });
  });
});

describe('FileSystem 抹掉磁盘', () => {
  it('erase 清掉所有改动，恢复内置内容，更新完成标记，并通知四个顶层目录', async () => {
    const { fs, data, changes } = await mounted();
    await fs.writeText([...DESKTOP, 'mine.txt'], 'x');
    await fs.moveToTrash([...DESKTOP, 'prasenx.txt']);
    const later = new Date(NOW.getTime() + 60_000);
    vi.setSystemTime(later);

    await fs.erase();
    await flush();
    expect(fs.nodeAt([...DESKTOP, 'mine.txt'])).toBeNull();
    expect(fs.nodeAt([...DESKTOP, 'prasenx.txt'])?.kind).toBe('file');
    expect(await fs.readText([...DESKTOP, 'prasenx.txt'])).toContain('prasenx');
    expect(changes.at(-1)).toEqual(DISK_ROOTS.map(root => [root]));
    expect(data.storage.clear).toHaveBeenCalledWith('blobs');
    const marker = data.table(SystemPreference).rows.find(row => row['key'] === 'seed:disk');
    expect(marker?.['value']).toEqual({ version: SEED_VERSION, seededAt: later.getTime() });
  });
});

describe('FileSystem 串行队列', () => {
  it('run 里的任务按调用顺序一个接一个执行', async () => {
    const { fs } = await mounted();
    const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => (release = resolve));
    const first = fs.run(async () => {
      order.push('first:start');
      await gate;
      order.push('first:end');
    });
    const second = fs.run(async () => {
      order.push('second');
    });

    await flush();
    expect(order).toEqual(['first:start']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('一个任务失败不会卡住后面的任务', async () => {
    const { fs } = await mounted();
    const failed = fs.run(() => Promise.reject(new Error('boom')));
    const next = fs.run(async () => 'still works');
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('still works');
  });

  it('同一路径上并发的写入不会交错：最后一次调用的内容胜出', async () => {
    const { fs } = await mounted();
    const path = [...DESKTOP, 'race.txt'];
    await Promise.all([fs.writeText(path, 'one'), fs.writeText(path, 'two'), fs.writeText(path, 'three')]);
    expect(await fs.readText(path)).toBe('three');
  });

  it('挂载完成之前提交的读写会排队等挂载结束', async () => {
    const { fs } = setup();
    const read = fs.readText([...DESKTOP, 'prasenx.txt']);
    await flush();
    expect(await read).toContain('prasenx');
  });
});
