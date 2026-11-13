import type { DesktopAppManifests } from '../services/desktop-apps';

/** 预装应用的共有字段：随构建发布、出现在 Applications、默认不固定在 Dock、固定后可以移除。 */
const preinstalled = {
  installScope: 'preinstalled',
  showInApplications: true,
  defaultPinned: false,
  dockRemovable: true
} as const;

/** 默认固定在 Dock 的位置（顺序升序，间隔留给以后插入）；`removable: false` 的固定项用户移不掉。 */
const pinned = (dockOrder: number, dockRemovable = true) =>
  ({ defaultPinned: true, dockOrder, dockRemovable }) as const;

const shelf = { kind: 'builtin', w: 900, h: 600, minW: 520, minH: 340, ...preinstalled } as const;

/**
 * 装载代价很大的应用（ADESK-US-104）：刷新后恢复窗口时只重建外框、显示「未启动」占位，用户第一次点击窗口才装载内容，
 * 哪怕它就是恢复前的前台窗口。终端会拉起虚拟机，几猫3A大作是 1.4 MB 的 3D 游戏。
 */
const heavy = { restore: 'deferred' } as const;

/**
 * 应用清单（D-10、D-17）：唯一的应用描述来源。系统入口、内置应用与集成应用都在这里，纯数据、不依赖 Angular，
 * 单测直接校验它；内置应用的组件在 `registry.ts` 里按 id 绑定。Applications、启动台、聚焦搜索、Dock 与菜单栏都
 * 从它派生，没有第二份手工维护的应用列表。顺序即原注册顺序。
 *
 * - `bundleId`：稳定的包标识，写进 `.app` 包的 Info.plist，应用改名后不变；
 * - `showInApplications`：是否在 /Applications 里有一个 `.app` 包（Finder 在系统目录里，不算）；
 * - `defaultPinned` / `dockOrder` / `dockRemovable`：首次使用时的默认 Dock 与固定后能否移除；
 * - `restore`：刷新后恢复窗口时应用内容的装载方式，默认 `eager`；装载代价很大的应用声明 `deferred`（见 `heavy`）。
 */
