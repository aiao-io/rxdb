import type { DesktopAppManifests } from '../services/desktop-apps';

const shelf = { kind: 'builtin', w: 900, h: 600, minW: 520, minH: 340 } as const;

/**
 * 应用登记表的描述部分（D-10）：系统入口、内置应用与集成应用都在这里，纯数据、不依赖 Angular，
 * 单测直接校验它；内置应用的组件在 `registry.ts` 里按 id 绑定。
 * 顺序即原注册顺序，按 `.app` 文件名查找应用时依赖它。
 */
export const DESKTOP_APP_MANIFESTS = {
  finder: {
    id: 'finder',
    name: 'Finder',
    icon: 'app-finder',
    kind: 'builtin',
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
    w: 1180,
    h: 740,
    minW: 720,
    minH: 440,
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
    w: 254,
    h: 366,
    minW: 232,
    minH: 320
  },
  about: { id: 'about', name: 'Finder', icon: 'app-finder', kind: 'builtin', w: 400, h: 468, minW: 400, minH: 468 },
  textedit: {
    id: 'textedit',
    name: 'TextEdit',
    icon: 'f-txt',
    kind: 'builtin',
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
    w: 640,
    h: 560,
    minW: 360,
    minH: 300,
    single: false
  },
  notes: { id: 'notes', name: 'Notes', icon: 'app-notes', kind: 'builtin', w: 940, h: 600, minW: 580, minH: 340 },
  calendar: {
    id: 'calendar',
    name: 'Calendar',
    icon: 'app-calendar',
    kind: 'builtin',
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
    w: 1020,
    h: 660,
    minW: 520,
    minH: 360,
    single: false
  },
  music: { id: 'music', name: 'Music', icon: 'app-music', kind: 'builtin', w: 1000, h: 640, minW: 620, minH: 400 },
  settings: {
    id: 'settings',
    name: 'System Settings',
    icon: 'app-settings',
    kind: 'builtin',
    w: 800,
    h: 600,
    minW: 620,
    minH: 420
  },
  mail: { id: 'mail', name: 'Mail', icon: 'app-mail', kind: 'builtin', w: 1020, h: 640, minW: 620, minH: 380 },
  messages: {
    id: 'messages',
    name: 'Messages',
    icon: 'app-messages',
    kind: 'builtin',
    w: 900,
    h: 600,
    minW: 560,
    minH: 360
  },
  maps: { id: 'maps', name: 'Maps', icon: 'app-maps', kind: 'builtin', w: 940, h: 620, minW: 480, minH: 320 },
  photos: {
    id: 'photos',
    name: 'Photos',
    icon: 'app-photos',
    kind: 'builtin',
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
    w: 800,
    h: 560,
    minW: 480,
    minH: 340
  },
  clock: { id: 'clock', name: 'Clock', icon: 'app-clock', kind: 'builtin', w: 520, h: 420, minW: 360, minH: 300 },
  contacts: {
    id: 'contacts',
    name: 'Contacts',
    icon: 'app-contacts',
    kind: 'builtin',
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
    w: 860,
    h: 600,
    minW: 480,
    minH: 320
  },
  podcasts: { id: 'podcasts', name: 'Podcasts', icon: 'app-podcasts', ...shelf },
  tv: { id: 'tv', name: 'TV', icon: 'app-tv', ...shelf },
  books: { id: 'books', name: 'Books', icon: 'app-books', ...shelf },
  appstore: { id: 'appstore', name: 'App Store', icon: 'app-appstore', ...shelf },
  facetime: {
    id: 'facetime',
    name: 'FaceTime',
    icon: 'app-facetime',
    kind: 'builtin',
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
    w: 720,
    h: 500,
    minW: 460,
    minH: 320
  },
  launchpad: { id: 'launchpad', name: 'Launchpad', icon: 'app-launchpad', kind: 'system' },
  trash: { id: 'trash', name: 'Trash', icon: 'app-trash', kind: 'system' }
} as const satisfies DesktopAppManifests;
