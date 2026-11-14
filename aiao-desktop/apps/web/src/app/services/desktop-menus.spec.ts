import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ForceQuitPanel } from '../components/menubar/force-quit-panel';
import { configureServices } from '../testing/angular';
import { stubViewport } from '../testing/browser';
import { testApps } from '../testing/desktop-apps';
import { createWindowManagerStub } from '../testing/stubs';
import { DESKTOP_APPS } from './desktop-apps';
import { DesktopItems } from './desktop-items';
import { DesktopMenus, FinderCommands } from './desktop-menus';
import { HOME_PATH, PLACES } from './file-system';
import { MenuEntry, MenuSection, isMenuCommand } from './menu';
import { PopoverService } from './popover';
import { Session } from './session';
import { SystemState } from './system-state';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

function setup() {
  stubViewport(1000, 600);
  const wm = createWindowManagerStub();
  const toast = { show: vi.fn() };
  const session = { sleepNow: vi.fn(), restart: vi.fn(), shutDown: vi.fn(), lock: vi.fn() };
  const popover = { openComponent: vi.fn() };
  const desktopItems = { newFolder: vi.fn() };
  configureServices([
    DesktopMenus,
    SystemState,
    { provide: DESKTOP_APPS, useValue: testApps() },
    { provide: WindowManager, useValue: wm },
    { provide: Toast, useValue: toast },
    { provide: Session, useValue: session },
    { provide: PopoverService, useValue: popover },
    { provide: DesktopItems, useValue: desktopItems }
  ]);
  return { menus: TestBed.inject(DesktopMenus), wm, toast, session, popover, desktopItems };
}

/** 按 id 点击菜单项。 */
function click(entries: readonly MenuEntry[], id: string): void {
  const entry = entries.find(item => isMenuCommand(item) && item.id === id);
  if (!entry || !isMenuCommand(entry)) throw new Error(`菜单里没有 ${id}`);
  entry.run?.();
}

const sectionOf = (sections: readonly MenuSection[], label: string): readonly MenuEntry[] => {
  const found = sections.find(item => item.label === label);
  if (!found) throw new Error(`没有 ${label} 菜单`);
  return found.items;
};

const finderTarget = (): FinderCommands => ({
  newFolder: vi.fn(),
  openSelected: vi.fn(),
  trashSelected: vi.fn(),
  setView: vi.fn(),
  toggleSidebar: vi.fn(),
  togglePathBar: vi.fn(),
  goto: vi.fn()
});

describe('DesktopMenus 苹果菜单', () => {
  it('关于本机、系统设置交给窗口管理器；App Store 只提示', () => {
    const { menus, wm, toast } = setup();
    const apple = menus.apple();
    click(apple, 'about');
    click(apple, 'set');
    expect(wm.open.mock.calls).toEqual([['about'], ['settings']]);
    click(apple, 'store');
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('App Store is not part of this build');
  });

  it('睡眠、重启、关机与锁屏交给会话；注销也是回到锁屏，标题带用户名', () => {
    const { menus, session } = setup();
    const apple = menus.apple();
    click(apple, 'sleep');
    click(apple, 'restart');
    click(apple, 'shut');
    click(apple, 'lock');
    click(apple, 'logout');
    expect(session.sleepNow).toHaveBeenCalledTimes(1);
    expect(session.restart).toHaveBeenCalledTimes(1);
    expect(session.shutDown).toHaveBeenCalledTimes(1);
    expect(session.lock).toHaveBeenCalledTimes(2);
    expect(apple.find(item => isMenuCommand(item) && item.id === 'logout')).toMatchObject({
      label: 'Log Out Prasenjit…'
    });
  });

  it('强制退出打开面板，居中显示在视口中央', () => {
    const { menus, popover } = setup();
    click(menus.apple(), 'force');
    expect(popover.openComponent).toHaveBeenCalledExactlyOnceWith(ForceQuitPanel, { x: 360, y: 160, origin: 'center' });
  });

  it('「最近项目」只是占位，点它什么也不发生', () => {
    const { menus, wm, toast } = setup();
    click(menus.apple(), 'recent');
    expect(wm.open).not.toHaveBeenCalled();
    expect(toast.show).not.toHaveBeenCalled();
  });
});

