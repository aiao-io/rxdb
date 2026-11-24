import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { Preferences } from '../data/preferences';
import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { fileNode, folderNode } from '../testing/nodes';
import { createWindowManagerStub } from '../testing/stubs';
import { AppLauncher } from './app-launcher';
import { ApplicationCatalog, BundleResolution } from './application-catalog';
import { DESKTOP_APPS } from './desktop-apps';
import { FileOpener, OPEN_WITH_KEY } from './file-opener';
import { FileSystem } from './file-system';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

function setup(resolution: BundleResolution = { kind: 'unknown' }, associations: Record<string, string> = {}) {
  const wm = createWindowManagerStub();
  const fs = { noteOpened: vi.fn(), readText: vi.fn(async () => '<plist/>') };
  const toast = { show: vi.fn() };
  const launcher = { activate: vi.fn() };
  const catalog = { resolve: vi.fn(async () => resolution) };
  const preferences = {
    get: vi.fn((key: string) => (key === OPEN_WITH_KEY && Object.keys(associations).length ? associations : undefined)),
    update: vi.fn(async (_key: string, _guard: (value: unknown) => boolean, updater: (current: unknown) => unknown) =>
      updater(associations)
    )
  };
  configureServices([
    FileOpener,
    { provide: DESKTOP_APPS, useValue: testApps() },
    { provide: WindowManager, useValue: wm },
    { provide: FileSystem, useValue: fs },
    { provide: Toast, useValue: toast },
    { provide: AppLauncher, useValue: launcher },
    { provide: ApplicationCatalog, useValue: catalog },
    { provide: Preferences, useValue: preferences }
  ]);
  return { opener: TestBed.inject(FileOpener), wm, fs, toast, launcher, catalog, preferences };
}

/** `.app` 包的打开是异步的（要读 Info.plist），等它落定。 */
const settled = (): Promise<void> => new Promise(resolve => setTimeout(resolve));

describe('FileOpener 按扩展名打开文件', () => {
  it('文本类文件交给 TextEdit，并记入「最近使用」', () => {
    const { opener, wm, fs } = setup();
    const node = fileNode('todo.md');
    opener.open(node);
    expect(fs.noteOpened).toHaveBeenCalledExactlyOnceWith(node.path);
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('textedit', { file: 'todo.md', node });
  });

  it('没有扩展名的文件也按文本处理', () => {
    const { opener, wm } = setup();
    opener.open(fileNode('README'));
    expect(wm.open).toHaveBeenCalledWith('textedit', expect.objectContaining({ file: 'README' }));
  });

  it('html 文件默认交给 Safari（与 macOS 一致），TextEdit 仍可显式指定', () => {
    const { opener, wm } = setup();
    const node = fileNode('page.html');
    opener.open(node);
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('safari', { file: 'page.html', node });
  });

  it('图片、PDF 与影片交给预览', () => {
    const { opener, wm } = setup();
    for (const name of ['a.png', 'b.JPG', 'c.pdf', 'd.mov', 'e.heic']) opener.open(fileNode(name));
    expect(wm.open.mock.calls.map(call => call[0])).toEqual(['preview', 'preview', 'preview', 'preview', 'preview']);
  });

  it('音频文件交给音乐，不带文件参数，也不进「最近使用」（音乐不播放文件）', () => {
    const { opener, wm, fs } = setup();
    opener.open(fileNode('song.mp3'));
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('music');
    expect(fs.noteOpened).not.toHaveBeenCalled();
  });

  it('没有应用能打开的文件：提示原因，不开窗口，也不进「最近使用」', () => {
    const { opener, wm, toast, fs } = setup();
    opener.open(fileNode('archive.zip'));
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('No application can open “archive.zip”');
    expect(wm.open).not.toHaveBeenCalled();
    expect(fs.noteOpened).not.toHaveBeenCalled();
  });

  it('没有磁盘路径的虚拟条目不记入最近使用，但照样打开', () => {
    const { opener, wm, fs } = setup();
    opener.open(fileNode('note.txt', null));
    expect(fs.noteOpened).not.toHaveBeenCalled();
    expect(wm.open).toHaveBeenCalledTimes(1);
  });
});

describe('FileOpener 打开方式关联（D-28）', () => {
  it('存过的关联覆盖内置默认：html 关联到 TextEdit 后双击走 TextEdit', () => {
    const { opener, wm } = setup({ kind: 'unknown' }, { html: 'textedit' });
    const node = fileNode('page.html');
    opener.open(node);
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('textedit', { file: 'page.html', node });
  });

  it('关联的应用不在该类文件的候选中时忽略，回到内置默认', () => {
    const { opener, wm } = setup({ kind: 'unknown' }, { html: 'preview' });
    opener.open(fileNode('page.html'));
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('safari', expect.objectContaining({ file: 'page.html' }));
  });

  it('setDefaultApp 把应用写进关联键，保留其他扩展名的既有关联', async () => {
    const { opener, preferences } = setup({ kind: 'unknown' }, { css: 'textedit' });
    const node = fileNode('page.html');
    await opener.setDefaultApp(node, 'textedit');
    expect(preferences.update).toHaveBeenCalledExactlyOnceWith(
      OPEN_WITH_KEY,
      expect.any(Function),
      expect.any(Function)
    );
    const updater = preferences.update.mock.calls[0][2] as (current: unknown) => unknown;
    expect(updater({ css: 'textedit' })).toEqual({ css: 'textedit', html: 'textedit' });
  });

  it('setDefaultApp 拒绝不能接收该类文件的应用', async () => {
    const { opener } = setup();
    await expect(opener.setDefaultApp(fileNode('page.html'), 'preview')).rejects.toThrow(
      '“Preview” can’t open page.html files.'
    );
    await expect(opener.setDefaultApp(fileNode('note.txt'), 'safari')).rejects.toThrow(
      '“Safari” can’t open note.txt files.'
    );
  });
});

