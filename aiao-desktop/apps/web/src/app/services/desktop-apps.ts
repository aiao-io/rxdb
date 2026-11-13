import { InjectionToken, Type } from '@angular/core';

import type { FsNode } from './file-system';

export type DesktopAppId =
  | 'finder'
  | 'terminal'
  | 'vscode'
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

/**
 * 应用的三种类别（D-10）：系统入口不开窗口；内置应用是随桌面构建的组件；
 * 集成应用是独立部署的 Web 应用，经 Orbit 在窗口的 iframe 里运行。
 */
export type DesktopAppKind = 'system' | 'builtin' | 'web';

/** 可以授予集成应用 iframe 的浏览器权限（Permissions Policy）。 */
export const WEB_APP_PERMISSIONS = [
  'cross-origin-isolated',
  'clipboard-read',
  'clipboard-write',
  'fullscreen'
] as const;

export type WebAppPermission = (typeof WEB_APP_PERMISSIONS)[number];

/** 集成应用的入口：Orbit 装载应用需要的全部信息。 */
export interface WebAppEntry {
  /** 应用的地址，必须是不带用户名密码的 HTTPS 地址。 */
  readonly url: string;
  /** 版本标识，交给 Orbit 作身份元数据。 */
  readonly version: string;
  /** 授予 iframe 的浏览器权限。 */
  readonly allow: readonly WebAppPermission[];
  /** 等应用报告就绪的时限（毫秒，1～120000）。 */
  readonly readyTimeout: number;
}

interface DesktopAppBase {
  readonly id: DesktopAppId;
  readonly name: string;
  readonly icon: string;
  readonly w?: number;
  readonly h?: number;
  readonly minW?: number;
  readonly minH?: number;
  /** 默认单实例；`false` 时每次打开都新建窗口。 */
  readonly single?: boolean;
}

/** 启动台、废纸篓：不开窗口，由桌面直接处理。 */
export interface SystemEntryManifest extends DesktopAppBase {
  readonly kind: 'system';
}

/** 随桌面构建的 Angular 组件。 */
export interface BuiltinAppManifest extends DesktopAppBase {
  readonly kind: 'builtin';
}

/** 独立部署的 Web 应用。 */
export interface WebAppManifest extends DesktopAppBase {
  readonly kind: 'web';
  readonly web: WebAppEntry;
}

/** 登记表的描述部分：不依赖 Angular 的纯数据。 */
export type DesktopAppManifest = SystemEntryManifest | BuiltinAppManifest | WebAppManifest;

export type DesktopAppManifests = Readonly<Record<DesktopAppId, DesktopAppManifest>>;

/** 登记表的一项：清单加上开窗口用的组件；系统入口没有组件。 */
export type DesktopAppDefinition = DesktopAppManifest & { readonly component?: Type<unknown> };

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
  'vscode',
  'activity',
  'diskutil',
  'fontbook',
  'calculator',
  'textedit',
  'preview',
  'settings',
  'about'
];

const KINDS: readonly string[] = ['system', 'builtin', 'web'];
const MAX_READY_TIMEOUT = 120_000;

/** 逐项列出登记表的问题；空数组即合规。 */
export function validateManifests(manifests: DesktopAppManifests): string[] {
  return Object.entries(manifests).flatMap(([key, manifest]) => manifestProblems(key, manifest));
}

/** 登记表不合规就抛错，桌面不带着不合规的登记启动。 */
export function assertManifests(manifests: DesktopAppManifests): void {
  const problems = validateManifests(manifests);
  if (problems.length) throw new Error(`应用登记表不合规：\n${problems.join('\n')}`);
}

/** Orbit 的允许来源：集成应用入口的精确来源，去重。 */
export function webAppOrigins(manifests: DesktopAppManifests): string[] {
  const origins = Object.values(manifests).flatMap(app => (app.kind === 'web' ? [new URL(app.web.url).origin] : []));
  return [...new Set(origins)];
}

/** 交给 iframe `allow` 属性的权限串。 */
export function orbitAllow(web: WebAppEntry): string {
  return web.allow.join('; ');
}

function manifestProblems(key: string, manifest: DesktopAppManifest): string[] {
  const problems: string[] = [];
  if (manifest.id !== key) problems.push(`${key}.id：登记的 id 是 ${manifest.id}，与登记键不一致`);
  if (!manifest.name.trim()) problems.push(`${key}.name：不能为空`);
  if (!KINDS.includes(manifest.kind)) return [...problems, `${key}.kind：只能是 system、builtin 或 web`];
  const web = (manifest as { readonly web?: WebAppEntry }).web;
  if (manifest.kind !== 'web') return web ? [...problems, `${key}.web：只有集成应用（web）才有入口`] : problems;
  if (!web) return [...problems, `${key}.web：集成应用必须登记入口`];
  return [...problems, ...entryProblems(key, web)];
}

function entryProblems(key: string, web: WebAppEntry): string[] {
  const problems: string[] = [];
  if (!isPlainHttps(web.url)) problems.push(`${key}.web.url：必须是不带用户名密码的 HTTPS 地址`);
  if (!web.version.trim() || web.version.length > 128) problems.push(`${key}.web.version：必须是 1～128 个字符`);
  problems.push(...permissionProblems(key, web.allow));
  if (!Number.isInteger(web.readyTimeout) || web.readyTimeout < 1 || web.readyTimeout > MAX_READY_TIMEOUT)
    problems.push(`${key}.web.readyTimeout：必须是 1～${MAX_READY_TIMEOUT} 之间的整数毫秒`);
  return problems;
}

function permissionProblems(key: string, allow: readonly string[]): string[] {
  const known: readonly string[] = WEB_APP_PERMISSIONS;
  return allow.flatMap((permission, index) => {
    if (!known.includes(permission))
      return [`${key}.web.allow：${permission} 不在允许清单（${WEB_APP_PERMISSIONS.join('、')}）`];
    return allow.indexOf(permission) === index ? [] : [`${key}.web.allow：${permission} 重复`];
  });
}

function isPlainHttps(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}
