import { I18N } from '@aiao/rxdb-i18n-angular';
import { Service, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApplicationRegistry } from './application-registry';

import { FinderClipboard } from '../apps/finder/finder-clipboard';
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
  /** 当前目录是不是废纸篓（File 菜单据此在「移到废纸篓」与「清倒废纸篓」之间切换）。 */
  inTrash(): boolean;
  emptyTrash(): void;
  /** 聚焦工具栏的搜索框（⌘F）。 */
  focusSearch(): void;
  /** 「前往文件夹…」：弹路径输入，回车后前往（⇧⌘G）。 */
  gotoFolder(): void;
  /** 「查看选项」面板：图标大小、网格间距、文字大小与扩展名开关（⌘J）。 */
  showViewOptions(): void;
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
  private readonly clipboard = inject(FinderClipboard);
  private readonly i18nRuntime = inject(I18N);
  private readonly locale = toSignal(this.i18nRuntime.locale$, { requireSync: true });
  /** 菜单标签翻译：先读 locale 信号注册依赖，语言切换时外层 computed 重建菜单。 */
  private readonly t = (key: string, params: Record<string, unknown> = {}): string => {
    this.locale();
    return this.i18nRuntime.t(key, params);
  };

  apple(): MenuEntry[] {
    return [
      { id: 'about', label: this.t('shell.menu.aboutThisMac'), run: () => this.wm.open('about') },
      '-',
      { id: 'set', label: this.t('shell.menu.systemSettings'), run: () => this.wm.open('settings') },
      {
        id: 'store',
        label: this.t('shell.menu.appStore'),
        key: this.t('shell.menu.oneUpdate'),
        run: () => this.toast.show('shell.menu.appStoreMissing')
      },
      '-',
      { id: 'recent', label: this.t('shell.menu.recentItems'), submenu: this.recentItems() },
      '-',
      { id: 'force', label: this.t('shell.menu.forceQuit'), key: '⌥⌘⎋', run: () => this.forceQuitPanel() },
      '-',
      { id: 'sleep', label: this.t('shell.menu.sleep'), run: () => this.session.sleepNow() },
      { id: 'restart', label: this.t('shell.menu.restart'), run: () => this.session.restart() },
      { id: 'shut', label: this.t('shell.menu.shutDown'), run: () => this.session.shutDown() },
      '-',
      { id: 'lock', label: this.t('shell.menu.lockScreen'), key: '⌃⌘Q', run: () => this.session.lock() },
      {
        id: 'logout',
        label: this.t('shell.menu.logOut', { name: this.system.user }),
        key: '⇧⌘Q',
        run: () => this.session.lock()
      }
    ];
  }

  /** 菜单栏上应用名下的那份菜单。 */
  about(name: string): MenuEntry[] {
    return [
      { id: 'a', label: this.t('shell.menu.about', { name }), run: () => this.wm.open('about') },
      '-',
      { id: 'p', label: this.t('shell.menu.settings'), key: '⌘,', run: () => this.wm.open('settings') },
      '-',
      { id: 'h', label: this.t('shell.menu.hide', { name }), key: '⌘H', run: () => this.wm.hideFront() },
      { id: 'o', label: this.t('shell.menu.hideOthers'), key: '⌥⌘H', run: () => this.wm.hideOthers() },
      { id: 's', label: this.t('shell.menu.showAll'), run: () => this.wm.showAll() },
      '-',
      { id: 'q', label: this.t('shell.menu.quit', { name }), key: '⌘Q', run: () => this.wm.quitFront() }
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
      { id: 'o', label: this.t('shell.menu.hideOthers'), key: '⌥⌘H', run: () => this.wm.hideOthers() },
      { id: 's', label: this.t('shell.menu.showAll'), run: () => this.wm.showAll() },
      '-',
      { id: 'q', label: 'Quit GitHub Desktop', key: '⌘Q', run: () => this.wm.quitFront() }
    ];
  }

  /** Window 菜单：窗口动作、前台应用自己的窗口列表（由窗口管理器生成），以及整组前置。 */
  window(): MenuEntry[] {
    const front = this.wm.front();
    const windows = this.wm.windowMenuEntries();
    return [
      { id: 'min', label: this.t('shell.menu.minimize'), key: '⌘M', run: () => this.wm.minimizeFront() },
      { id: 'zoo', label: this.t('shell.menu.zoom'), run: () => this.wm.zoomFront() },
      { id: 'fil', label: this.t('shell.menu.fill'), key: '⌃⌥⏎', run: () => this.wm.zoomFront() },
      '-',
      ...windows,
      ...(windows.length ? (['-'] as const) : []),
      { id: 'cyc', label: this.t('shell.menu.cycleWindows'), key: '⌘`', run: () => this.wm.cycle() },
      {
        id: 'brf',
        label: this.t('shell.menu.bringAllToFront'),
        run: () => {
          const appId = front?.appId;
          if (appId) this.wm.showAppWindows(appId);
        }
      }
    ];
  }

  finder(target: FinderCommands): MenuSection[] {
    return [
      section(this.t('shell.menu.sectionFile'), [
        { id: 'nw', label: this.t('shell.menu.newFinderWindow'), key: '⌘N', run: () => this.wm.open('finder') },
        { id: 'nf', label: this.t('shell.menu.newFolder'), key: '⇧⌘N', run: () => target.newFolder() },
        '-',
        { id: 'op', label: this.t('shell.menu.open'), key: '⌘O', run: () => target.openSelected() },
        { id: 'cl', label: this.t('shell.menu.closeWindow'), key: '⌘W', run: () => this.wm.closeFront() },
        '-',
        { id: 'gi', label: this.t('shell.menu.getInfo'), key: '⌘I', run: () => target.getInfo() },
        ...(target.inTrash() ?
          ([{ id: 'et', label: this.t('shell.menu.emptyTrash'), key: '⇧⌘⌫', run: () => target.emptyTrash() }] as const)
        : ([
            { id: 'tr', label: this.t('shell.menu.moveToTrash'), key: '⌘⌫', run: () => target.trashSelected() }
          ] as const)),
        '-',
        { id: 'find', label: this.t('shell.menu.find'), key: '⌘F', run: () => target.focusSearch() }
      ]),
      section(this.t('shell.menu.sectionEdit'), [
        {
          id: 'u',
          label: this.fs.undoLabel() ?? this.t('shell.menu.undo'),
          key: '⌘Z',
          disabled: !this.fs.canUndo(),
          run: () => void this.fs.undo()
        },
        {
          id: 'r',
          label: this.t('shell.menu.redo'),
          key: '⇧⌘Z',
          disabled: !this.fs.canRedo(),
          run: () => void this.fs.redo()
        },
        '-',
        { id: 'x', label: this.t('shell.menu.cut'), key: '⌘X', run: () => target.cutSelected() },
        { id: 'c', label: this.t('shell.menu.copy'), key: '⌘C', run: () => target.copySelected() },
        { id: 'v', label: this.t('shell.menu.paste'), key: '⌘V', run: () => target.paste() },
        {
          id: 'mv',
          label: this.t('shell.menu.moveItemHere'),
          key: '⌥⌘V',
          disabled: this.clipboard.snapshot()?.mode !== 'cut',
          run: () => target.paste()
        },
        '-',
        { id: 'a', label: this.t('shell.menu.selectAll'), key: '⌘A', run: () => target.selectAll() }
      ]),
      section(this.t('shell.menu.sectionView'), [
        { id: 'icons', label: this.t('shell.menu.asIcons'), key: '⌘1', run: () => target.setView('icon') },
        { id: 'listv', label: this.t('shell.menu.asList'), key: '⌘2', run: () => target.setView('list') },
        { id: 'colv', label: this.t('shell.menu.asColumns'), key: '⌘3', run: () => target.setView('column') },
        { id: 'galv', label: this.t('shell.menu.asGallery'), key: '⌘4', run: () => target.setView('gallery') },
        '-',
        {
          id: 'sb',
          label: target.sidebarVisible() ? this.t('shell.menu.hideSidebar') : this.t('shell.menu.showSidebar'),
          key: '⌥⌘S',
          run: () => target.toggleSidebar()
        },
        { id: 'pb', label: this.t('shell.menu.hidePathBar'), key: '⌥⌘P', run: () => target.togglePathBar() },
        '-',
        {
          id: 'hidden-files',
          label: this.t('shell.menu.showHiddenFiles'),
          key: '⌃⇧.',
          alternateKey: '⇧⌘.',
          checked: this.finderPreferences.showHiddenFiles(),
          run: () => {
            void this.finderPreferences
              .toggleShowHiddenFiles()
              .catch((error: unknown) => this.toast.show(String(error)));
          }
        },
        '-',
        { id: 'vo', label: this.t('shell.menu.showViewOptions'), key: '⌘J', run: () => target.showViewOptions() }
      ]),
      section(this.t('shell.menu.sectionGo'), [
        { id: 'g1', label: this.t('shell.menu.recents'), key: '⇧⌘F', run: () => target.goto('Recents') },
        { id: 'g2', label: this.t('shell.menu.documents'), key: '⇧⌘O', run: () => target.goto('Documents') },
        { id: 'g3', label: this.t('shell.menu.desktop'), key: '⇧⌘D', run: () => target.goto('Desktop') },
        { id: 'g4', label: this.t('shell.menu.downloads'), key: '⌥⌘L', run: () => target.goto('Downloads') },
        { id: 'g5', label: this.t('shell.menu.applications'), key: '⇧⌘A', run: () => target.goto('Applications') },
        '-',
        { id: 'gf', label: this.t('shell.menu.goToFolder'), key: '⇧⌘G', run: () => target.gotoFolder() }
      ]),
      section(this.t('shell.menu.sectionWindow'), this.window()),
      section(this.t('shell.menu.sectionHelp'), [
        { field: this.t('shell.menu.search') },
        {
          id: 'h',
          label: this.t('shell.menu.macosHelp'),
          key: '⌘?',
          run: () => this.toast.show('shell.menu.oneHtmlFile')
        },
        { id: 'n', label: this.t('shell.menu.newFeatures'), run: () => this.wm.open('about') }
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
      goto: place => this.wm.open('finder', { path: PLACES[place] ?? HOME_PATH }),
      inTrash: () => false,
      emptyTrash: none,
      focusSearch: () => this.wm.open('finder', { path: HOME_PATH }),
      gotoFolder: () => this.wm.open('finder', { path: HOME_PATH }),
      showViewOptions: none
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
          { field: this.t('shell.menu.search') },
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
      [this.t('shell.menu.sectionFile')]: [
        { id: 'n', label: this.t('shell.menu.newWindow'), key: '⌘N', run: () => this.wm.open(appId, { force: true }) },
        { id: 'w', label: this.t('shell.menu.closeWindow'), key: '⌘W', run: () => this.wm.closeFront() }
      ],
      [this.t('shell.menu.sectionEdit')]: [
        { id: 'u', label: this.t('shell.menu.undo'), key: '⌘Z', run: () => exec('undo') },
        { id: 'r', label: this.t('shell.menu.redo'), key: '⇧⌘Z', run: () => exec('redo') },
        '-',
        { id: 'x', label: this.t('shell.menu.cut'), key: '⌘X', run: () => exec('cut') },
        { id: 'c', label: this.t('shell.menu.copy'), key: '⌘C', run: () => exec('copy') },
        { id: 'v', label: this.t('shell.menu.paste'), key: '⌘V', run: () => exec('paste') },
        '-',
        { id: 'a', label: this.t('shell.menu.selectAll'), key: '⌘A', run: () => exec('selectAll') }
      ],
      [this.t('shell.menu.sectionView')]: [
        { id: 'f', label: this.t('shell.menu.enterFullScreen'), key: '⌃⌘F', run: () => this.wm.zoomFront() },
        { id: 't', label: this.t('shell.menu.showToolbar'), key: '⌥⌘T', checked: true }
      ],
      [this.t('shell.menu.sectionWindow')]: this.window(),
      Help: [
        { field: this.t('shell.menu.search') },
        {
          id: 'h',
          label: this.t('shell.menu.appHelp', { name: this.apps()[appId].name }),
          run: () => this.toast.show('shell.menu.noHelpNeeded')
        },
        {
          id: 'k',
          label: this.t('shell.menu.keyboardShortcuts'),
          run: () => this.toast.show('shell.menu.shortcutHints')
        }
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

  /** 「最近项目」子菜单：本次会话打开过的应用，新的在前；没有记录时给一个置灰项。 */
  private recentItems(): readonly MenuEntry[] {
    const items = this.wm.recentApps().flatMap(appId => {
      const app = this.apps()[appId];
      return app ?
          [{ id: `recent-${appId}`, label: app.name, icon: app.icon, run: () => void this.wm.open(appId) }]
        : [];
    });
    return items.length ? items : [{ id: 'recent-none', label: this.t('shell.menu.noRecentItems'), disabled: true }];
  }
}