describe('FileOpener 打开 .app 程序包', () => {
  it('包经应用目录服务解析出应用 id，再由启动器激活；不记入最近使用，也不走扩展名分派', async () => {
    const { opener, launcher, catalog, fs, wm } = setup({ kind: 'app', id: 'calculator' });
    const node = folderNode('Calculator.app', [], ['Applications', 'Calculator.app']);
    opener.open(node);
    await settled();

    expect(catalog.resolve).toHaveBeenCalledExactlyOnceWith(node, expect.any(Function));
    expect(launcher.activate).toHaveBeenCalledExactlyOnceWith('calculator');
    expect(fs.noteOpened).not.toHaveBeenCalled();
    expect(wm.open).not.toHaveBeenCalled();
  });

  it('读 Info.plist 的函数交给 FileSystem.readText（复制到别处的包靠它认标识）', async () => {
    const { opener, catalog, fs } = setup({ kind: 'app', id: 'notes' });
    opener.open(fileNode('Notes.app'));
    await settled();

    const read = (catalog.resolve.mock.calls[0] as unknown as [unknown, (path: string[]) => Promise<string>])[1];
    await expect(read(['Users', 'x', 'Notes.app', 'Contents', 'Info.plist'])).resolves.toBe('<plist/>');
    expect(fs.readText).toHaveBeenCalledWith(['Users', 'x', 'Notes.app', 'Contents', 'Info.plist']);
  });

  it('应用已下线：提示「应用已下线」，带包里写的名字，不启动任何应用', async () => {
    const { opener, toast, launcher } = setup({ kind: 'offline', name: 'Retired App' });
    opener.open(fileNode('Retired.app'));
    await settled();

    expect(toast.show).toHaveBeenCalledExactlyOnceWith('The application “Retired App” is no longer available.');
    expect(launcher.activate).not.toHaveBeenCalled();
  });

  it('不是桌面认识的包：提示这台 Mac 上打不开，用的是节点的文件名', async () => {
    const { opener, toast, launcher } = setup({ kind: 'unknown' });
    opener.open(fileNode('Ghost.app'));
    await settled();

    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Ghost.app cannot open on this Mac.');
    expect(launcher.activate).not.toHaveBeenCalled();
  });
});

describe('FileOpener.openApp 按应用 id 打开（终端的 open -a / -b）', () => {
  it('TextEdit、预览与 Safari 带上文件，并记入最近使用', () => {
    const { opener, wm, fs, launcher } = setup();
    const node = fileNode('a.png');
    expect(opener.openApp('preview', node)).toBe(true);
    expect(fs.noteOpened).toHaveBeenCalledExactlyOnceWith(node.path);
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('preview', { file: 'a.png', node });
    const html = fileNode('page.html');
    expect(opener.openApp('safari', html)).toBe(true);
    expect(wm.open).toHaveBeenLastCalledWith('safari', { file: 'page.html', node: html });
    expect(launcher.activate).not.toHaveBeenCalled();
  });

  it('没有路径的节点不记入最近使用', () => {
    const { opener, wm, fs } = setup();
    expect(opener.openApp('textedit', fileNode('virtual.txt', null))).toBe(true);
    expect(fs.noteOpened).not.toHaveBeenCalled();
    expect(wm.open).toHaveBeenCalledTimes(1);
  });

  it('其他应用只是启动（和 Dock 点击一样：已开则调到前台）；没有文件时也只是启动', () => {
    const { opener, launcher, wm } = setup();
    expect(opener.openApp('music', fileNode('a.png'))).toBe(true);
    expect(opener.openApp('textedit', null)).toBe(true);
    expect(launcher.activate.mock.calls).toEqual([['music'], ['textedit']]);
    expect(wm.open).not.toHaveBeenCalled();
  });

  it('不认识的 id、或系统入口（启动台、废纸篓）没有 .app 身份：提示并返回 false', () => {
    const { opener, launcher, toast, wm } = setup();
    expect(opener.openApp('nope', null)).toBe(false);
    expect(opener.openApp('launchpad', null)).toBe(false);
    expect(toast.show.mock.calls).toEqual([
      ['Unable to find application “nope”'],
      ['Unable to find application “launchpad”']
    ]);
    expect(launcher.activate).not.toHaveBeenCalled();
    expect(wm.open).not.toHaveBeenCalled();
  });
});

describe('Open With 应用选择', () => {
  it('只列出能够接收当前文件的应用，默认应用排第一；不把文件夹和程序包伪装成文档', () => {
    const { opener } = setup();
    expect(opener.choices(fileNode('note.txt'))).toEqual([{ id: 'textedit', name: 'TextEdit' }]);
    expect(opener.choices(fileNode('page.html'))).toEqual([
      { id: 'safari', name: 'Safari' },
      { id: 'textedit', name: 'TextEdit' }
    ]);
    expect(opener.choices(fileNode('image.png'))).toEqual([{ id: 'preview', name: 'Preview' }]);
    expect(opener.choices(fileNode('archive.zip'))).toEqual([]);
    expect(opener.choices(folderNode('project', []))).toEqual([]);
    expect(opener.choices(fileNode('Safari.app'))).toEqual([]);
  });

  it('存过关联后默认应用排第一：html 关联到 TextEdit', () => {
    const { opener } = setup({ kind: 'unknown' }, { html: 'textedit' });
    expect(opener.choices(fileNode('page.html'))).toEqual([
      { id: 'textedit', name: 'TextEdit' },
      { id: 'safari', name: 'Safari' }
    ]);
  });
});
