import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { DiskPath } from '../disk/disk-path';
import { DiskStore } from '../disk/disk-store';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { AppContextFiles, FileStamp, appFilesOver, parseVersion, versionOf } from './app-files';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);
const NOTE: DiskPath = ['Users', 'prasenjit', 'Documents', 'note.md'];
const FOLDER: DiskPath = ['Users', 'prasenjit', 'Documents'];

/** 内存磁盘加可控的时钟；`run` 像真实的磁盘服务一样把存储交给任务，改动通知另外记下。 */
async function setup() {
  let now = 1_000;
  const store = new MemoryDiskStore(() => now);
  await store.write(NOTE, bytes('hello'));
  const changes = new Subject<readonly DiskPath[]>();
  const notified: (readonly DiskPath[])[] = [];
  changes.subscribe(paths => notified.push(paths));
  const tasks: string[] = [];
  const files: AppContextFiles = appFilesOver({
    run: <T>(task: (disk: DiskStore) => Promise<T>) => {
      tasks.push('run');
      return task(store);
    },
    changes
  });
  return {
    files,
    store,
    notified,
    tasks,
    tick: (to: number) => (now = to),
    stampOf: async (path: DiskPath): Promise<FileStamp> => {
      const info = await store.info(path);
      return { modified: info.modified, size: info.size };
    }
  };
}

describe('版本串', () => {
  it('版本是修改时间与大小，写成 <毫秒>:<字节数>；读回的就是写出的；别的写法读不回', () => {
    expect(versionOf({ modified: 1_731_000_000_000, size: 42 })).toBe('1731000000000:42');
    expect(parseVersion('1731000000000:42')).toEqual({ modified: 1_731_000_000_000, size: 42 });
    for (const bad of ['', 'latest', '1:', ':2', '1:2:3', '-1:2', '1.5:2', '12345678901234567:1', ' 1:2'])
      expect(parseVersion(bad), bad).toBeNull();
  });
});

describe('snapshot：读用户选定的那一个文件', () => {
  it('读到内容快照与打开时的版本；整个读在磁盘的独占任务里一次做完', async () => {
    const { files, stampOf, tasks } = await setup();
    const snapshot = await files.snapshot(NOTE, 100);
    expect(snapshot).toMatchObject({ kind: 'ok', stamp: await stampOf(NOTE) });
    expect(snapshot.kind === 'ok' && text(snapshot.bytes)).toBe('hello');
    expect(tasks).toHaveLength(2);
  });

  it('文件刚好等于上限可以读，超过上限不读内容（FILE_TOO_LARGE 的磁盘侧依据）', async () => {
    const { files } = await setup();
    expect((await files.snapshot(NOTE, 5)).kind).toBe('ok');
    expect(await files.snapshot(NOTE, 4)).toEqual({ kind: 'too-large', size: 5 });
  });

  it('文件已被删除、改名或被同名文件夹顶替：missing，不抛错', async () => {
    const { files, store } = await setup();
    await store.move(NOTE, [...FOLDER, 'renamed.md']);
    expect(await files.snapshot(NOTE, 100)).toEqual({ kind: 'missing' });
    expect(await files.snapshot([...FOLDER, 'nope.md'], 100)).toEqual({ kind: 'missing' });
    expect(await files.snapshot(FOLDER, 100)).toEqual({ kind: 'missing' });
    expect(await files.snapshot(['Nowhere', 'a.md'], 100)).toEqual({ kind: 'missing' });
  });
});

