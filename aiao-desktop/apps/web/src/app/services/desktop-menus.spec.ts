import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ForceQuitPanel } from '../components/menubar/force-quit-panel';
import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { configureServices } from '../testing/angular';
import { stubViewport } from '../testing/browser';
import { testApps } from '../testing/desktop-apps';
import { FakeDesktopData } from '../testing/fake-desktop-data';
import { createWindowManagerStub } from '../testing/stubs';
import { DESKTOP_APPS } from './desktop-apps';
import { DesktopItems } from './desktop-items';
import {
  DesktopMenus,
  type FinderCommands,
  type GithubCommands,
  type GithubExternalTarget,
  type GithubRepositoryMenu,
  type GithubTab
} from './desktop-menus';
import { HOME_PATH, PLACES } from './file-system';
import { FinderPreferences } from './finder-preferences';
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
  const desktopItems = { newFolder: vi.fn(), canUndoTrash: vi.fn(() => false), undoTrash: vi.fn() };
  configureServices([
    DesktopMenus,
    SystemState,
    FinderPreferences,
    Preferences,
    { provide: DesktopData, useValue: new FakeDesktopData() },
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
  copySelected: vi.fn(),
  cutSelected: vi.fn(),
  paste: vi.fn(),
  selectAll: vi.fn(),
  setView: vi.fn(),
  sidebarVisible: vi.fn(() => true),
  toggleSidebar: vi.fn(),
  togglePathBar: vi.fn(),
  goto: vi.fn()
});

