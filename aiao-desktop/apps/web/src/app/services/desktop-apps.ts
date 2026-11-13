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
  | 'saltline'
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

/**
 * 集成应用的窗口外观（D-14，对应 Tauri 的 decorations）：standard 由桌面画标题栏；
 * transparent 允许应用在运行时隐藏桌面的标题栏，自己画标题栏与红黄绿按钮。
 */
export const WEB_APP_FRAMES = ['standard', 'transparent'] as const;

export type WebAppFrame = (typeof WEB_APP_FRAMES)[number];

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
  /** 窗口外观，默认 standard。 */
  readonly frame?: WebAppFrame;
}

/**
 * 应用的运行来源（D-17）：登记类别 `kind` 之外的另一个维度。`builtin-component` 是随桌面构建的 Angular 组件，
 * `bundled-html` 是随桌面发布的同源 HTML 入口（几猫3A大作），`remote-web` 是经 Orbit 运行的独立 Web 应用。
 */
export type AppRuntime = 'builtin-component' | 'bundled-html' | 'remote-web';

/** 安装来源（D-17）：本阶段只有随构建发布的预装应用，目录安装与用户安装不在已立项范围。 */
export const INSTALL_SCOPES = ['preinstalled'] as const;

export type InstallScope = (typeof INSTALL_SCOPES)[number];

/** 默认 Dock 的区域：`apps` 在分隔线之前（用户可调整顺序），`trailing` 在分隔线之后（废纸篓）。 */
export type DockZone = 'apps' | 'trailing';

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
  /** 是否作为 `.app` 包出现在 /Applications（D-17 的投影）。启动台、废纸篓这类系统入口为 `false`。 */
  readonly showInApplications: boolean;
  /** 首次使用（没有已存的 Dock 布局）时是否默认固定在 Dock。 */
  readonly defaultPinned: boolean;
  /** 默认 Dock 里的顺序（升序）；`defaultPinned` 时必填，同一区域内不重复。 */
  readonly dockOrder?: number;
  /** 默认固定项所在的区域，默认 `apps`。 */
  readonly dockZone?: DockZone;
  /** 固定之后用户能不能从 Dock 移除；系统入口与 Finder 不能。 */
  readonly dockRemovable: boolean;
}

/** 有 `.app` 身份的应用（内置与集成）共有的字段。 */
interface BundledAppBase extends DesktopAppBase {
  /** 稳定的包标识（Info.plist 的 CFBundleIdentifier），应用改名后不变；所有入口按它或 id 启动，不按显示名。 */
  readonly bundleId: string;
  /** 安装来源。 */
  readonly installScope: InstallScope;
}

/** 启动台、废纸篓：不开窗口，由桌面直接处理。 */
export interface SystemEntryManifest extends DesktopAppBase {
  readonly kind: 'system';
}

/** 随桌面构建的应用：Angular 组件，或随桌面发布的同源 HTML 入口。 */
export interface BuiltinAppManifest extends BundledAppBase {
  readonly kind: 'builtin';
  /** 运行来源，默认 `builtin-component`。 */
  readonly runtime?: 'builtin-component' | 'bundled-html';
  /** `bundled-html` 的入口：相对桌面根目录的路径（例如 `saltline.html`），与桌面同源。 */
  readonly entry?: string;
}

/** 独立部署的 Web 应用。 */
export interface WebAppManifest extends BundledAppBase {
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
  'saltline',
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
  return [
    ...Object.entries(manifests).flatMap(([key, manifest]) => manifestProblems(key, manifest)),
    ...uniquenessProblems(manifests)
  ];
}

/** 登记表不合规就抛错，桌面不带着不合规的登记启动。 */
export function assertManifests(manifests: DesktopAppManifests): void {
  const problems = validateManifests(manifests);
  if (problems.length) throw new Error(`应用登记表不合规：\n${problems.join('\n')}`);
}

/** 应用的运行来源；系统入口不开窗口，没有运行来源。 */
export function runtimeOf(app: DesktopAppManifest): AppRuntime | null {
  if (app.kind === 'system') return null;
  if (app.kind === 'web') return 'remote-web';
  return app.runtime ?? 'builtin-component';
}

/** 出现在 /Applications 的应用，按登记顺序。 */
export function applicationManifests(manifests: DesktopAppManifests): DesktopAppManifest[] {
  return Object.values(manifests).filter(app => app.showInApplications);
}

/** 默认 Dock 的固定项：区域内按 `dockOrder` 升序，先 `apps` 后 `trailing`。 */
export function defaultDockApps(manifests: DesktopAppManifests): { apps: DesktopAppId[]; trailing: DesktopAppId[] } {
  const pinned = Object.values(manifests)
    .filter(app => app.defaultPinned)
    .sort((a, b) => (a.dockOrder ?? 0) - (b.dockOrder ?? 0));
  const zone = (name: DockZone) => pinned.filter(app => (app.dockZone ?? 'apps') === name).map(app => app.id);
  return { apps: zone('apps'), trailing: zone('trailing') };
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
  problems.push(...placementProblems(key, manifest), ...bundleProblems(key, manifest));
  const web = (manifest as { readonly web?: WebAppEntry }).web;
  if (manifest.kind !== 'web') return web ? [...problems, `${key}.web：只有集成应用（web）才有入口`] : problems;
  if (!web) return [...problems, `${key}.web：集成应用必须登记入口`];
  return [...problems, ...entryProblems(key, web)];
}

