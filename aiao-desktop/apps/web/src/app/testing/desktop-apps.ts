import { DesktopAppDefinition, DesktopAppId, DesktopAppRegistry, DesktopOpenOptions } from '../services/desktop-apps';
import { DesktopWindow, WindowBox } from '../services/desktop-window';

/** 登记表里占位的应用组件：服务只把它当不透明的类型传递，从不实例化。 */
export class StubApp {}

/** 登记表要求的、与这些测试无关的共有字段（预装、出现在 Applications、不固定在 Dock）。 */
const common = {
  installScope: 'preinstalled',
  showInApplications: true,
  defaultPinned: false,
  dockRemovable: true
} as const;

/** 测试用的应用登记：只列服务测试会开的几个应用，尺寸与单实例设置各取一种典型情况。 */
const TEST_APP_DEFINITIONS = [
  {
    id: 'finder',
    name: 'Finder',
    icon: 'app-finder',
    kind: 'builtin',
    bundleId: 'io.test.finder',
    ...common,
    w: 940,
    h: 600,
    single: false
  },
  {
    id: 'terminal',
    name: 'Terminal',
    icon: 'app-terminal',
    kind: 'builtin',
    bundleId: 'io.test.terminal',
    ...common,
    w: 760,
    h: 470,
    minW: 420,
    minH: 220
  },
  {
    id: 'calculator',
    name: 'Calculator',
    icon: 'app-calculator',
    kind: 'builtin',
    bundleId: 'io.test.calculator',
    ...common,
    w: 254,
    h: 366,
    minH: 320
  },
  { id: 'notes', name: 'Notes', icon: 'app-notes', kind: 'builtin', bundleId: 'io.test.notes', ...common },
  { id: 'textedit', name: 'TextEdit', icon: 'app-textedit', kind: 'builtin', bundleId: 'io.test.textedit', ...common },
  { id: 'preview', name: 'Preview', icon: 'app-preview', kind: 'builtin', bundleId: 'io.test.preview', ...common },
  { id: 'music', name: 'Music', icon: 'app-music', kind: 'builtin', bundleId: 'io.test.music', ...common },
  {
    id: 'settings',
    name: 'System Settings',
    icon: 'app-settings',
    kind: 'builtin',
    bundleId: 'io.test.settings',
    ...common
  },
  { id: 'about', name: 'About This Mac', icon: 'app-finder', kind: 'builtin', bundleId: 'io.test.about', ...common }
] as const satisfies readonly DesktopAppDefinition[];

/** 系统入口：启动台与废纸篓不开窗口，没有组件。 */
const TEST_SYSTEM_ENTRIES = [
  {
    id: 'launchpad',
    name: 'Launchpad',
    icon: 'app-launchpad',
    kind: 'system',
    showInApplications: false,
    defaultPinned: false,
    dockRemovable: false
  },
  {
    id: 'trash',
    name: 'Trash',
    icon: 'app-trash',
    kind: 'system',
    showInApplications: false,
    defaultPinned: false,
    dockRemovable: false
  }
] as const satisfies readonly DesktopAppDefinition[];

/**
 * 测试用的应用登记表。`overrides` 按 id 覆盖或追加字段（比如把某个应用改成多实例）。
 * 登记表只含上面列出的应用，所以断言类型时转换成完整的 `DesktopAppRegistry`；用到没列出的 id 会在运行时得到 `undefined`。
 */
export function testApps(
  overrides: Readonly<Partial<Record<DesktopAppId, Partial<DesktopAppDefinition>>>> = {}
): DesktopAppRegistry {
  const entries: readonly DesktopAppDefinition[] = [
    ...TEST_APP_DEFINITIONS.map(app => ({ ...app, load: async () => StubApp })),
    ...TEST_SYSTEM_ENTRIES
  ];
  const table = Object.fromEntries(entries.map(app => [app.id, { ...app, ...overrides[app.id] }]));
  return table as unknown as DesktopAppRegistry;
}

/** 直接构造一个窗口（不经窗口管理器），几何给固定值。 */
export function testWindow(
  appId: DesktopAppId = 'notes',
  options: DesktopOpenOptions = {},
  box: WindowBox = { left: 100, top: 80, width: 600, height: 400 },
  id = 'w0'
): DesktopWindow {
  return new DesktopWindow(id, testApps()[appId], options, box);
}
