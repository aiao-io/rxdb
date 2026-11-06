import {
  createAdminShell,
  pickThemes,
  type AdminPreferences,
  type AdminShell,
  type DeepPartial,
  type PreferenceExtension,
  type StorageLike
} from '@aiao/rxdb-admin';
import type { ReactNode } from 'react';

/** 工作台偏好、页签等本机存储的键前缀（与同源其他应用隔离）。 */
export const WORKBENCH_STORAGE_PREFIX = 'aiao.workbench';

/** 全文搜索页的每页条数：作为「拓展」偏好注册，演示应用如何接入自己的设置项。 */
export const SEARCH_PAGE_SIZE_KEY = 'searchPageSize';

const EXTENSIONS: readonly PreferenceExtension[] = [
  {
    key: SEARCH_PAGE_SIZE_KEY,
    type: 'number',
    label: '全文搜索每页条数',
    hint: '搜索页每次加载的结果数，修改后立即生效',
    section: '全文搜索',
    defaultValue: 20,
    min: 5,
    max: 50,
    step: 5
  }
];

/**
 * 迁移外壳接入前的旧键：`theme`（light / dark / auto）与侧栏固定状态 `workbench-sidebar-pinned`。
 * @param storage - 本机存储。
 * @returns 要并入偏好的补丁；没有旧键时为 `null`。
 */
export function readLegacyPreferences(storage: StorageLike): DeepPartial<AdminPreferences> | null {
  const theme = storage.getItem('theme');
  const patch: DeepPartial<AdminPreferences> = {
    ...(theme === 'light' || theme === 'dark' ? { theme: { name: theme } } : {}),
    ...(storage.getItem('workbench-sidebar-pinned') === '0' ? { sidebar: { collapsed: true } } : {})
  };
  return Object.keys(patch).length > 0 ? patch : null;
}

let navigator: (url: string) => void = url => window.location.assign(url);

/**
 * 绑定路由器的跳转函数。路由器在 `main.tsx` 里才创建，外壳先于它存在，因此跳转延迟绑定。
 * @param navigate - 路由器的跳转函数。
 */
export function bindWorkbenchNavigator(navigate: (url: string) => void): void {
  navigator = navigate;
}

/** 工作台的后台外壳：主题 / 布局 / 页签 / 快捷键 / 命令面板 / 锁屏全部由它统一管理。 */
export const workbenchShell: AdminShell<ReactNode> = createAdminShell<ReactNode>({
  brand: { title: '工作台' },
  navigate: url => navigator(url),
  storagePrefix: WORKBENCH_STORAGE_PREFIX,
  themes: pickThemes([
    'light',
    'dark',
    'cupcake',
    'emerald',
    'corporate',
    'retro',
    'nord',
    'dracula',
    'night',
    'business'
  ]),
  defaults: { navigation: { accordion: false } },
  extensions: EXTENSIONS,
  migrateLegacy: readLegacyPreferences
});
