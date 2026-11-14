import type { DesktopAppManifest, DesktopAppManifests } from '../services/desktop-apps';
import { runtimeOf } from '../services/desktop-apps';
import { DiskPath, isWithin, samePath } from './disk-path';
import { DiskEntry, DiskError, DiskStore } from './disk-store';
import { ParsedBundleInfo, infoPlist, parseInfoPlist } from './formats/plist';

/** /Applications 在卷里的路径。 */
export const APPLICATIONS: DiskPath = ['Applications'];

const INFO_PLIST = ['Contents', 'Info.plist'] as const;
const PKG_INFO = ['Contents', 'PkgInfo'] as const;
const PKG_INFO_TEXT = 'APPL????';
const BUNDLE_VERSION = '26.0';

/**
 * 旧版手写种子写出的 `.app` 名单（冻结，不再改）。那些包的 Info.plist 没有 `AiaoAppId`，升级时凭这张表
 * 一次性认领并补上标识，之后一律按标识，不再按显示名匹配（D-17）。键是旧显示名，值是清单里的应用 id。
 */
export const LEGACY_APP_IDS: Readonly<Record<string, string>> = Object.freeze({
  Safari: 'safari',
  Mail: 'mail',
  Messages: 'messages',
  Maps: 'maps',
  Photos: 'photos',
  Notes: 'notes',
  Calendar: 'calendar',
  Music: 'music',
  Terminal: 'terminal',
  Calculator: 'calculator',
  'System Settings': 'settings',
  Preview: 'preview',
  Reminders: 'reminders',
  FaceTime: 'facetime',
  'App Store': 'appstore',
  Podcasts: 'podcasts',
  TV: 'tv',
  Weather: 'weather',
  Stocks: 'stocks',
  Books: 'books',
  Contacts: 'contacts',
  Freeform: 'freeform',
  Clock: 'clock'
});

/** 旧包的标识是 `io.aiao.desktop.<名字小写、空格换连字符>`。 */
const legacyIdentifier = (name: string): string => `io.aiao.desktop.${name.toLowerCase().replace(/\s+/g, '-')}`;

/** 清单里一个应用对应的包目录名。 */
export const bundleDirName = (app: Pick<DesktopAppManifest, 'name'>): string => `${app.name}.app`;

/** 应用在 Info.plist 里的标识与版本等内容。 */
export function bundleInfoText(app: Exclude<DesktopAppManifest, { kind: 'system' }>): string {
  const runtime = runtimeOf(app);
  return infoPlist({
    name: app.name,
    identifier: app.bundleId,
    version: BUNDLE_VERSION,
    appId: app.id,
    ...(runtime ? { runtime } : {})
  });
}

/** 磁盘上 /Applications 顶层某个 `.app` 目录里读到的事实。 */
export interface BundleFacts {
  /** 目录名，例如 `Safari.app`。 */
  readonly dir: string;
  /** `Contents/Info.plist` 的文本；没有这个文件为 `null`。 */
  readonly infoText: string | null;
  /** 是否有 `Contents/PkgInfo`。 */
  readonly hasPkgInfo: boolean;
}

/** 系统拥有的投影：位于 /Applications 顶层、带清单标识的 `.app` 包。 */
export interface OwnedBundle {
  readonly dir: string;
  readonly appId: string;
  /** 是否由冻结的旧名单认领（plist 里还没有 `AiaoAppId`）。 */
  readonly legacy: boolean;
  readonly facts: BundleFacts;
}

/** 一项要对磁盘做的改动。 */
export type ProjectionOp =
  | { readonly op: 'create'; readonly appId: string; readonly dir: string }
  | { readonly op: 'rename'; readonly appId: string; readonly from: string; readonly to: string }
  | { readonly op: 'rewrite'; readonly appId: string; readonly dir: string; readonly claimed: boolean }
  | { readonly op: 'retire'; readonly appId: string; readonly dir: string };

/** 同名的非包条目占着位置：该应用没有包，仍可从其他入口打开。 */
export interface ProjectionConflict {
  readonly appId: string;
  /** 它想要的目录名。 */
  readonly dir: string;
  readonly reason: 'occupied' | 'rename-blocked';
}

export interface ProjectionPlan {
  readonly ops: readonly ProjectionOp[];
  readonly conflicts: readonly ProjectionConflict[];
  /** 执行完这些改动之后，系统拥有的包：目录名 → 应用 id。 */
  readonly owned: ReadonlyMap<string, string>;
}

const hasPlistIdentity = (info: ParsedBundleInfo): boolean => typeof info.identifier === 'string';

/**
 * 认出系统拥有的包。带 `AiaoAppId` 的按它认；没有的旧包（旧种子写的）凭冻结名单认领：目录名在名单里，
 * 且 plist 的 `CFBundleIdentifier` 就是旧种子写的那个。同一个应用有多个包时，名字等于清单里当前名字的那个算数，
 * 其余是用户复制出来的副本，不动它们。
 */
