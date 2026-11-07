import { flattenMenu, type MenuNode } from '../layout/menu.js';
import type { PaletteItem, PaletteSource } from '../palette/controller.js';
import type { AdminShell, ShellCommand } from './types.js';

function closeActiveTab<T>(shell: AdminShell<T>): void {
  const { activeKey } = shell.tabs.value;
  if (activeKey !== null) shell.closeTab(activeKey);
}

/**
 * 注册外壳内置快捷键。锁屏时全部不响应。
 * @param shell - 外壳。
 * @returns 注销全部内置快捷键的函数。
 */
export function registerBuiltinShortcuts<T>(shell: AdminShell<T>): () => void {
  const unlocked = (): boolean => !shell.lock.locked.value;
  const define = (id: string, combo: string, handler: () => void) =>
    shell.shortcuts.register({ id, combo, labelKey: `shortcut.${id}`, handler, when: unlocked });
  const unregister = [
    define('palette', 'Mod+K', () => shell.palette.toggle()),
    define('preferences', 'Mod+,', () => shell.ui.setPreferencesOpen(true)),
    define('lock', 'Alt+L', () => shell.lock.lock()),
    define('toggleSidebar', 'Mod+B', () => shell.toggleSidebar()),
    define('closeTab', 'Alt+W', () => closeActiveTab(shell))
  ];
  return () => unregister.forEach(off => off());
}

/**
 * 外壳内置的命令面板命令。
 * @param shell - 外壳。
 * @returns 命令列表（文案按当前语言翻译）。
 */
export function builtinCommands<T>(shell: AdminShell<T>): ShellCommand[] {
  const command = (id: string, run: () => void | Promise<void>, keywords: string[] = []): ShellCommand => ({
    id,
    label: shell.t(`command.${id}`),
    keywords,
    run
  });
  return [
    command('openPreferences', () => shell.ui.setPreferencesOpen(true), ['settings', 'preferences', '设置']),
    command('toggleTheme', () => shell.theme.cycle(), ['theme', 'dark', 'light', '主题', '深色', '浅色']),
    command('toggleSidebar', () => shell.toggleSidebar(), ['sidebar', 'menu', '侧栏', '导航']),
    command('lock', () => shell.lock.lock(), ['lock', '锁屏']),
    command('fullscreen', () => shell.fullscreen.toggle(), ['fullscreen', '全屏']),
    command('refresh', () => shell.ui.refresh(), ['refresh', 'reload', '刷新']),
    command('maximize', () => shell.ui.toggleMaximize(), ['maximize', 'focus', '最大化', '专注']),
    command('closeTab', () => closeActiveTab(shell), ['tab', '页签']),
    command('resetPreferences', () => shell.preferences.reset(), ['reset', '重置'])
  ];
}

/**
 * 菜单来源：每个带路由的菜单项一条，副标题是它所在的分组。
 * @param shell - 外壳。
 * @returns 同步来源。
 */
export function menuSource<T>(shell: AdminShell<T>): PaletteSource {
  const toItems = (nodes: readonly MenuNode<T>[], trail: string[] = []): PaletteItem[] =>
    nodes.flatMap(node =>
      node.route ?
        [
          {
            id: `menu:${node.id}`,
            label: node.label,
            ...(trail.length > 0 ? { sublabel: trail.join(' / ') } : {}),
            keywords: [node.route],
            ...(node.icon !== undefined ? { icon: node.icon } : {}),
            run: () => shell.navigate(node.route as string)
          }
        ]
      : toItems(node.children ?? [], [...trail, node.label])
    );
  return {
    id: 'menu',
    groupLabelKey: 'palette.group.menu',
    items: () => {
      const nodes = shell.menu.value;
      return flattenMenu(nodes).length === 0 ? [] : toItems(nodes);
    }
  };
}

/**
 * 命令来源。
 * @param commands - 命令读取函数，每次打开面板时重新读取以跟随语言。
 * @returns 同步来源。
 */
export function commandSource(commands: () => readonly ShellCommand[]): PaletteSource {
  return {
    id: 'commands',
    groupLabelKey: 'palette.group.commands',
    items: () =>
      commands().map(({ id, label, keywords, run }) => ({
        id: `command:${id}`,
        label,
        ...(keywords ? { keywords } : {}),
        run
      }))
  };
}
