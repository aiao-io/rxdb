import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { fileNode, folderNode } from '../testing/nodes';
import { createWindowManagerStub } from '../testing/stubs';
import { AppLauncher } from './app-launcher';
import { ApplicationCatalog, BundleResolution } from './application-catalog';
import { DESKTOP_APPS } from './desktop-apps';
import { FileOpener } from './file-opener';
import { FileSystem } from './file-system';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

function setup(resolution: BundleResolution = { kind: 'unknown' }) {
  const wm = createWindowManagerStub();
  const fs = { noteOpened: vi.fn(), readText: vi.fn(async () => '<plist/>') };
  const toast = { show: vi.fn() };
  const launcher = { activate: vi.fn() };
  const catalog = { resolve: vi.fn(async () => resolution) };
  configureServices([
    FileOpener,
    { provide: DESKTOP_APPS, useValue: testApps() },
    { provide: WindowManager, useValue: wm },
    { provide: FileSystem, useValue: fs },
    { provide: Toast, useValue: toast },
    { provide: AppLauncher, useValue: launcher },
    { provide: ApplicationCatalog, useValue: catalog }
  ]);
  return { opener: TestBed.inject(FileOpener), wm, fs, toast, launcher, catalog };
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

  it('图片、PDF 与影片交给预览', () => {
    const { opener, wm } = setup();
    for (const name of ['a.png', 'b.JPG', 'c.pdf', 'd.mov', 'e.heic']) opener.open(fileNode(name));
    expect(wm.open.mock.calls.map(call => call[0])).toEqual(['preview', 'preview', 'preview', 'preview', 'preview']);
  });

  it('音频文件交给音乐，不带文件参数', () => {
    const { opener, wm } = setup();
    opener.open(fileNode('song.mp3'));
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('music');
  });

  it('没有应用能打开的文件：提示原因，不开窗口', () => {
    const { opener, wm, toast } = setup();
    opener.open(fileNode('archive.zip'));
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('No application can open “archive.zip”');
    expect(wm.open).not.toHaveBeenCalled();
  });

  it('没有磁盘路径的虚拟条目不记入最近使用，但照样打开', () => {
    const { opener, wm, fs } = setup();
    opener.open(fileNode('note.txt', null));
    expect(fs.noteOpened).not.toHaveBeenCalled();
    expect(wm.open).toHaveBeenCalledTimes(1);
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
  it('TextEdit 与预览带上文件，并记入最近使用', () => {
    const { opener, wm, fs, launcher } = setup();
    const node = fileNode('a.png');
    expect(opener.openApp('preview', node)).toBe(true);
    expect(fs.noteOpened).toHaveBeenCalledExactlyOnceWith(node.path);
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('preview', { file: 'a.png', node });
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
