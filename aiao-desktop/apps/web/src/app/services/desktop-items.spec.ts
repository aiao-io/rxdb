import { ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { FinderClipboard } from '../apps/finder/finder-clipboard';
import { Preferences } from '../data/preferences';
import { DESKTOP, DiskPath, finderPathOf } from '../disk/disk-path';
import { DiskError } from '../disk/disk-store';
import { FsNode } from '../disk/disk-tree';
import { configureServices } from '../testing/angular';
import { fileNode, folderNode } from '../testing/nodes';
import { createWindowManagerStub } from '../testing/stubs';
import {
  DesktopCell,
  DesktopItems,
  SortableItem,
  gridMetrics,
  layoutOrderedCells,
  migrateCell,
  rangeSelectIds,
  shiftCells,
  sortDesktopItems,
  stackItems
} from './desktop-items';
import { FileOpener } from './file-opener';
import { FileSystem } from './file-system';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

const CELLS_KEY = 'desktop:cells';

interface Options {
  readonly entries?: readonly FsNode[];
  readonly saved?: unknown;
  /** CELLS_KEY 之外各键的库内容（desktop:sort / desktop:stacks / desktop:view-options）。 */
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly preferencesFail?: boolean;
}

function setup({ entries = [], saved, settings = {}, preferencesFail = false }: Options = {}) {
  const desktop = signal<FsNode>(folderNode('Desktop', entries, DESKTOP));
  const root = folderNode('Macintosh HD', [], []);
  const fs = {
    nodeAt: (path: DiskPath) => (path.join('/') === DESKTOP.join('/') ? desktop() : null),
    root: () => root,
    newFolder: vi.fn(async () => 'untitled folder'),
    moveToTrashBatch: vi.fn(async () => undefined),
    canUndoTrash: signal(false),
    undoTrash: vi.fn(async () => undefined),
    copyTo: vi.fn(async (path: DiskPath, dir: DiskPath) => [...dir, path.at(-1)!]),
    moveTo: vi.fn(async (path: DiskPath, dir: DiskPath) => [...dir, path.at(-1)!]),
    rename: vi.fn(async (path: DiskPath, name: string) => [...path.slice(0, -1), name])
  };
  const wm = createWindowManagerStub();
  const opener = { open: vi.fn() };
  const toast = { show: vi.fn() };
  const errors = { handleError: vi.fn() };
  /** 库里现存的位置；别的标签页改了它之后，用 `remote()` 通知。 */
  let stored = saved;
  const external = new Subject<readonly string[]>();
  const preferences = {
    ready: preferencesFail ? Promise.reject(new Error('库不可用')) : Promise.resolve(),
    external$: external.asObservable(),
    get: vi.fn((key: string) => (key === CELLS_KEY ? stored : settings[key])),
    set: vi.fn(async () => undefined)
  };
  const remote = (next: unknown, keys: readonly string[] = [CELLS_KEY]): void => {
    stored = next;
    external.next(keys);
  };
  configureServices([
    DesktopItems,
    FinderClipboard,
    { provide: FileSystem, useValue: fs },
    { provide: WindowManager, useValue: wm },
    { provide: FileOpener, useValue: opener },
    { provide: Toast, useValue: toast },
    { provide: Preferences, useValue: preferences },
    { provide: ErrorHandler, useValue: errors }
  ]);
  return {
    items: TestBed.inject(DesktopItems),
    clipboard: TestBed.inject(FinderClipboard),
    desktop,
    fs,
    wm,
    opener,
    toast,
    preferences,
    root,
    remote,
    errors
  };
}

/** 等 `preferences.ready` 上登记的回调跑完。 */
const settled = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const cellsByName = (items: DesktopItems): Record<string, DesktopCell> =>
  Object.fromEntries(items.items().map(item => [item.name, item.cell]));

describe('DesktopItems 桌面图标', () => {
  it('Macintosh HD 永远在第一个，后面是 ~/Desktop 里可见的条目，隐藏文件不显示', () => {
    const { items } = setup({
      entries: [folderNode('Projects'), fileNode('prasenx.txt'), fileNode('.DS_Store')]
    });
    expect(items.items().map(item => item.name)).toEqual(['Macintosh HD', 'Projects', 'prasenx.txt']);
    expect(items.items()[0]).toMatchObject({ id: 'hd', icon: 'f-hd' });
  });

  it('沿用原桌面的排布：HD 在左上，已知条目回到原来的格子', () => {
    const { items } = setup({
      entries: [folderNode('Projects'), fileNode('prasenx.txt'), fileNode('Interface Guidelines.pdf')]
    });
    expect(cellsByName(items)).toEqual({
      'Macintosh HD': [0, 0],
      Projects: [0, 1],
      'prasenx.txt': [0, 2],
      'Interface Guidelines.pdf': [1, 0]
    });
  });

  it('新出现的条目依次落到第一个空格，一列放六个', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f'].map(name => fileNode(`${name}.txt`));
    const { items } = setup({ entries: names });
    expect(items.items().map(item => item.cell)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 0]
    ]);
  });

  it('条目消失后让出位置，其余图标不动', () => {
    const { items, desktop } = setup({ entries: [fileNode('a.txt'), fileNode('b.txt'), fileNode('c.txt')] });
    expect(cellsByName(items)['c.txt']).toEqual([0, 3]);

    desktop.set(folderNode('Desktop', [fileNode('a.txt'), fileNode('c.txt')], DESKTOP));
    expect(cellsByName(items)).toEqual({ 'Macintosh HD': [0, 0], 'a.txt': [0, 1], 'c.txt': [0, 3] });
    desktop.set(folderNode('Desktop', [fileNode('a.txt'), fileNode('c.txt'), fileNode('d.txt')], DESKTOP));
    expect(cellsByName(items)['d.txt']).toEqual([0, 2]);
  });

  it('标签里的连字符换成不换行连字符，长文件名只在空格处折行', () => {
    const { items } = setup({ entries: [fileNode('Screenshot-2026.png')] });
    expect(items.items()[1].name).toBe('Screenshot‑2026.png');
    expect(items.items()[1].id).toBe('file:Screenshot-2026.png');
  });

  it('启动后恢复拖动过的位置，位置存在系统偏好里', async () => {
    const { items } = setup({ entries: [fileNode('a.txt')], saved: { hd: [3, 3], 'file:a.txt': [4, 1] } });
    await settled();
    expect(cellsByName(items)).toEqual({ 'Macintosh HD': [3, 3], 'a.txt': [4, 1] });
  });

  it('别的标签页拖了图标：收到变更后这边的图标跟着挪（位置跨标签页共享），别的键变了不动', async () => {
    const { items, remote } = setup({ entries: [fileNode('a.txt')], saved: { hd: [3, 3] } });
    await settled();
    expect(cellsByName(items)['a.txt']).toEqual([0, 1]);

    remote({ hd: [3, 3], 'file:a.txt': [5, 2] }, ['dock:layout']);
    expect(cellsByName(items)['a.txt']).toEqual([0, 1]);
    remote({ hd: [3, 3], 'file:a.txt': [5, 2] });
    expect(cellsByName(items)).toEqual({ 'Macintosh HD': [3, 3], 'a.txt': [5, 2] });
  });

  it('位置写进系统偏好失败：交给 ErrorHandler 报告，不吞掉', async () => {
    const { items, preferences, errors } = setup({ entries: [fileNode('a.txt')] });
    const failure = new Error('disk full');
    preferences.set.mockRejectedValueOnce(failure);
    items.move('file:a.txt', [2, 4]);
    await settled();
    expect(errors.handleError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('偏好库不可用时保持默认排布，不报错', async () => {
    const { items } = setup({ entries: [fileNode('a.txt')], preferencesFail: true });
    await settled();
    expect(cellsByName(items)).toEqual({ 'Macintosh HD': [0, 0], 'a.txt': [0, 1] });
  });

  it('move 更新图标位置并写进系统偏好', () => {
    const { items, preferences } = setup({ entries: [fileNode('a.txt')] });
    items.move('file:a.txt', [2, 4]);
    expect(cellsByName(items)['a.txt']).toEqual([2, 4]);
    expect(preferences.set).toHaveBeenCalledExactlyOnceWith(CELLS_KEY, { hd: [0, 0], 'file:a.txt': [2, 4] });
  });
});

describe('DesktopItems 打开图标', () => {
  it('Macintosh HD 用 Finder 打开卷根', () => {
    const { items, wm } = setup();
    items.items()[0].open();
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('finder', { path: ['Macintosh HD'] });
  });

  it('文件夹用 Finder 打开，文件交给文件打开器', () => {
    const folder = folderNode('Projects');
    const file = fileNode('a.txt');
    const { items, wm, opener } = setup({ entries: [folder, file] });
    items.items()[1].open();
    items.items()[2].open();
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('finder', {
      force: true,
      path: finderPathOf([...DESKTOP, 'Projects'])
    });
    expect(opener.open).toHaveBeenCalledExactlyOnceWith(file);
  });
});

describe('DesktopItems 文件传输', () => {
  it('把选中的桌面条目移动或复制到文件夹，跳过 Macintosh HD', async () => {
    const folder = folderNode('Projects');
    const file = fileNode('a.txt');
    const { items, fs } = setup({ entries: [folder, file] });
    const target = [...DESKTOP, 'Projects'];

    await expect(items.transferToDirectory(['hd', 'file:a.txt'], target, false)).resolves.toEqual([
      [...target, 'a.txt']
    ]);
    await expect(items.transferToDirectory(['file:a.txt'], target, true)).resolves.toEqual([[...target, 'a.txt']]);
    expect(fs.moveTo).toHaveBeenCalledExactlyOnceWith([...DESKTOP, 'a.txt'], target);
    expect(fs.copyTo).toHaveBeenCalledExactlyOnceWith([...DESKTOP, 'a.txt'], target);
  });

  it('把 Finder 剪贴板的复制和剪切内容粘贴到桌面', async () => {
    const { items, clipboard, fs } = setup();
    const source: DiskPath = ['Users', 'stevejobs', 'Documents', 'a.txt'];

    clipboard.set('copy', [{ path: source, name: 'a.txt' }]);
    items.paste();
    await settled();
    expect(fs.copyTo).toHaveBeenCalledExactlyOnceWith(source, DESKTOP);
    expect(clipboard.snapshot()?.mode).toBe('copy');

    clipboard.set('cut', [{ path: source, name: 'a.txt' }]);
    items.paste();
    await settled();
    expect(fs.moveTo).toHaveBeenCalledExactlyOnceWith(source, DESKTOP);
    expect(clipboard.snapshot()).toBeNull();
  });

  it('没有剪贴板内容时提示用户', () => {
    const { items, toast } = setup();
    items.paste();
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Nothing to paste.');
  });
});

describe('DesktopItems 新建文件夹与移到废纸篓', () => {
  it('newFolder 在桌面新建文件夹，成功后记下新建的图标供界面选中', async () => {
    const { items, fs } = setup();
    expect(items.created()).toBeNull();
    items.newFolder();
    await settled();
    expect(fs.newFolder).toHaveBeenCalledExactlyOnceWith(DESKTOP);
    expect(items.created()).toBe('file:untitled folder');
  });

  it('newFolder 失败时提示原因', async () => {
    const { items, fs, toast } = setup();
    fs.newFolder.mockRejectedValueOnce(new DiskError('EACCES', DESKTOP, 'no permission'));
    items.newFolder();
    await settled();
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('no permission');
    expect(items.created()).toBeNull();
  });

  it('remove 把选中的文件作为一批移进废纸篓，跳过 Macintosh HD', async () => {
    const { items, fs } = setup({ entries: [fileNode('a.txt'), fileNode('b.txt')] });
    await expect(items.remove(['file:a.txt', 'hd', 'file:b.txt'])).resolves.toBe(true);
    expect(fs.moveToTrashBatch).toHaveBeenCalledExactlyOnceWith([
      [...DESKTOP, 'a.txt'],
      [...DESKTOP, 'b.txt']
    ]);
  });

  it('Macintosh HD 不能移进废纸篓', async () => {
    const { items, fs, toast } = setup();
    await expect(items.remove(['hd'])).resolves.toBe(false);
    expect(fs.moveToTrashBatch).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('“Macintosh HD” can’t be moved to the Trash.');
  });

  it('不存在的图标、没有磁盘路径的条目同样提示并返回 false', async () => {
    const { items, fs, toast } = setup({ entries: [fileNode('virtual.txt', null)] });
    await expect(items.remove(['file:ghost'])).resolves.toBe(false);
    await expect(items.remove(['file:virtual.txt'])).resolves.toBe(false);
    expect(fs.moveToTrashBatch).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledTimes(2);
  });

  it('移进废纸篓失败时提示磁盘给出的原因，返回 false', async () => {
    const { items, fs, toast } = setup({ entries: [fileNode('a.txt')] });
    fs.moveToTrashBatch.mockRejectedValueOnce(new DiskError('EACCES', DESKTOP, 'required by macOS'));
    await expect(items.remove(['file:a.txt'])).resolves.toBe(false);
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('required by macOS');
  });

  it('撤销失败时提示原因', async () => {
    const { items, fs, toast } = setup();
    fs.undoTrash.mockRejectedValueOnce(new Error('Choose Restore to Folder.'));
    items.undoTrash();
    await settled();
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Choose Restore to Folder.');
  });
});

describe('DesktopItems 排序、叠放与单元格迁移的纯函数', () => {
  const sortable = (id: string, name: string, node: FsNode | null): SortableItem => ({ id, name, node });

  it('sortDesktopItems 按名字、种类、修改时间、大小排序，同级按名字', () => {
    const january = new Date('2026-01-01');
    const july = new Date('2026-07-01');
    const items = [
      sortable('f2', 'b.txt', fileNode('b.txt')),
      sortable('f3', 'c.png', { ...fileNode('c.png'), bytes: 300 }),
      sortable('f1', 'a.txt', { ...fileNode('a.txt'), date: july, bytes: 100 }),
      sortable('f4', 'd.txt', { ...fileNode('d.txt'), date: january, bytes: 200 }),
      sortable('f0', 'A.txt', fileNode('A.txt'))
    ];
    expect(sortDesktopItems(items, 'name').map(item => item.id)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
    expect(sortDesktopItems(items, 'kind').map(item => item.id)).toEqual(['f3', 'f0', 'f1', 'f2', 'f4']);
    expect(sortDesktopItems(items, 'size').map(item => item.id)).toEqual(['f3', 'f4', 'f1', 'f0', 'f2']);
    expect(sortDesktopItems(items, 'date').map(item => item.id)).toEqual(['f1', 'f4', 'f0', 'f2', 'f3']);
  });

  it('layoutOrderedCells 按给定顺序紧凑排布，一列放六个', () => {
    expect([...layoutOrderedCells(['hd', 'a', 'b', 'c', 'd', 'e', 'f', 'g']).entries()]).toEqual([
      ['hd', [0, 0]],
      ['a', [0, 1]],
      ['b', [0, 2]],
      ['c', [0, 3]],
      ['d', [0, 4]],
      ['e', [0, 5]],
      ['f', [1, 0]],
      ['g', [1, 1]]
    ]);
  });

  it('shiftCells 整组按偏移平移，第一个优先落位、互相避让、不挪别的图标', () => {
    const cells = new Map<string, DesktopCell>([
      ['hd', [0, 0]],
      ['a', [0, 1]],
      ['b', [0, 2]],
      ['c', [1, 0]]
    ]);
    expect([...shiftCells(cells, ['a', 'b'], [1, 0]).entries()]).toEqual([
      ['hd', [0, 0]],
      ['c', [1, 0]],
      ['a', [1, 1]],
      ['b', [1, 2]]
    ]);
  });

  it('shiftCells 目标被占时顺着列往下让，负偏移夹回 0', () => {
    const cells = new Map<string, DesktopCell>([
      ['hd', [0, 0]],
      ['a', [0, 1]],
      ['b', [1, 1]]
    ]);
    expect(shiftCells(cells, ['a'], [1, 0]).get('a')).toEqual([1, 2]);
    expect(shiftCells(cells, ['a'], [-1, 0]).get('a')).toEqual([0, 1]);
  });

  it('migrateCell 把旧 id 的格子迁给新 id 并删掉旧 id；旧 id 不在时保留新 id 现有的格子', () => {
    const moved = migrateCell(
      new Map<string, DesktopCell>([
        ['hd', [0, 0]],
        ['file:a.txt', [2, 3]]
      ]),
      'file:a.txt',
      'file:b.txt'
    );
    expect([...moved.entries()]).toEqual([
      ['hd', [0, 0]],
      ['file:b.txt', [2, 3]]
    ]);
    expect([
      ...migrateCell(new Map<string, DesktopCell>([['file:b.txt', [4, 1]]]), 'file:a.txt', 'file:b.txt').entries()
    ]).toEqual([['file:b.txt', [4, 1]]]);
  });

  it('stackItems 按种类分组，组按名字排序，格子依次排布', () => {
    const stacks = stackItems([
      sortable('file:a.png', 'a.png', fileNode('a.png')),
      sortable('file:c.txt', 'c.txt', fileNode('c.txt')),
      sortable('file:docs', 'docs', folderNode('docs')),
      sortable('file:b.jpg', 'b.jpg', fileNode('b.jpg'))
    ]);
    expect(stacks.map(stack => [stack.kind, stack.ids, stack.cell])).toEqual([
      ['Folder', ['file:docs'], [0, 0]],
      ['JPEG image', ['file:b.jpg'], [0, 1]],
      ['PNG image', ['file:a.png'], [0, 2]],
      ['Plain text', ['file:c.txt'], [0, 3]]
    ]);
  });

  it('rangeSelectIds 按网格顺序（先列后行）取两端之间的区间，任一端不在就退回另一端', () => {
    const items = [
      { id: 'a', cell: [0, 0] as const },
      { id: 'b', cell: [1, 0] as const },
      { id: 'c', cell: [0, 1] as const }
    ];
    expect(rangeSelectIds(items, 'a', 'c')).toEqual(['a', 'c']);
    expect(rangeSelectIds(items, 'b', 'a')).toEqual(['a', 'c', 'b']);
    expect(rangeSelectIds(items, 'ghost', 'c')).toEqual(['c']);
    expect(rangeSelectIds(items, 'a', 'ghost')).toEqual(['a']);
  });

  it('gridMetrics 默认档与旧硬编码网格一致（92×98），其余各档成比例', () => {
    expect(gridMetrics({ iconSize: 'medium', gridSpacing: 'default', textSize: 'medium' })).toEqual({
      w: 92,
      h: 98,
      tile: 82,
      art: 60,
      font: 12,
      line: 14
    });
    expect(gridMetrics({ iconSize: 'small', gridSpacing: 'compact', textSize: 'small' })).toEqual({
      w: 76,
      h: 82,
      tile: 70,
      art: 48,
      font: 10,
      line: 12
    });
    expect(gridMetrics({ iconSize: 'large', gridSpacing: 'wide', textSize: 'large' })).toEqual({
      w: 110,
      h: 114,
      tile: 94,
      art: 72,
      font: 14,
      line: 16
    });
  });
});

describe('DesktopItems Sort By / Clean Up / 叠放 / 视图选项', () => {
  it('sortBy 排序后紧凑重排并记住依据', () => {
    const { items, preferences } = setup({ entries: [fileNode('b.txt'), fileNode('a.txt')] });
    items.sortBy('name');
    expect(cellsByName(items)).toEqual({ 'Macintosh HD': [0, 0], 'a.txt': [0, 1], 'b.txt': [0, 2] });
    expect(items.sortCriteria()).toBe('name');
    expect(preferences.set).toHaveBeenCalledWith('desktop:sort', 'name');
    expect(preferences.set).toHaveBeenCalledWith('desktop:cells', {
      hd: [0, 0],
      'file:a.txt': [0, 1],
      'file:b.txt': [0, 2]
    });
  });

  it('sortBy(null) 只清掉勾选（None），不重排', () => {
    const { items, preferences } = setup({ entries: [fileNode('b.txt'), fileNode('a.txt')] });
    items.sortBy('name');
    items.sortBy(null);
    expect(items.sortCriteria()).toBeNull();
    expect(cellsByName(items)['a.txt']).toEqual([0, 1]);
    expect(preferences.set).toHaveBeenLastCalledWith('desktop:sort', null);
  });

  it('cleanUp 按当前视觉顺序紧凑重排，cleanUp(name) 先排序', () => {
    const { items } = setup({ entries: [fileNode('a.txt'), fileNode('b.txt'), fileNode('c.txt')] });
    items.move('file:c.txt', [2, 2]);
    items.move('file:a.txt', [3, 0]);
    items.cleanUp();
    /* 视觉顺序（先列后行）：b [0,2]、c [2,2]、a [3,0] → b、c、a。 */
    expect(cellsByName(items)).toEqual({ 'Macintosh HD': [0, 0], 'b.txt': [0, 1], 'c.txt': [0, 2], 'a.txt': [0, 3] });
    items.cleanUp('name');
    expect(cellsByName(items)).toEqual({ 'Macintosh HD': [0, 0], 'a.txt': [0, 1], 'b.txt': [0, 2], 'c.txt': [0, 3] });
  });

  it('moveMany 整组按偏移移动并一次写回', () => {
    const { items, preferences } = setup({ entries: [fileNode('a.txt'), fileNode('b.txt')] });
    items.moveMany(['file:a.txt', 'file:b.txt'], [1, 0]);
    expect(cellsByName(items)).toEqual({ 'Macintosh HD': [0, 0], 'a.txt': [1, 1], 'b.txt': [1, 2] });
    expect(preferences.set).toHaveBeenCalledExactlyOnceWith('desktop:cells', {
      hd: [0, 0],
      'file:a.txt': [1, 1],
      'file:b.txt': [1, 2]
    });
  });

  it('rename 成功后把旧 id 的格子迁给新名字并写回', async () => {
    const { items, preferences } = setup({ entries: [fileNode('a.txt')] });
    await expect(items.rename(items.items()[1], 'b.txt')).resolves.toEqual([...DESKTOP, 'b.txt']);
    expect(preferences.set).toHaveBeenCalledWith('desktop:cells', { hd: [0, 0], 'file:b.txt': [0, 1] });
  });

  it('toggleStacks 切换叠放：按种类分组、Macintosh HD 不参与，开关写回偏好', () => {
    const { items, preferences } = setup({ entries: [fileNode('a.txt'), fileNode('b.png')] });
    expect(items.stacks()).toEqual([]);
    items.toggleStacks();
    expect(items.stacksEnabled()).toBe(true);
    expect(items.stacks().map(stack => [stack.kind, stack.ids])).toEqual([
      ['PNG image', ['file:b.png']],
      ['Plain text', ['file:a.txt']]
    ]);
    expect(preferences.set).toHaveBeenCalledExactlyOnceWith('desktop:stacks', true);
    items.toggleStacks();
    expect(items.stacks()).toEqual([]);
  });

  it('setViewOption 更新一项并写回完整偏好', () => {
    const { items, preferences } = setup();
    items.setViewOption('iconSize', 'large');
    expect(items.viewOptions()).toEqual({ iconSize: 'large', gridSpacing: 'default', textSize: 'medium' });
    expect(preferences.set).toHaveBeenCalledExactlyOnceWith('desktop:view-options', {
      iconSize: 'large',
      gridSpacing: 'default',
      textSize: 'medium'
    });
  });

  it('启动时恢复排序、叠放与视图选项的偏好', async () => {
    const { items } = setup({
      entries: [fileNode('a.txt')],
      settings: {
        'desktop:sort': 'size',
        'desktop:stacks': true,
        'desktop:view-options': { iconSize: 'small', gridSpacing: 'wide', textSize: 'large' }
      }
    });
    await settled();
    expect(items.sortCriteria()).toBe('size');
    expect(items.stacksEnabled()).toBe(true);
    expect(items.viewOptions()).toEqual({ iconSize: 'small', gridSpacing: 'wide', textSize: 'large' });
  });
});