export function claimBundles(manifests: DesktopAppManifests, facts: readonly BundleFacts[]): OwnedBundle[] {
  const claimed: OwnedBundle[] = [];
  for (const bundle of facts) {
    if (bundle.infoText === null) continue;
    const info = parseInfoPlist(bundle.infoText);
    if (!hasPlistIdentity(info)) continue;
    const name = bundle.dir.replace(/\.app$/, '');
    const legacyId = LEGACY_APP_IDS[name];
    if (info.appId) claimed.push({ dir: bundle.dir, appId: info.appId, legacy: false, facts: bundle });
    else if (legacyId && info.identifier === legacyIdentifier(name))
      claimed.push({ dir: bundle.dir, appId: legacyId, legacy: true, facts: bundle });
  }
  const byApp = new Map<string, OwnedBundle[]>();
  for (const bundle of claimed) byApp.set(bundle.appId, [...(byApp.get(bundle.appId) ?? []), bundle]);
  return [...byApp].flatMap(([appId, bundles]) => {
    const manifest = (manifests as Readonly<Record<string, DesktopAppManifest | undefined>>)[appId];
    const canonical = manifest && bundleDirName(manifest);
    const preferred =
      bundles.find(bundle => bundle.dir === canonical) ?? [...bundles].sort((a, b) => a.dir.localeCompare(b.dir))[0];
    return [preferred];
  });
}

/**
 * 算出要让 /Applications 与清单一致需要做的改动（D-17）。幂等：已经一致时没有任何改动。
 *
 * - 缺的预装包：补出来；位置被同名的非包条目占着就让位，记为冲突；
 * - 显示名变了：同一 `appId` 的包随之改名（新名字被占着就保持原名，记为冲突）；
 * - Info.plist 与清单不一致（含旧包缺标识）：就地重写；
 * - 清单里已没有的应用（或不再显示在 Applications）：只退役系统写入的文件。
 *
 * 只处理系统拥有的包，不碰用户文件：复制到别处的包、同名的非包条目、包里用户放进去的文件都原样保留。
 *
 * @param manifests 应用清单
 * @param entries /Applications 顶层现有的条目
 * @param facts 顶层 `.app` 目录里读到的事实
 */
export function planProjection(
  manifests: DesktopAppManifests,
  entries: readonly DiskEntry[],
  facts: readonly BundleFacts[]
): ProjectionPlan {
  const names = new Set(entries.map(entry => entry.name));
  const owned = claimBundles(manifests, facts);
  const ownedByApp = new Map(owned.map(bundle => [bundle.appId, bundle]));
  const ops: ProjectionOp[] = [];
  const conflicts: ProjectionConflict[] = [];
  const result = new Map(owned.map(bundle => [bundle.dir, bundle.appId]));
  const wanted = Object.values(manifests).filter(
    (app): app is Exclude<DesktopAppManifest, { kind: 'system' }> => app.kind !== 'system' && app.showInApplications
  );

  for (const app of wanted) {
    const dir = bundleDirName(app);
    const existing = ownedByApp.get(app.id);
    if (!existing) {
      if (names.has(dir)) conflicts.push({ appId: app.id, dir, reason: 'occupied' });
      else {
        ops.push({ op: 'create', appId: app.id, dir });
        result.set(dir, app.id);
      }
      continue;
    }
    let current = existing.dir;
    if (existing.dir !== dir) {
      if (names.has(dir)) conflicts.push({ appId: app.id, dir, reason: 'rename-blocked' });
      else {
        ops.push({ op: 'rename', appId: app.id, from: existing.dir, to: dir });
        result.delete(existing.dir);
        result.set(dir, app.id);
        names.delete(existing.dir);
        names.add(dir);
        current = dir;
      }
    }
    if (existing.legacy || existing.facts.infoText !== bundleInfoText(app) || !existing.facts.hasPkgInfo)
      ops.push({ op: 'rewrite', appId: app.id, dir: current, claimed: existing.legacy });
  }

  const wantedIds = new Set<string>(wanted.map(app => app.id));
  for (const bundle of owned) {
    if (wantedIds.has(bundle.appId)) continue;
    ops.push({ op: 'retire', appId: bundle.appId, dir: bundle.dir });
    result.delete(bundle.dir);
  }
  return { ops, conflicts, owned: result };
}

const join = (dir: string, tail: readonly string[]): DiskPath => [...APPLICATIONS, dir, ...tail];

/** 把一项改动写进磁盘。 */
async function applyOp(store: DiskStore, manifests: DesktopAppManifests, op: ProjectionOp): Promise<void> {
  const encoder = new TextEncoder();
  const manifest = (manifests as Readonly<Record<string, DesktopAppManifest | undefined>>)[op.appId];
  const writeBundle = async (dir: string): Promise<void> => {
    if (!manifest || manifest.kind === 'system') throw new Error(`${op.appId} 不是有 .app 身份的应用`);
    await store.write(join(dir, INFO_PLIST), encoder.encode(bundleInfoText(manifest)));
    await store.write(join(dir, PKG_INFO), encoder.encode(PKG_INFO_TEXT));
  };
  switch (op.op) {
    case 'create':
    case 'rewrite':
      await writeBundle(op.dir);
      return;
    case 'rename':
      await store.move([...APPLICATIONS, op.from], [...APPLICATIONS, op.to]);
      return;
    case 'retire':
      await retireBundle(store, op.dir);
  }
}