const githubTarget = (
  overrides: Partial<{
    activeTab: GithubTab;
    hasRepository: boolean;
    hasRemote: boolean;
    hasChanges: boolean;
    isBusy: boolean;
  }> = {}
) =>
  ({
    activeTab: vi.fn((): GithubTab => overrides.activeTab ?? 'changes'),
    hasRepository: vi.fn(() => overrides.hasRepository ?? true),
    hasRemote: vi.fn(() => overrides.hasRemote ?? true),
    hasChanges: vi.fn(() => overrides.hasChanges ?? false),
    isBusy: vi.fn(() => overrides.isBusy ?? false),
    openRepositoryMenu: vi.fn((kind: GithubRepositoryMenu): void => {
      void kind;
    }),
    openInEditor: vi.fn(),
    openInTerminal: vi.fn(),
    openLocalRepository: vi.fn((): void => undefined),
    openRepositorySettings: vi.fn(),
    openBranchMenu: vi.fn((): void => undefined),
    focusChangesFilter: vi.fn((): void => undefined),
    setTab: vi.fn((tab: GithubTab): void => {
      void tab;
    }),
    fetch: vi.fn((): void => undefined),
    pull: vi.fn((): void => undefined),
    push: vi.fn((): void => undefined),
    discardAllChanges: vi.fn((): void => undefined),
    openExternal: vi.fn((target: GithubExternalTarget): void => {
      void target;
    })
  }) satisfies GithubCommands;

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
      label: 'Log Out Steve Jobs…'
    });
  });

  it('强制退出按需加载面板，居中显示在视口中央', async () => {
    const { menus, popover } = setup();
    click(menus.apple(), 'force');
    const [component, options] = popover.openComponent.mock.calls[0] ?? [];
    expect(component).toEqual({ load: expect.any(Function) });
    await expect(component.load()).resolves.toBe(ForceQuitPanel);
    expect(options).toEqual({ x: 360, y: 160, origin: 'center' });
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

  it('GitHub Desktop 应用菜单包含应用命令，未提供平台能力的项目明确置灰', () => {
    const { menus, wm } = setup();
    const about = menus.githubApplication();
    expect(about.filter(isMenuCommand).map(item => item.label)).toEqual([
      'About GitHub Desktop',
      'Settings…',
      'Install Command Line Tool',
      'Services',
      'Hide GitHub Desktop',
      'Hide Others',
      'Show All',
      'Quit GitHub Desktop'
    ]);
    expect(
      about
        .filter(isMenuCommand)
        .filter(item => item.disabled)
        .map(item => item.id)
    ).toEqual(['cli', 'services']);
    click(about, 'a');
    click(about, 'p');
    click(about, 'h');
    click(about, 'o');
    click(about, 's');
    click(about, 'q');
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

  it('Edit：有移入废纸篓记录才启用撤销，重做仍不可用', () => {
    const { menus, desktopItems } = setup();
    const edit = sectionOf(menus.finder(finderTarget()), 'Edit').filter(isMenuCommand);
    expect(edit.filter(item => item.disabled).map(item => item.label)).toEqual(['Undo', 'Redo']);
    desktopItems.canUndoTrash.mockReturnValue(true);
    const undoEdit = sectionOf(menus.finderFallback(), 'Edit');
    expect(undoEdit.filter(isMenuCommand).find(item => item.id === 'u')).toMatchObject({
      label: 'Undo Move to Trash',
      disabled: false
    });
    click(undoEdit, 'u');
    expect(desktopItems.undoTrash).toHaveBeenCalledOnce();
  });

  it('View：切换四种视图，显示或隐藏侧栏与路径栏', () => {
    const { menus } = setup();
    const target = finderTarget();
    const view = sectionOf(menus.finder(target), 'View');
    for (const id of ['icons', 'listv', 'colv', 'galv', 'sb', 'pb']) click(view, id);
    expect(vi.mocked(target.setView).mock.calls).toEqual([['icon'], ['list'], ['column'], ['gallery']]);
    expect(target.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(view.filter(isMenuCommand).find(item => item.id === 'sb')?.label).toBe('Hide Sidebar');
    vi.mocked(target.sidebarVisible).mockReturnValue(false);
    const updated = sectionOf(menus.finder(target), 'View');
    expect(updated.filter(isMenuCommand).find(item => item.id === 'sb')?.label).toBe('Show Sidebar');
    expect(target.togglePathBar).toHaveBeenCalledTimes(1);
  });

  it('View：隐藏文件开关由所有 Finder 窗口共用，默认关闭', async () => {
    const { menus } = setup();
    const firstView = sectionOf(menus.finder(finderTarget()), 'View');
    const hiddenFiles = (entries: readonly MenuEntry[]) =>
      entries.filter(isMenuCommand).find(item => item.id === 'hidden-files');
    expect(hiddenFiles(firstView)).toMatchObject({
      label: 'Show Hidden Files',
      key: '⌃⇧.',
      alternateKey: '⇧⌘.',
      checked: false
    });

    click(firstView, 'hidden-files');
    await vi.waitFor(() => expect(TestBed.inject(FinderPreferences).showHiddenFiles()).toBe(true));
    const otherView = sectionOf(menus.finder(finderTarget()), 'View');
    expect(hiddenFiles(otherView)?.checked).toBe(true);

    click(otherView, 'hidden-files');
    await vi.waitFor(() => expect(hiddenFiles(sectionOf(menus.finderFallback(), 'View'))?.checked).toBe(false));
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

describe('DesktopMenus GitHub Desktop 菜单', () => {
  it('按 macOS 应用菜单顺序提供 File、Edit、View、Repository、Branch、Window、Help', () => {
    const { menus } = setup();
    expect(menus.github(githubTarget()).map(item => item.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Repository',
      'Branch',
      'Window',
      'Help'
    ]);
  });

  it('把仓库、分支、同步与外部 GitHub 操作交给 GitHub 应用', () => {
    const { menus } = setup();
    const target = githubTarget({ hasChanges: true });
    const sections = menus.github(target);
    click(sectionOf(sections, 'File'), 'new-repository');
    click(sectionOf(sections, 'File'), 'add-local-repository');
    click(sectionOf(sections, 'File'), 'clone-repository');
    click(sectionOf(sections, 'Edit'), 'find');
    click(sectionOf(sections, 'View'), 'show-history');
    click(sectionOf(sections, 'View'), 'show-changes-filter');
    click(sectionOf(sections, 'View'), 'show-repository-list');
    click(sectionOf(sections, 'View'), 'show-branches-list');
    click(sectionOf(sections, 'Repository'), 'open-in-terminal');
    click(sectionOf(sections, 'Repository'), 'fetch');
    click(sectionOf(sections, 'Repository'), 'pull');
    click(sectionOf(sections, 'Repository'), 'view-repository-on-github');
    click(sectionOf(sections, 'Repository'), 'show-repository-settings');
    click(sectionOf(sections, 'Branch'), 'create-branch');
    click(sectionOf(sections, 'Branch'), 'discard-all-changes');
    click(sectionOf(sections, 'Help'), 'keyboard-shortcuts');
    expect(target.openRepositoryMenu.mock.calls).toEqual([['new'], ['clone'], ['list']]);
    expect(target.openLocalRepository).toHaveBeenCalledTimes(1);
    expect(target.openRepositorySettings).toHaveBeenCalledOnce();
    expect(target.setTab).toHaveBeenCalledExactlyOnceWith('history');
    expect(target.focusChangesFilter).toHaveBeenCalledTimes(2);
    expect(target.openBranchMenu).toHaveBeenCalledTimes(2);
    expect(target.openInTerminal).toHaveBeenCalledOnce();
    expect(target.fetch).toHaveBeenCalledTimes(1);
    expect(target.pull).toHaveBeenCalledTimes(1);
    expect(target.openExternal).toHaveBeenCalledWith('repository');
    expect(target.discardAllChanges).toHaveBeenCalledTimes(1);
    expect(target.openExternal).toHaveBeenCalledWith('shortcuts');
  });

  it('未设置远端的本地仓库也可打开仓库设置', () => {
    const { menus } = setup();
    const target = githubTarget({ hasRemote: false });
    expect(sectionOf(menus.github(target), 'Repository')).toContainEqual(
      expect.objectContaining({ id: 'show-repository-settings', label: 'Repository Settings…', disabled: false })
    );
  });

  it('没有仓库或正在执行任务时置灰依赖当前状态的命令', () => {
    const { menus } = setup();
    const target = githubTarget({ hasRepository: false, hasRemote: false, hasChanges: false, isBusy: true });
    const sections = menus.github(target);
    for (const [sectionName, id] of [
      ['Edit', 'find'],
      ['View', 'show-changes-filter'],
      ['View', 'show-branches-list'],
      ['Repository', 'open-in-terminal'],
      ['Repository', 'push'],
      ['Repository', 'pull'],
      ['Repository', 'fetch'],
      ['Repository', 'show-repository-settings'],
      ['Branch', 'create-branch'],
      ['Branch', 'discard-all-changes'],
      ['Branch', 'create-pull-request']
    ] as const) {
      const entry = sectionOf(sections, sectionName).find(item => isMenuCommand(item) && item.id === id);
      expect(entry).toMatchObject({ disabled: true });
    }
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
