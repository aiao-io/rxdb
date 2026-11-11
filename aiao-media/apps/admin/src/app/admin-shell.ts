import { createAdminI18n, createAdminShell, pickThemes, type MenuNode } from '@aiao/rxdb-admin';
import type { AdminIcon } from '@aiao/rxdb-admin-angular';
import {
  LucideClipboardList as ClipboardList,
  LucideFileText as FileText,
  LucideHistory as History,
  LucideSettings2 as Settings,
  LucideUsers as Users
} from '@lucide/angular';
import type { AdminTab } from './admin-console';

let navigate: (url: string) => void = url => window.location.assign(url);

/** 把后台外壳的延迟导航绑定到 Angular Router。 */
export function bindAdminNavigator(value: (url: string) => void): void {
  navigate = value;
}

/** Aiao Media 管理后台的主导航，菜单身份与 AdminConsole 的页签保持一致。 */
export const ADMIN_MENU: readonly MenuNode<AdminIcon>[] = [
  { id: 'users', label: '用户', icon: Users, route: '/users' },
  { id: 'templates', label: '模板', icon: FileText, route: '/templates' },
  { id: 'policies', label: '供应商策略', icon: Settings, route: '/policies' },
  { id: 'tasks', label: '任务与用量', icon: ClipboardList, route: '/tasks' },
  { id: 'audit', label: '操作审计', icon: History, route: '/audit' }
];

/** 管理后台使用模板外壳的默认主题与中文文案。 */
export const adminShell = createAdminShell<AdminIcon>({
  brand: { title: 'Aiao Media' },
  i18n: createAdminI18n('zh-Hans'),
  navigate: url => navigate(url),
  storagePrefix: 'aiao.media.admin',
  themes: pickThemes(['light', 'dark', 'corporate', 'business', 'dracula', 'nord', 'emerald']),
  defaults: { widget: { hidden: ['refresh'] } },
  menu: ADMIN_MENU
});

/** 从外壳地址得到当前业务页签。 */
export function tabFromUrl(url: string): AdminTab {
  const path = url.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  return ADMIN_MENU.some(item => item.id === path && item.route !== undefined) ? (path as AdminTab) : 'users';
}