describe('replace：带凭证写回同一个文件', () => {
  it('版本一致才写，写回后返回新版本，并通知磁盘的改动（终端、Finder 跟着更新）', async () => {
    const { files, store, stampOf, tick, notified } = await setup();
    const opened = await stampOf(NOTE);
    tick(2_000);
    const result = await files.replace(NOTE, bytes('hello, world'), opened);
    expect(result).toEqual({ kind: 'ok', stamp: { modified: 2_000, size: 12 } });
    expect(text(await store.read(NOTE))).toBe('hello, world');
    expect(notified).toEqual([[NOTE]]);
  });

  it('文件被别处改动（修改时间或大小变了）：changed，不写入，磁盘保持别处改动后的内容', async () => {
    const { files, store, stampOf, tick, notified } = await setup();
    const opened = await stampOf(NOTE);
    tick(2_000);
    await store.replace(NOTE, bytes('someone else'));
    expect(await files.replace(NOTE, bytes('mine'), opened)).toEqual({ kind: 'changed' });
    expect(text(await store.read(NOTE))).toBe('someone else');
    /* 只有大小变了也算改动（修改时间恰好相同）。 */
    await store.replace(NOTE, bytes('abc'));
    expect(await files.replace(NOTE, bytes('mine'), { modified: 2_000, size: 5 })).toEqual({ kind: 'changed' });
    expect(text(await store.read(NOTE))).toBe('abc');
    expect(notified).toEqual([]);
  });

  it('文件被删除或改名：missing，不写入，也不在原路径新建（这个路径之后仍然不存在）', async () => {
    const { files, store, stampOf, notified } = await setup();
    const opened = await stampOf(NOTE);
    await store.move(NOTE, [...FOLDER, 'renamed.md']);
    expect(await files.replace(NOTE, bytes('mine'), opened)).toEqual({ kind: 'missing' });
    expect(await store.kindOf(NOTE)).toBeNull();
    expect(text(await store.read([...FOLDER, 'renamed.md']))).toBe('hello');
    await store.remove([...FOLDER, 'renamed.md']);
    expect(await files.replace(NOTE, bytes('mine'), opened)).toEqual({ kind: 'missing' });
    expect(await store.kindOf(NOTE)).toBeNull();
    expect(await store.kindOf(FOLDER)).toBe('directory');
    expect(notified).toEqual([]);
  });

  it('同名位置现在是个文件夹：当作文件已经不在，不写入', async () => {
    const { files, store, stampOf } = await setup();
    const opened = await stampOf(NOTE);
    await store.remove(NOTE);
    await store.mkdir(NOTE);
    expect(await files.replace(NOTE, bytes('mine'), opened)).toEqual({ kind: 'missing' });
    expect(await store.kindOf(NOTE)).toBe('directory');
  });

  it('省略版本就不比对（应用明确选择覆盖），但文件不在了仍然不新建', async () => {
    const { files, store, tick } = await setup();
    tick(3_000);
    expect(await files.replace(NOTE, bytes('blind'), undefined)).toEqual({
      kind: 'ok',
      stamp: { modified: 3_000, size: 5 }
    });
    await store.remove(NOTE);
    expect(await files.replace(NOTE, bytes('blind'), undefined)).toEqual({ kind: 'missing' });
    expect(await store.kindOf(NOTE)).toBeNull();
  });

  it('磁盘自己的错误（例如预装应用包受保护）不被吞掉，原样抛出', async () => {
    const { files, store } = await setup();
    store.replace = () => Promise.reject(new Error('disk exploded'));
    await expect(files.replace(NOTE, bytes('x'), undefined)).rejects.toThrow('disk exploded');
  });
});

describe('create：保存面板选定的位置', () => {
  const TARGET: DiskPath = [...FOLDER, 'new.md'];

  it('目标不存在：新建，返回版本，并通知改动', async () => {
    const { files, store, notified, tick } = await setup();
    tick(4_000);
    expect(await files.create(TARGET, bytes('fresh'), false)).toEqual({
      kind: 'ok',
      stamp: { modified: 4_000, size: 5 }
    });
    expect(text(await store.read(TARGET))).toBe('fresh');
    expect(notified).toEqual([[TARGET]]);
  });

  it('目标已有文件：用户确认过覆盖才写；没确认就不写（不静默覆盖）', async () => {
    const { files, store, tick } = await setup();
    expect(await files.create(NOTE, bytes('replaced'), false)).toEqual({ kind: 'exists' });
    expect(text(await store.read(NOTE))).toBe('hello');
    tick(5_000);
    expect(await files.create(NOTE, bytes('replaced'), true)).toEqual({
      kind: 'ok',
      stamp: { modified: 5_000, size: 8 }
    });
    expect(text(await store.read(NOTE))).toBe('replaced');
  });

  it('目标是同名文件夹：不写，即使确认过覆盖', async () => {
    const { files, store } = await setup();
    await store.mkdir([...FOLDER, 'dir']);
    expect(await files.create([...FOLDER, 'dir'], bytes('x'), true)).toEqual({ kind: 'exists' });
    expect(await store.kindOf([...FOLDER, 'dir'])).toBe('directory');
  });

  it('选定的文件夹在确认之后被删掉：不补建父目录，missing-folder，磁盘上什么也没多出来', async () => {
    const { files, store } = await setup();
    const gone: DiskPath = [...FOLDER, 'sub', 'a.md'];
    expect(await files.create(gone, bytes('x'), false)).toEqual({ kind: 'missing-folder' });
    expect(await store.kindOf([...FOLDER, 'sub'])).toBeNull();
    expect(await files.create(['a.md'], bytes('x'), false)).toEqual({
      kind: 'ok',
      stamp: { modified: 1_000, size: 1 }
    });
  });
});
