import { Service, inject } from '@angular/core';
import { ApplicationRegistry } from './application-registry';

import { showInfoPanel } from '../components/overlays/info-panel';
import { DESKTOP, finderPathOf } from '../disk/disk-path';
import { DesktopAppId } from './desktop-apps';
import { DesktopItems } from './desktop-items';
import { FileSystem, HOME_PATH, PLACES } from './file-system';
import { FinderPreferences } from './finder-preferences';
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
  getInfo(): void;
  trashSelected(): void;
  copySelected(): void;
  cutSelected(): void;
  paste(): void;
  selectAll(): void;
  setView(view: FinderView): void;
  sidebarVisible(): boolean;
  toggleSidebar(): void;
  togglePathBar(): void;
  goto(place: string): void;
}

export type StandardMenuOverrides = Readonly<Partial<Record<string, readonly MenuEntry[]>>>;

export type GithubTab = 'changes' | 'history';
export type GithubRepositoryMenu = 'new' | 'local' | 'clone' | 'list';
export type GithubExternalTarget =
  'repository' | 'issue' | 'compare' | 'branch' | 'pull-request' | 'report-issue' | 'support' | 'guides' | 'shortcuts';

/** GitHub Desktop 菜单作用的目标，由应用组件提供当前状态与命令。 */
export interface GithubCommands {
  activeTab(): GithubTab;
  hasRepository(): boolean;
  hasRemote(): boolean;
  hasChanges(): boolean;
  isBusy(): boolean;
  openRepositoryMenu(kind: GithubRepositoryMenu): void;
  openLocalRepository(): void;
  openSettings(): void;
  openRepositorySettings(): void;
  openInEditor(): void;
  openInTerminal(): void;
  openBranchMenu(): void;
  focusChangesFilter(): void;
  setTab(tab: GithubTab): void;
  fetch(): void;
  pull(): void;
  push(): void;
  discardAllChanges(): void;
  openExternal(target: GithubExternalTarget): void;
}

const exec = (command: string): void => {
  document.execCommand(command);
};