export const DESKTOP_APP_MANIFESTS = {
  finder: {
    id: 'finder',
    name: 'Finder',
    icon: 'app-finder',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.finder',
    ...preinstalled,
    showInApplications: false,
    ...pinned(10, false),
    w: 940,
    h: 600,
    minW: 560,
    minH: 340,
    single: false
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    icon: 'app-terminal',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.terminal',
    ...preinstalled,
    ...pinned(110),
    ...heavy,
    w: 760,
    h: 470,
    minW: 420,
    minH: 220,
    single: false
  },
  vscode: {
    id: 'vscode',
    name: 'Aiao Code',
    icon: 'app-aiao-code',
    kind: 'web',
    bundleId: 'io.aiao.desktop.aiao-code',
    ...preinstalled,
    ...pinned(120),
    w: 1180,
    h: 740,
    minW: 720,
    minH: 440,
    /* 只声明 Aiao Code 现在实际用到的能力：透明窗口里它调用窗口接口，剪贴板由浏览器权限（下面的 allow）直接授予，两层要一致。 */
    capabilities: ['window', 'clipboard:read', 'clipboard:write'],
    web: {
      url: 'https://vscode.aiao.io/',
      version: 'online',
      allow: ['cross-origin-isolated', 'clipboard-read', 'clipboard-write'],
      readyTimeout: 60_000,
      frame: 'transparent'
    }
  },
  calculator: {
    id: 'calculator',
    name: 'Calculator',
    icon: 'app-calculator',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.calculator',
    ...preinstalled,
    ...pinned(130),
    w: 254,
    h: 366,
    minW: 232,
    minH: 320
  },
  about: {
    id: 'about',
    name: 'Finder',
    icon: 'app-finder',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.about',
    ...preinstalled,
    showInApplications: false,
    w: 400,
    h: 468,
    minW: 400,
    minH: 468
  },
  textedit: {
    id: 'textedit',
    name: 'TextEdit',
    icon: 'f-txt',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.textedit',
    ...preinstalled,
    w: 620,
    h: 520,
    minW: 340,
    minH: 240,
    single: false
  },
  preview: {
    id: 'preview',
    name: 'Preview',
    icon: 'app-preview',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.preview',
    ...preinstalled,
    w: 640,
    h: 560,
    minW: 360,
    minH: 300,
    single: false
  },
  notes: {
    id: 'notes',
    name: 'Notes',
    icon: 'app-notes',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.notes',
    ...preinstalled,
    ...pinned(80),
    w: 940,
    h: 600,
    minW: 580,
    minH: 340
  },
  calendar: {
    id: 'calendar',
    name: 'Calendar',
    icon: 'app-calendar',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.calendar',
    ...preinstalled,
    ...pinned(90),
    w: 880,
    h: 600,
    minW: 560,
    minH: 380
  },
  safari: {
    id: 'safari',
    name: 'Safari',
    icon: 'app-safari',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.safari',
    ...preinstalled,
    ...pinned(30),
    w: 1020,
    h: 660,
    minW: 520,
    minH: 360,
    single: false
  },
  music: {
    id: 'music',
    name: 'Music',
    icon: 'app-music',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.music',
    ...preinstalled,
    ...pinned(100),
    w: 1000,
    h: 640,
    minW: 620,
    minH: 400
  },
  settings: {
    id: 'settings',
    name: 'System Settings',
    icon: 'app-settings',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.system-settings',
    ...preinstalled,
    ...pinned(140),
    w: 800,
    h: 600,
    minW: 620,
    minH: 420
  },
  mail: {
    id: 'mail',
    name: 'Mail',
    icon: 'app-mail',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.mail',
    ...preinstalled,
    ...pinned(40),
    w: 1020,
    h: 640,
    minW: 620,
    minH: 380
  },
  messages: {
    id: 'messages',
    name: 'Messages',
    icon: 'app-messages',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.messages',
    ...preinstalled,
    ...pinned(50),
    w: 900,
    h: 600,
    minW: 560,
    minH: 360
  },
  maps: {
    id: 'maps',
    name: 'Maps',
    icon: 'app-maps',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.maps',
    ...preinstalled,
    ...pinned(60),
    w: 940,
    h: 620,
    minW: 480,
    minH: 320
  },
  photos: {
    id: 'photos',
    name: 'Photos',
    icon: 'app-photos',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.photos',
    ...preinstalled,
    ...pinned(70),
    w: 1060,
    h: 700,
    minW: 640,
    minH: 420
  },
  reminders: {
    id: 'reminders',
    name: 'Reminders',
    icon: 'app-reminders',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.reminders',
    ...preinstalled,
    w: 760,
    h: 540,
    minW: 480,
    minH: 320
  },
  weather: {
    id: 'weather',
    name: 'Weather',
    icon: 'app-weather',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.weather',
    ...preinstalled,
    w: 460,
    h: 620,
    minW: 340,
    minH: 420
  },
  stocks: {
    id: 'stocks',
    name: 'Stocks',
    icon: 'app-stocks',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.stocks',
    ...preinstalled,
    w: 800,
    h: 560,
    minW: 480,
    minH: 340
  },
  clock: {
    id: 'clock',
    name: 'Clock',
    icon: 'app-clock',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.clock',
    ...preinstalled,
    w: 520,
    h: 420,
    minW: 360,
    minH: 300
  },
  contacts: {
    id: 'contacts',
    name: 'Contacts',
    icon: 'app-contacts',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.contacts',
    ...preinstalled,
    w: 760,
    h: 540,
    minW: 480,
    minH: 320
  },
  freeform: {
    id: 'freeform',
    name: 'Freeform',
    icon: 'app-freeform',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.freeform',
    ...preinstalled,
    w: 860,
    h: 600,
    minW: 480,
    minH: 320
  },
  podcasts: {
    id: 'podcasts',
    name: 'Podcasts',
    icon: 'app-podcasts',
    bundleId: 'io.aiao.desktop.podcasts',
    ...shelf
  },
  tv: { id: 'tv', name: 'TV', icon: 'app-tv', bundleId: 'io.aiao.desktop.tv', ...shelf },
  books: { id: 'books', name: 'Books', icon: 'app-books', bundleId: 'io.aiao.desktop.books', ...shelf },
  appstore: {
    id: 'appstore',
    name: 'App Store',
    icon: 'app-appstore',
    bundleId: 'io.aiao.desktop.app-store',
    ...shelf
  },
  facetime: {
    id: 'facetime',
    name: 'FaceTime',
    icon: 'app-facetime',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.facetime',
    ...preinstalled,
    w: 780,
    h: 560,
    minW: 440,
    minH: 320
  },
  activity: {
    id: 'activity',
    name: 'Activity Monitor',
    icon: 'app-activity',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.activity-monitor',
    ...preinstalled,
    w: 860,
    h: 560,
    minW: 560,
    minH: 340
  },
  diskutil: {
    id: 'diskutil',
    name: 'Disk Utility',
    icon: 'app-diskutil',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.disk-utility',
    ...preinstalled,
    w: 800,
    h: 520,
    minW: 560,
    minH: 340
  },
  fontbook: {
    id: 'fontbook',
    name: 'Font Book',
    icon: 'app-fontbook',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.font-book',
    ...preinstalled,
    w: 820,
    h: 560,
    minW: 540,
    minH: 340
  },
  voice: {
    id: 'voice',
    name: 'Voice Memos',
    icon: 'app-voice',
    kind: 'builtin',
    bundleId: 'io.aiao.desktop.voice-memos',
    ...preinstalled,
    w: 720,
    h: 500,
    minW: 460,
    minH: 320
  },
  saltline: {
    id: 'saltline',
    name: '几猫3A大作',
    icon: 'app-saltline',
    kind: 'builtin',
    runtime: 'bundled-html',
    entry: 'saltline.html',
    bundleId: 'io.aiao.desktop.saltline',
    ...preinstalled,
    ...heavy,
    w: 1120,
    h: 700,
    minW: 640,
    minH: 400
  },
  launchpad: {
    id: 'launchpad',
    name: 'Launchpad',
    icon: 'app-launchpad',
    kind: 'system',
    showInApplications: false,
    ...pinned(20, false)
  },
  trash: {
    id: 'trash',
    name: 'Trash',
    icon: 'app-trash',
    kind: 'system',
    showInApplications: false,
    dockZone: 'trailing',
    ...pinned(10, false)
  }
} as const satisfies DesktopAppManifests;