describe('DesktopMenus 应用菜单与窗口菜单', () => {
  it('应用菜单：关于、设置，以及隐藏、隐藏其他、全部显示、退出都交给窗口管理器', () => {
    const { menus, wm } = setup();
    const about = menus.about('Notes');
    expect(about.filter(isMenuCommand).map(item => item.label)).toEqual([
      'About Notes',
      'Settings…',
      'Hide Notes',
      'Hide Others',
      'Show All',
      'Quit Notes'
    ]);
    for (const id of ['a', 'p', 'h', 'o', 's', 'q']) click(about, id);
    expect(wm.open.mock.calls).toEqual([['about'], ['settings']]);
    expect(wm.minimizeFront).toHaveBeenCalledTimes(1);
    expect(wm.hideOthers).toHaveBeenCalledTimes(1);
    expect(wm.showAll).toHaveBeenCalledTimes(1);
    expect(wm.quitFront).toHaveBeenCalledTimes(1);
  });

  it('窗口菜单：最小化、缩放、填充、切换窗口、全部前置', () => {
    const { menus, wm } = setup();
    const windowMenu = menus.window();
    for (const id of ['min', 'zoo', 'fil', 'cyc', 'brf']) click(windowMenu, id);
    expect(wm.minimizeFront).toHaveBeenCalledTimes(1);
    expect(wm.zoomFront).toHaveBeenCalledTimes(2);
    expect(wm.cycle).toHaveBeenCalledTimes(1);
    expect(wm.showAll).toHaveBeenCalledTimes(1);
  });
});

