import { InjectionToken, Type } from '@angular/core';

import type { FsNode } from './file-system';

export type DesktopAppId =
  | 'finder'
  | 'terminal'
  | 'calculator'
  | 'about'
  | 'textedit'
  | 'preview'
  | 'notes'
  | 'calendar'
  | 'safari'
  | 'music'
  | 'settings'
  | 'mail'
  | 'messages'
  | 'maps'
  | 'photos'
  | 'reminders'
  | 'weather'
  | 'stocks'
  | 'clock'
  | 'contacts'
  | 'freeform'
  | 'podcasts'
  | 'tv'
  | 'books'
  | 'appstore'
  | 'facetime'
  | 'activity'
  | 'diskutil'
  | 'fontbook'
  | 'voice'
  | 'launchpad'
  | 'trash';

/** 应用登记信息；`component` 为空的是浮层型入口（启动台、废纸篓）。 */
export interface DesktopAppDefinition {
  readonly id: DesktopAppId;
  readonly name: string;
  readonly icon: string;
  readonly w?: number;
  readonly h?: number;
  readonly minW?: number;
  readonly minH?: number;
  /** 默认单实例；`false` 时每次打开都新建窗口。 */
  readonly single?: boolean;
  readonly component?: Type<unknown>;
}

export type DesktopAppRegistry = Readonly<Record<DesktopAppId, DesktopAppDefinition>>;

/** 打开窗口的参数，按应用各取所需。 */
export interface DesktopOpenOptions {
  readonly force?: boolean;
  readonly w?: number;
  readonly h?: number;
  readonly path?: readonly string[];
  readonly section?: string;
  readonly file?: string | FsNode;
  readonly node?: FsNode;
  readonly select?: string;
  readonly url?: string;
}

/** 应用登记表由桌面页提供，避免服务与应用组件之间的循环引用。 */
export const DESKTOP_APPS = new InjectionToken<DesktopAppRegistry>('DESKTOP_APPS');

/** 启动台与聚焦搜索的应用顺序。 */
export const LAUNCH_ORDER: readonly DesktopAppId[] = [
  'finder',
  'safari',
  'mail',
  'messages',
  'maps',
  'photos',
  'facetime',
  'calendar',
  'contacts',
  'reminders',
  'notes',
  'freeform',
  'voice',
  'appstore',
  'podcasts',
  'music',
  'tv',
  'books',
  'stocks',
  'weather',
  'clock',
  'terminal',
  'activity',
  'diskutil',
  'fontbook',
  'calculator',
  'textedit',
  'preview',
  'settings',
  'about'
];
