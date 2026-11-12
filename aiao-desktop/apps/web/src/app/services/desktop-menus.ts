import { Service, inject } from '@angular/core';

import { ForceQuitPanel } from '../components/menubar/force-quit-panel';
import { DESKTOP_APPS, DesktopAppId } from './desktop-apps';
import { DesktopItems } from './desktop-items';
import { HOME_PATH, PLACES } from './file-system';
import { MenuEntry, MenuSection, section } from './menu';
import { PopoverService } from './popover';
import { Session } from './session';
import { SystemState } from './system-state';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

export type FinderView = 'icon' | 'list' | 'column' | 'gallery';

/** Finder 菜单作用的目标：前台 Finder 窗口，或没有窗口时的桌面兜底行为。 */
export interface FinderCommands {
  newFolder(): void;
  openSelected(): void;
  trashSelected(): void;
  setView(view: FinderView): void;
  toggleSidebar(): void;
  togglePathBar(): void;
  goto(place: string): void;
}

export type StandardMenuOverrides = Readonly<Partial<Record<string, readonly MenuEntry[]>>>;

const exec = (command: string): void => {
  document.execCommand(command);
};

/** 菜单栏的菜单定义：Apple 菜单、应用菜单、Finder 菜单与各应用通用的标准菜单。 */
@Service({ autoProvided: false })
export class DesktopMenus {
  private readonly apps = inject(DESKTOP_APPS);
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);
  private readonly session = inject(Session);
  private readonly system = inject(SystemState);
  private readonly popover = inject(PopoverService);
  private readonly desktopItems = inject(DesktopItems);

  apple(): MenuEntry[] {
    return [
      { id: 'about', label: 'About This Mac', run: () => this.wm.open('about') },
      '-',
      { id: 'set', label: 'System Settings…', run: () => this.wm.open('settings') },
      {
        id: 'store',
        label: 'App Store…',
        key: '1 update',
        run: () => this.toast.show('App Store is not part of this build')
      },
      '-',
      { id: 'recent', label: 'Recent Items', key: '▸' },
      '-',
      { id: 'force', label: 'Force Quit…', key: '⌥⌘⎋', run: () => this.forceQuitPanel() },
      '-',
      { id: 'sleep', label: 'Sleep', run: () => this.session.sleepNow() },
      { id: 'restart', label: 'Restart…', run: () => this.session.restart() },
      { id: 'shut', label: 'Shut Down…', run: () => this.session.shutDown() },
      '-',
      { id: 'lock', label: 'Lock Screen', key: '⌃⌘Q', run: () => this.session.lock() },
      { id: 'logout', label: `Log Out ${this.system.user}…`, key: '⇧⌘Q', run: () => this.session.lock() }
    ];
  }

  /** 菜单栏上应用名下的那份菜单。 */
  about(name: string): MenuEntry[] {
    return [
      { id: 'a', label: `About ${name}`, run: () => this.wm.open('about') },
      '-',
      { id: 'p', label: 'Settings…', key: '⌘,', run: () => this.wm.open('settings') },
      '-',
      { id: 'h', label: `Hide ${name}`, key: '⌘H', run: () => this.wm.minimizeFront() },
      { id: 'o', label: 'Hide Others', key: '⌥⌘H', run: () => this.wm.hideOthers() },
      { id: 's', label: 'Show All', run: () => this.wm.showAll() },
      '-',
      { id: 'q', label: `Quit ${name}`, key: '⌘Q', run: () => this.wm.quitFront() }
    ];
  }

  window(): MenuEntry[] {
    return [
      { id: 'min', label: 'Minimize', key: '⌘M', run: () => this.wm.minimizeFront() },
      { id: 'zoo', label: 'Zoom', run: () => this.wm.zoomFront() },
      { id: 'fil', label: 'Fill', key: '⌃⌥⏎', run: () => this.wm.zoomFront() },
      '-',
      { id: 'cyc', label: 'Cycle Through Windows', key: '⌘`', run: () => this.wm.cycle() },
      { id: 'brf', label: 'Bring All to Front', run: () => this.wm.showAll() }
    ];
  }

  finder(target: FinderCommands): MenuSection[] {
    return [
      section('File', [
        { id: 'nw', label: 'New Finder Window', key: '⌘N', run: () => this.wm.open('finder') },
        { id: 'nf', label: 'New Folder', key: '⇧⌘N', run: () => target.newFolder() },
        '-',
        { id: 'op', label: 'Open', key: '⌘O', run: () => target.openSelected() },
        { id: 'cl', label: 'Close Window', key: '⌘W', run: () => this.wm.closeFront() },
        '-',
        { id: 'gi', label: 'Get Info', key: '⌘I', run: () => this.toast.show('Get Info') },
        { id: 'tr', label: 'Move to Trash', key: '⌘⌫', run: () => target.trashSelected() }
      ]),
      section('Edit', [
        { id: 'u', label: 'Undo', key: '⌘Z', disabled: true },
        { id: 'r', label: 'Redo', key: '⇧⌘Z', disabled: true },
        '-',
        { id: 'x', label: 'Cut', key: '⌘X' },
        { id: 'c', label: 'Copy', key: '⌘C' },
        { id: 'v', label: 'Paste', key: '⌘V' },
        '-',
        { id: 'a', label: 'Select All', key: '⌘A' }
      ]),
      section('View', [
        { id: 'icons', label: 'as Icons', key: '⌘1', run: () => target.setView('icon') },
        { id: 'listv', label: 'as List', key: '⌘2', run: () => target.setView('list') },
        { id: 'colv', label: 'as Columns', key: '⌘3', run: () => target.setView('column') },
        { id: 'galv', label: 'as Gallery', key: '⌘4', run: () => target.setView('gallery') },
        '-',
        { id: 'sb', label: 'Hide Sidebar', key: '⌥⌘S', run: () => target.toggleSidebar() },
        { id: 'pb', label: 'Hide Path Bar', key: '⌥⌘P', run: () => target.togglePathBar() }
      ]),
      section('Go', [
        { id: 'g1', label: 'Recents', key: '⇧⌘F', run: () => target.goto('Recents') },
        { id: 'g2', label: 'Documents', key: '⇧⌘O', run: () => target.goto('Documents') },
        { id: 'g3', label: 'Desktop', key: '⇧⌘D', run: () => target.goto('Desktop') },
        { id: 'g4', label: 'Downloads', key: '⌥⌘L', run: () => target.goto('Downloads') },
        { id: 'g5', label: 'Applications', key: '⇧⌘A', run: () => target.goto('Applications') }
      ]),
      section('Window', this.window()),
      section('Help', [
        { field: 'Search' },
        { id: 'h', label: 'macOS Help', key: '⌘?', run: () => this.toast.show('Everything here is one HTML file.') },
        { id: 'n', label: 'New Features in macOS', run: () => this.wm.open('about') }
      ])
    ];
  }

  /** 没有 Finder 窗口时的菜单栏：新建文件夹落到桌面，「前往」新开 Finder。 */
  finderFallback(): MenuSection[] {
    const none = (): void => undefined;
    return this.finder({
      newFolder: () => this.desktopItems.newFolder(),
      openSelected: none,
      trashSelected: none,
      setView: none,
      toggleSidebar: none,
      togglePathBar: none,
      goto: place => this.wm.open('finder', { path: PLACES[place] ?? HOME_PATH })
    });
  }

  /**
   * 每个应用都有 File/Edit/View/Window/Help，应用只覆盖自己特别的部分。
   * `order` 让应用把自己的菜单放到 AppKit 会放的位置（Terminal 用 Shell 代替 File）。
   */
  standard(appId: DesktopAppId, overrides: StandardMenuOverrides = {}, order?: readonly string[]): MenuSection[] {
    const base: Record<string, readonly MenuEntry[] | undefined> = {
      File: [
        { id: 'n', label: 'New Window', key: '⌘N', run: () => this.wm.open(appId, { force: true }) },
        { id: 'w', label: 'Close Window', key: '⌘W', run: () => this.wm.closeFront() }
      ],
      Edit: [
        { id: 'u', label: 'Undo', key: '⌘Z', run: () => exec('undo') },
        { id: 'r', label: 'Redo', key: '⇧⌘Z', run: () => exec('redo') },
        '-',
        { id: 'x', label: 'Cut', key: '⌘X', run: () => exec('cut') },
        { id: 'c', label: 'Copy', key: '⌘C', run: () => exec('copy') },
        { id: 'v', label: 'Paste', key: '⌘V', run: () => exec('paste') },
        '-',
        { id: 'a', label: 'Select All', key: '⌘A', run: () => exec('selectAll') }
      ],
      View: [
        { id: 'f', label: 'Enter Full Screen', key: '⌃⌘F', run: () => this.wm.zoomFront() },
        { id: 't', label: 'Show Toolbar', key: '⌥⌘T', checked: true }
      ],
      Window: this.window(),
      Help: [
        { field: 'Search' },
        {
          id: 'h',
          label: `${this.apps[appId].name} Help`,
          run: () => this.toast.show('No help needed — click things.')
        },
        { id: 'k', label: 'Keyboard Shortcuts', run: () => this.toast.show('⌘Space, ⌘W, ⌘Q, ⌃⌘F all work.') }
      ],
      ...overrides
    };
    return (order ?? Object.keys(base)).flatMap(label => {
      const items = base[label];
      return items ? [section(label, items)] : [];
    });
  }

  private forceQuitPanel(): void {
    this.popover.openComponent(ForceQuitPanel, { x: innerWidth / 2 - 140, y: innerHeight / 2 - 140, origin: 'center' });
  }
}