describe('DesktopMenus Finder 菜单', () => {
  it('六个菜单依次是 File、Edit、View、Go、Window、Help', () => {
    const { menus } = setup();
    expect(menus.finder(finderTarget()).map(item => item.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Go',
      'Window',
      'Help'
    ]);
  });

  it('File：新建窗口交给窗口管理器，其余命令作用于传入的 Finder 目标', () => {
    const { menus, wm, toast } = setup();
    const target = finderTarget();
    const file = sectionOf(menus.finder(target), 'File');
    for (const id of ['nw', 'nf', 'op', 'cl', 'gi', 'tr']) click(file, id);
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('finder');
    expect(target.newFolder).toHaveBeenCalledTimes(1);
    expect(target.openSelected).toHaveBeenCalledTimes(1);
    expect(target.trashSelected).toHaveBeenCalledTimes(1);
    expect(wm.closeFront).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Get Info');
  });

  it('Edit：撤销与重做不可用', () => {
    const { menus } = setup();
    const edit = sectionOf(menus.finder(finderTarget()), 'Edit').filter(isMenuCommand);
    expect(edit.filter(item => item.disabled).map(item => item.label)).toEqual(['Undo', 'Redo']);
  });

  it('View：切换四种视图，显示或隐藏侧栏与路径栏', () => {
    const { menus } = setup();
    const target = finderTarget();
    const view = sectionOf(menus.finder(target), 'View');
    for (const id of ['icons', 'listv', 'colv', 'galv', 'sb', 'pb']) click(view, id);
    expect(vi.mocked(target.setView).mock.calls).toEqual([['icon'], ['list'], ['column'], ['gallery']]);
    expect(target.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(target.togglePathBar).toHaveBeenCalledTimes(1);
  });

  it('Go：前往最近使用、文稿、桌面、下载与应用程序', () => {
    const { menus } = setup();
    const target = finderTarget();
    const go = sectionOf(menus.finder(target), 'Go');
    for (const id of ['g1', 'g2', 'g3', 'g4', 'g5']) click(go, id);
    expect(vi.mocked(target.goto).mock.calls).toEqual([
      ['Recents'],
      ['Documents'],
      ['Desktop'],
      ['Downloads'],
      ['Applications']
    ]);
  });

  it('Window 菜单与独立的窗口菜单一致；Help 带搜索框', () => {
    const { menus, toast, wm } = setup();
    const sections = menus.finder(finderTarget());
    expect(sectionOf(sections, 'Window').map(item => (isMenuCommand(item) ? item.id : item))).toEqual(
      menus.window().map(item => (isMenuCommand(item) ? item.id : item))
    );
    const help = sectionOf(sections, 'Help');
    expect(help[0]).toEqual({ field: 'Search' });
    click(help, 'h');
    click(help, 'n');
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Everything here is one HTML file.');
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('about');
  });
});

describe('DesktopMenus 没有 Finder 窗口时的菜单', () => {
  it('新建文件夹落到桌面，其余针对窗口的命令什么也不做', () => {
    const { menus, desktopItems, wm } = setup();
    const sections = menus.finderFallback();
    click(sectionOf(sections, 'File'), 'nf');
    expect(desktopItems.newFolder).toHaveBeenCalledTimes(1);
    for (const id of ['op', 'tr']) click(sectionOf(sections, 'File'), id);
    for (const id of ['icons', 'listv', 'colv', 'galv', 'sb', 'pb']) click(sectionOf(sections, 'View'), id);
    expect(wm.open).not.toHaveBeenCalled();
  });

  it('「前往」新开 Finder 窗口到对应位置；没有磁盘位置的入口回到主目录', () => {
    const { menus, wm } = setup();
    const go = sectionOf(menus.finderFallback(), 'Go');
    click(go, 'g2');
    click(go, 'g1');
    expect(wm.open.mock.calls).toEqual([
      ['finder', { path: PLACES['Documents'] }],
      ['finder', { path: HOME_PATH }]
    ]);
  });
});

describe('DesktopMenus 标准菜单', () => {
  const labels = (sections: readonly MenuSection[]): string[] => sections.map(item => item.label);

  it('默认给出 File、Edit、View、Window、Help 五个菜单', () => {
    const { menus } = setup();
    expect(labels(menus.standard('notes'))).toEqual(['File', 'Edit', 'View', 'Window', 'Help']);
  });

  it('File：新建窗口会强制新开该应用的窗口，关闭窗口关最前面的', () => {
    const { menus, wm } = setup();
    const file = sectionOf(menus.standard('notes'), 'File');
    click(file, 'n');
    click(file, 'w');
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('notes', { force: true });
    expect(wm.closeFront).toHaveBeenCalledTimes(1);
  });

  it('Edit：撤销、重做、剪切、复制、粘贴、全选都转成文档的编辑命令', () => {
    const { menus } = setup();
    const execCommand = vi.fn();
    vi.stubGlobal('document', { execCommand });
    const edit = sectionOf(menus.standard('notes'), 'Edit');
    for (const id of ['u', 'r', 'x', 'c', 'v', 'a']) click(edit, id);
    expect(execCommand.mock.calls).toEqual([['undo'], ['redo'], ['cut'], ['copy'], ['paste'], ['selectAll']]);
  });

  it('View：全屏就是缩放最前窗口；Help 带应用名并提示', () => {
    const { menus, wm, toast } = setup();
    const sections = menus.standard('notes');
    click(sectionOf(sections, 'View'), 'f');
    expect(wm.zoomFront).toHaveBeenCalledTimes(1);
    const help = sectionOf(sections, 'Help');
    expect(help.find(item => isMenuCommand(item) && item.id === 'h')).toMatchObject({ label: 'Notes Help' });
    click(help, 'h');
    click(help, 'k');
    expect(toast.show.mock.calls).toEqual([['No help needed — click things.'], ['⌘Space, ⌘W, ⌘Q, ⌃⌘F all work.']]);
  });

  it('应用可以覆盖其中某个菜单，也可以追加自己的菜单', () => {
    const { menus } = setup();
    const custom: MenuEntry[] = [{ id: 'x', label: 'Custom' }];
    const sections = menus.standard('notes', { File: custom, Format: [{ id: 'f', label: 'Font' }] });
    expect(sectionOf(sections, 'File')).toBe(custom);
    expect(labels(sections)).toEqual(['File', 'Edit', 'View', 'Window', 'Help', 'Format']);
  });

  it('order 决定菜单顺序，也能带上追加的菜单；排序里没有内容的菜单被丢掉', () => {
    const { menus } = setup();
    const sections = menus.standard('terminal', { Shell: [{ id: 's', label: 'New Tab' }], File: undefined }, [
      'Shell',
      'Edit',
      'File',
      'Window',
      'Help'
    ]);
    expect(labels(sections)).toEqual(['Shell', 'Edit', 'Window', 'Help']);
  });
});
