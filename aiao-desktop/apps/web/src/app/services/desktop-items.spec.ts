import { ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { Preferences } from '../data/preferences';
import { DESKTOP, DiskPath, finderPathOf } from '../disk/disk-path';
import { DiskError } from '../disk/disk-store';
import { FsNode } from '../disk/disk-tree';
import { configureServices } from '../testing/angular';
import { fileNode, folderNode } from '../testing/nodes';
import { createWindowManagerStub } from '../testing/stubs';
import { DesktopCell, DesktopItems } from './desktop-items';
import { FileOpener } from './file-opener';
import { FileSystem } from './file-system';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

const CELLS_KEY = 'desktop:cells';

interface Options {
  readonly entries?: readonly FsNode[];
  readonly saved?: unknown;
  readonly preferencesFail?: boolean;
}

function setup({ entries = [], saved, preferencesFail = false }: Options = {}) {
  const desktop = signal<FsNode>(folderNode('Desktop', entries, DESKTOP));
  const root = folderNode('Macintosh HD', [], []);
  const fs = {
    nodeAt: (path: DiskPath) => (path.join('/') === DESKTOP.join('/') ? desktop() : null),
    root: () => root,
    newFolder: vi.fn(async () => 'untitled folder'),
    moveToTrash: vi.fn(async () => undefined)
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
    get: vi.fn(() => stored),
    set: vi.fn(async () => undefined)
  };
  const remote = (next: unknown, keys: readonly string[] = [CELLS_KEY]): void => {
    stored = next;
    external.next(keys);
  };
  configureServices([
    DesktopItems,
    { provide: FileSystem, useValue: fs },
    { provide: WindowManager, useValue: wm },
    { provide: FileOpener, useValue: opener },
    { provide: Toast, useValue: toast },
    { provide: Preferences, useValue: preferences },
    { provide: ErrorHandler, useValue: errors }
  ]);
  return { items: TestBed.inject(DesktopItems), desktop, fs, wm, opener, toast, preferences, root, remote, errors };
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
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('finder', { path: finderPathOf([...DESKTOP, 'Projects']) });
    expect(opener.open).toHaveBeenCalledExactlyOnceWith(file);
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

  it('remove 把条目移进废纸篓', async () => {
    const { items, fs } = setup({ entries: [fileNode('a.txt')] });
    await expect(items.remove('file:a.txt')).resolves.toBe(true);
    expect(fs.moveToTrash).toHaveBeenCalledExactlyOnceWith([...DESKTOP, 'a.txt']);
  });

  it('Macintosh HD 不能移进废纸篓', async () => {
    const { items, fs, toast } = setup();
    await expect(items.remove('hd')).resolves.toBe(false);
    expect(fs.moveToTrash).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('“Macintosh HD” can’t be moved to the Trash.');
  });

  it('不存在的图标、没有磁盘路径的条目同样提示并返回 false', async () => {
    const { items, fs, toast } = setup({ entries: [fileNode('virtual.txt', null)] });
    await expect(items.remove('file:ghost')).resolves.toBe(false);
    await expect(items.remove('file:virtual.txt')).resolves.toBe(false);
    expect(fs.moveToTrash).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledTimes(2);
  });

  it('移进废纸篓失败时提示磁盘给出的原因，返回 false', async () => {
    const { items, fs, toast } = setup({ entries: [fileNode('a.txt')] });
    fs.moveToTrash.mockRejectedValueOnce(new DiskError('EACCES', DESKTOP, 'required by macOS'));
    await expect(items.remove('file:a.txt')).resolves.toBe(false);
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('required by macOS');
  });
});