/** 展示位置：系统入口不进 Applications，固定到 Dock 的要有顺序，系统入口不可移除。 */
function placementProblems(key: string, manifest: DesktopAppManifest): string[] {
  const problems: string[] = [];
  if (typeof manifest.showInApplications !== 'boolean') problems.push(`${key}.showInApplications：必须是布尔值`);
  if (typeof manifest.defaultPinned !== 'boolean') problems.push(`${key}.defaultPinned：必须是布尔值`);
  if (typeof manifest.dockRemovable !== 'boolean') problems.push(`${key}.dockRemovable：必须是布尔值`);
  if (manifest.kind === 'system') {
    if (manifest.showInApplications) problems.push(`${key}.showInApplications：系统入口不进 Applications`);
    if (manifest.dockRemovable) problems.push(`${key}.dockRemovable：系统入口不能从 Dock 移除`);
  }
  if (manifest.defaultPinned && !Number.isInteger(manifest.dockOrder))
    problems.push(`${key}.dockOrder：默认固定在 Dock 的应用必须登记整数顺序`);
  if (!manifest.defaultPinned && manifest.dockOrder !== undefined)
    problems.push(`${key}.dockOrder：没有默认固定在 Dock 就不该登记顺序`);
  if (manifest.dockZone !== undefined && !['apps', 'trailing'].includes(manifest.dockZone))
    problems.push(`${key}.dockZone：只能是 apps 或 trailing`);
  return problems;
}

const BUNDLE_ID = /^[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9-]*)+$/;

/** 有 .app 身份的应用：稳定的包标识、安装来源，以及同源 HTML 入口的合法性。 */
function bundleProblems(key: string, manifest: DesktopAppManifest): string[] {
  if (manifest.kind === 'system') return [];
  const problems: string[] = [];
  if (typeof manifest.bundleId !== 'string' || !BUNDLE_ID.test(manifest.bundleId))
    problems.push(`${key}.bundleId：必须是形如 io.aiao.desktop.name 的反向域名标识`);
  const scopes: readonly string[] = INSTALL_SCOPES;
  if (!scopes.includes(manifest.installScope)) problems.push(`${key}.installScope：只能是 ${INSTALL_SCOPES.join(' 或 ')}`);
  if (manifest.kind !== 'builtin') return problems;
  if (manifest.runtime !== undefined && !['builtin-component', 'bundled-html'].includes(manifest.runtime))
    problems.push(`${key}.runtime：内置应用只能是 builtin-component 或 bundled-html`);
  if (manifest.runtime === 'bundled-html' && !isRelativeEntry(manifest.entry))
    problems.push(`${key}.entry：同源 HTML 应用必须登记相对入口（例如 saltline.html）`);
  if (manifest.runtime !== 'bundled-html' && manifest.entry !== undefined)
    problems.push(`${key}.entry：只有 bundled-html 应用才有入口`);
  return problems;
}

function isRelativeEntry(entry: string | undefined): boolean {
  return typeof entry === 'string' && /^[\w-]+(\/[\w-]+)*\.html$/.test(entry);
}

/** 跨应用的约束：包标识唯一，默认 Dock 的顺序在同一区域内唯一。 */
function uniquenessProblems(manifests: DesktopAppManifests): string[] {
  const problems: string[] = [];
  const bundles = new Map<string, string>();
  const slots = new Map<string, string>();
  for (const [key, manifest] of Object.entries(manifests)) {
    if (manifest.kind !== 'system') {
      const owner = bundles.get(manifest.bundleId);
      if (owner) problems.push(`${key}.bundleId：与 ${owner} 重复`);
      else bundles.set(manifest.bundleId, key);
    }
    if (manifest.defaultPinned && Number.isInteger(manifest.dockOrder)) {
      const slot = `${manifest.dockZone ?? 'apps'}:${manifest.dockOrder}`;
      const owner = slots.get(slot);
      if (owner) problems.push(`${key}.dockOrder：与 ${owner} 在同一区域内重复`);
      else slots.set(slot, key);
    }
  }
  return problems;
}

function entryProblems(key: string, web: WebAppEntry): string[] {
  const problems: string[] = [];
  if (!isPlainHttps(web.url)) problems.push(`${key}.web.url：必须是不带用户名密码的 HTTPS 地址`);
  if (!web.version.trim() || web.version.length > 128) problems.push(`${key}.web.version：必须是 1～128 个字符`);
  problems.push(...permissionProblems(key, web.allow));
  if (!Number.isInteger(web.readyTimeout) || web.readyTimeout < 1 || web.readyTimeout > MAX_READY_TIMEOUT)
    problems.push(`${key}.web.readyTimeout：必须是 1～${MAX_READY_TIMEOUT} 之间的整数毫秒`);
  const frames: readonly string[] = WEB_APP_FRAMES;
  if (web.frame !== undefined && !frames.includes(web.frame))
    problems.push(`${key}.web.frame：只能是 ${WEB_APP_FRAMES.join(' 或 ')}`);
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