/** 退役：只移除系统写入的文件；包里还有用户放进去的东西就保留为普通文件夹，否则整个目录一并移除。 */
async function retireBundle(store: DiskStore, dir: string): Promise<void> {
  await store.remove(join(dir, INFO_PLIST));
  await store.remove(join(dir, PKG_INFO));
  const contents = join(dir, ['Contents']);
  if ((await store.kindOf(contents)) === 'directory' && (await store.list(contents)).length === 0)
    await store.remove(contents);
  const bundle = [...APPLICATIONS, dir];
  if ((await store.kindOf(bundle)) === 'directory' && (await store.list(bundle)).length === 0)
    await store.remove(bundle);
}

/** 读 /Applications 顶层现有的条目与其中 `.app` 目录的事实。 */
export async function readApplications(store: DiskStore): Promise<{ entries: DiskEntry[]; facts: BundleFacts[] }> {
  await store.mkdir(APPLICATIONS);
  const entries = await store.list(APPLICATIONS);
  const decoder = new TextDecoder();
  const facts: BundleFacts[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'directory' || !entry.name.endsWith('.app')) continue;
    const info = join(entry.name, INFO_PLIST);
    const hasInfo = (await store.kindOf(info)) === 'file';
    facts.push({
      dir: entry.name,
      infoText: hasInfo ? decoder.decode(await store.read(info)) : null,
      hasPkgInfo: (await store.kindOf(join(entry.name, PKG_INFO))) === 'file'
    });
  }
  return { entries, facts };
}

/** 对账的结果：做了什么、哪些应用没有包、现在系统拥有哪些包。 */
export interface ProjectionReport extends ProjectionPlan {
  readonly changed: boolean;
}

/**
 * 让 /Applications 与清单一致：读现状、算改动、写进磁盘。首次建库、清单升级与抹掉磁盘后走同一条幂等路径。
 * 必须在 FileSystem 的串行队列里、用未加保护的存储调用（它自己就是写系统拥有的文件）。
 */
export async function reconcileApplications(
  store: DiskStore,
  manifests: DesktopAppManifests
): Promise<ProjectionReport> {
  const { entries, facts } = await readApplications(store);
  const plan = planProjection(manifests, entries, facts);
  for (const op of plan.ops) await applyOp(store, manifests, op);
  return { ...plan, changed: plan.ops.length > 0 };
}

/** 系统拥有的受保护路径：包目录、`Contents`、`Info.plist` 与 `PkgInfo`。用户放进包里的文件不在其中。 */
export function protectedPaths(owned: ReadonlyMap<string, string>): DiskPath[] {
  return [...owned.keys()].flatMap(dir => [
    join(dir, []),
    join(dir, ['Contents']),
    join(dir, INFO_PLIST),
    join(dir, PKG_INFO)
  ]);
}

/** 受保护的写操作。 */
export type ProtectedOperation =
  | { readonly kind: 'remove'; readonly path: DiskPath }
  | { readonly kind: 'move'; readonly from: DiskPath; readonly to: DiskPath }
  | { readonly kind: 'write'; readonly path: DiskPath };

const nameOf = (path: DiskPath): string => path.at(-1) ?? 'Macintosh HD';

/**
 * 这次写操作会不会动到系统拥有的投影；会就返回 Finder 风格的拒绝原因，否则 `null`（D-17）。
 * 递归操作（删除或移走一个包含受保护路径的目录，例如 /Applications 或它的祖先）同样被拦。
 */
export function protectionViolation(owned: ReadonlyMap<string, string>, operation: ProtectedOperation): string | null {
  const protectedSet = protectedPaths(owned);
  const touches = (path: DiskPath): DiskPath | undefined => protectedSet.find(item => isWithin(item, path));
  if (operation.kind === 'write') {
    const hit = protectedSet.find(item => samePath(item, operation.path));
    return hit ? `The item “${nameOf(hit)}” can’t be changed because it’s part of a preinstalled application.` : null;
  }
  const source = operation.kind === 'remove' ? operation.path : operation.from;
  const hit = touches(source);
  if (hit) {
    const verb = operation.kind === 'remove' ? 'removed' : 'moved';
    const itself = protectedSet.some(item => samePath(item, source));
    return itself ?
        `The item “${nameOf(source)}” can’t be ${verb} because it’s part of a preinstalled application.`
      : `The item “${nameOf(source)}” can’t be ${verb} because it contains preinstalled applications.`;
  }
  if (operation.kind === 'move' && touches(operation.to))
    return `“${nameOf(operation.to)}” can’t be replaced because it’s part of a preinstalled application.`;
  return null;
}

/** 受保护时抛 `EACCES`，供存储层的最后一道防线用。 */
export function assertUnprotected(owned: ReadonlyMap<string, string>, operation: ProtectedOperation): void {
  const reason = protectionViolation(owned, operation);
  if (reason) throw new DiskError('EACCES', operation.kind === 'move' ? operation.from : operation.path, reason);
}