/** 菜单栏的菜单定义：Apple 菜单、应用菜单、Finder 菜单与各应用通用的标准菜单。 */
@Service({ autoProvided: false })
export class DesktopMenus {
  private readonly apps = inject(ApplicationRegistry).apps;
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);
  private readonly session = inject(Session);
  private readonly system = inject(SystemState);
  private readonly finderPreferences = inject(FinderPreferences);
  private readonly popover = inject(PopoverService);
  private readonly fs = inject(FileSystem);
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
      { id: 'recent', label: 'Recent Items', submenu: this.recentItems() },
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

  /** 「最近项目」子菜单：本次会话打开过的应用，新的在前；没有记录时给一个置灰项。 */
  private recentItems(): readonly MenuEntry[] {
    const items = this.wm.recentApps().flatMap(appId => {
      const app = this.apps()[appId];
      return app ?
          [{ id: `recent-${appId}`, label: app.name, icon: app.icon, run: () => void this.wm.open(appId) }]
        : [];
    });
    return items.length ? items : [{ id: 'recent-none', label: 'No Recent Items', disabled: true }];
  }

  /** 菜单栏上应用名下的那份菜单。 */
  about(name: string): MenuEntry[] {
    return [
      { id: 'a', label: `About ${name}`, run: () => this.wm.open('about') },
      '-',
      { id: 'p', label: 'Settings…', key: '⌘,', run: () => this.wm.open('settings') },
      '-',
      { id: 'h', label: `Hide ${name}`, key: '⌘H', run: () => this.wm.hideFront() },
      { id: 'o', label: 'Hide Others', key: '⌥⌘H', run: () => this.wm.hideOthers() },
      { id: 's', label: 'Show All', run: () => this.wm.showAll() },
      '-',
      { id: 'q', label: `Quit ${name}`, key: '⌘Q', run: () => this.wm.quitFront() }
    ];
  }

  /** GitHub Desktop 的应用菜单，应用专属命令不混入 Apple 系统菜单。 */
  githubApplication(openSettings?: () => void): MenuEntry[] {
    return [
      { id: 'a', label: 'About GitHub Desktop', run: () => this.wm.open('about') },
      '-',
      { id: 'p', label: 'Settings…', key: '⌘,', disabled: !openSettings, run: openSettings },
      { id: 'cli', label: 'Install Command Line Tool', disabled: true },
      { id: 'services', label: 'Services', key: '▸', disabled: true },
      '-',
      { id: 'h', label: 'Hide GitHub Desktop', key: '⌘H', run: () => this.wm.hideFront() },
      { id: 'o', label: 'Hide Others', key: '⌥⌘H', run: () => this.wm.hideOthers() },
      { id: 's', label: 'Show All', run: () => this.wm.showAll() },
      '-',
      { id: 'q', label: 'Quit GitHub Desktop', key: '⌘Q', run: () => this.wm.quitFront() }
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
        { id: 'gi', label: 'Get Info', key: '⌘I', run: () => target.getInfo() },
        { id: 'tr', label: 'Move to Trash', key: '⌘⌫', run: () => target.trashSelected() }
      ]),
      section('Edit', [
        {
          id: 'u',
          label: this.desktopItems.canUndoTrash() ? 'Undo Move to Trash' : 'Undo',
          key: '⌘Z',
          disabled: !this.desktopItems.canUndoTrash(),
          run: () => this.desktopItems.undoTrash()
        },
        { id: 'r', label: 'Redo', key: '⇧⌘Z', disabled: true },
        '-',
        { id: 'x', label: 'Cut', key: '⌘X', run: () => target.cutSelected() },
        { id: 'c', label: 'Copy', key: '⌘C', run: () => target.copySelected() },
        { id: 'v', label: 'Paste', key: '⌘V', run: () => target.paste() },
        '-',
        { id: 'a', label: 'Select All', key: '⌘A', run: () => target.selectAll() }
      ]),
      section('View', [
        { id: 'icons', label: 'as Icons', key: '⌘1', run: () => target.setView('icon') },
        { id: 'listv', label: 'as List', key: '⌘2', run: () => target.setView('list') },
        { id: 'colv', label: 'as Columns', key: '⌘3', run: () => target.setView('column') },
        { id: 'galv', label: 'as Gallery', key: '⌘4', run: () => target.setView('gallery') },
        '-',
        {
          id: 'sb',
          label: target.sidebarVisible() ? 'Hide Sidebar' : 'Show Sidebar',
          key: '⌥⌘S',
          run: () => target.toggleSidebar()
        },
        { id: 'pb', label: 'Hide Path Bar', key: '⌥⌘P', run: () => target.togglePathBar() },
        '-',
        {
          id: 'hidden-files',
          label: 'Show Hidden Files',
          key: '⌃⇧.',
          alternateKey: '⇧⌘.',
          checked: this.finderPreferences.showHiddenFiles(),
          run: () => {
            void this.finderPreferences
              .toggleShowHiddenFiles()
              .catch((error: unknown) => this.toast.show(String(error)));
          }
        }
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
      getInfo: () => {
        /* 没有 Finder 窗口时的 ⌘I：显示桌面（Desktop 文件夹）的简介，与桌面空白处右键一致。 */
        const node = this.fs.get(finderPathOf(DESKTOP));
        if (node) showInfoPanel(this.popover, node);
      },
      trashSelected: none,
      copySelected: none,
      cutSelected: none,
      paste: () => this.desktopItems.paste(),
      selectAll: none,
      setView: none,
      sidebarVisible: () => true,
      toggleSidebar: none,
      togglePathBar: none,
      goto: place => this.wm.open('finder', { path: PLACES[place] ?? HOME_PATH })
    });
  }

  github(target: GithubCommands): MenuSection[] {
    const disabled = (): boolean => !target.hasRepository() || target.isBusy();
    const remoteDisabled = (): boolean => !target.hasRemote() || target.isBusy();
    const external =
      (destination: GithubExternalTarget): (() => void) =>
      () =>
        target.openExternal(destination);

    return this.standard(
      'github',
      {
        'GitHub Desktop': this.githubApplication(() => target.openSettings()),
        File: [
          {
            id: 'new-repository',
            label: 'New Repository…',
            key: '⌘N',
            disabled: target.isBusy(),
            run: () => target.openRepositoryMenu('new')
          },
          '-',
          {
            id: 'add-local-repository',
            label: 'Add Local Repository…',
            key: '⌘O',
            disabled: target.isBusy(),
            run: () => target.openLocalRepository()
          },
          {
            id: 'clone-repository',
            label: 'Clone Repository…',
            key: '⇧⌘O',
            disabled: target.isBusy(),
            run: () => target.openRepositoryMenu('clone')
          },
          '-',
          { id: 'close-window', label: 'Close Window', key: '⌘W', run: () => this.wm.closeFront() }
        ],
        Edit: [
          { id: 'undo', label: 'Undo', key: '⌘Z', run: () => exec('undo') },
          { id: 'redo', label: 'Redo', key: '⇧⌘Z', run: () => exec('redo') },
          '-',
          { id: 'cut', label: 'Cut', key: '⌘X', run: () => exec('cut') },
          { id: 'copy', label: 'Copy', key: '⌘C', run: () => exec('copy') },
          { id: 'paste', label: 'Paste', key: '⌘V', run: () => exec('paste') },
          '-',
          { id: 'select-all', label: 'Select All', key: '⌘A', run: () => exec('selectAll') },
          { id: 'find', label: 'Find…', key: '⌘F', disabled: disabled(), run: () => target.focusChangesFilter() }
        ],
        View: [
          {
            id: 'show-changes',
            label: 'Show Changes',
            key: '⌘1',
            checked: target.activeTab() === 'changes',
            run: () => target.setTab('changes')
          },
          {
            id: 'show-history',
            label: 'Show History',
            key: '⌘2',
            checked: target.activeTab() === 'history',
            run: () => target.setTab('history')
          },
          {
            id: 'show-changes-filter',
            label: 'Show Changes Filter',
            disabled: disabled(),
            run: () => target.focusChangesFilter()
          },
          {
            id: 'show-repository-list',
            label: 'Show Repository List',
            key: '⌘T',
            disabled: target.isBusy(),
            run: () => target.openRepositoryMenu('list')
          },
          {
            id: 'show-branches-list',
            label: 'Show Branches List',
            key: '⌘B',
            disabled: disabled(),
            run: () => target.openBranchMenu()
          },
          '-',
          { id: 'full-screen', label: 'Enter Full Screen', key: '⌃⌘F', run: () => this.wm.zoomFront() },
          { id: 'toolbar', label: 'Show Toolbar', key: '⌥⌘T', checked: true }
        ],
        Repository: [
          { id: 'open-in-editor', label: 'Open in Aiao Code', disabled: disabled(), run: () => target.openInEditor() },
          {
            id: 'open-in-terminal',
            label: 'Open in Terminal',
            key: '⌃`',
            disabled: disabled(),
            run: () => target.openInTerminal()
          },
          {
            id: 'push',
            label: 'Push',
            key: '⌘P',
            disabled: remoteDisabled() || target.hasChanges(),
            run: () => target.push()
          },
          { id: 'pull', label: 'Pull', key: '⇧⌘P', disabled: remoteDisabled(), run: () => target.pull() },
          { id: 'fetch', label: 'Fetch', key: '⇧⌘T', disabled: disabled(), run: () => target.fetch() },
          '-',
          {
            id: 'view-repository-on-github',
            label: 'View on GitHub',
            key: '⇧⌘G',
            disabled: remoteDisabled(),
            run: external('repository')
          },
          {
            id: 'create-issue-on-github',
            label: 'Create Issue on GitHub',
            key: '⌘I',
            disabled: remoteDisabled(),
            run: external('issue')
          },
          '-',
          {
            id: 'show-repository-settings',
            label: 'Repository Settings…',
            disabled: disabled(),
            run: () => target.openRepositorySettings()
          }
        ],
        Branch: [
          {
            id: 'create-branch',
            label: 'New Branch…',
            key: '⇧⌘N',
            disabled: disabled(),
            run: () => target.openBranchMenu()
          },
          '-',
          {
            id: 'discard-all-changes',
            label: 'Discard All Changes…',
            key: '⇧⌘⌫',
            disabled: !target.hasChanges() || target.isBusy(),
            run: () => target.discardAllChanges()
          },
          '-',
          {
            id: 'compare-on-github',
            label: 'Compare on GitHub',
            key: '⇧⌘C',
            disabled: remoteDisabled(),
            run: external('compare')
          },
          {
            id: 'branch-on-github',
            label: 'View Branch on GitHub',
            key: '⌥⌘B',
            disabled: remoteDisabled(),
            run: external('branch')
          },
          {
            id: 'create-pull-request',
            label: 'Create Pull Request',
            key: '⌘R',
            disabled: remoteDisabled(),
            run: external('pull-request')
          }
        ],
        Help: [
          { field: 'Search' },
          {
            id: 'report-issue',
            label: 'Report Issue…',
            run: external('report-issue')
          },
          {
            id: 'contact-support',
            label: 'Contact GitHub Support…',
            run: external('support')
          },
          { id: 'user-guides', label: 'Show User Guides', run: external('guides') },
          { id: 'keyboard-shortcuts', label: 'Show Keyboard Shortcuts', run: external('shortcuts') }
        ]
      },
      ['GitHub Desktop', 'File', 'Edit', 'View', 'Repository', 'Branch', 'Window', 'Help']
    );
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
          label: `${this.apps()[appId].name} Help`,
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
    this.popover.openComponent(
      { load: () => import('../components/menubar/force-quit-panel').then(module => module.ForceQuitPanel) },
      { x: innerWidth / 2 - 140, y: innerHeight / 2 - 140, origin: 'center' }
    );
  }
}
