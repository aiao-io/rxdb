import { Service, computed, inject, signal } from '@angular/core';

import {
  APPLICATIONS,
  ProjectionConflict,
  ProjectionReport,
  protectionViolation,
  reconcileApplications
} from '../disk/application-projection';
import { DiskPath } from '../disk/disk-path';
import { DiskStore } from '../disk/disk-store';
import { parseInfoPlist } from '../disk/formats/plist';
import { DESKTOP_APPS, DesktopAppId, DesktopAppManifest } from './desktop-apps';

/** 打开一个 `.app` 包得到的结果。 */
export type BundleResolution =
  | { readonly kind: 'app'; readonly id: DesktopAppId }
  /** 包带着清单标识，但清单里已经没有这个应用（应用已下线）。 */
  | { readonly kind: 'offline'; readonly name: string }
  /** 不是桌面认识的程序包。 */
  | { readonly kind: 'unknown' };

/**
 * 应用目录服务（ADESK-US-205，D-17）：应用清单是唯一真相源，/Applications 里的 `.app` 是它的系统投影。
 * 首次建库、清单升级、抹掉磁盘后，{@link reconcile} 走同一条幂等路径把包补齐、改名、更新或退役；
 * 保护判断（预装包不能删、不能移、不能改名、不能覆盖）也从这里出，FileSystem、终端回写与 Finder 共用一条规则。
 *
 * 系统拥有的包 = 位于 /Applications 顶层、带清单标识（`AiaoAppId`）的 `.app` 目录。用户复制到别处的包、
 * 同名的非包条目、包里用户放进去的文件都是用户文件，不受清单变化和保护规则影响。
 */
@Service({ autoProvided: false })
export class ApplicationCatalog {
  private readonly manifests = inject(DESKTOP_APPS);
  private readonly ownedState = signal<ReadonlyMap<string, string>>(new Map());
  private readonly conflictState = signal<readonly ProjectionConflict[]>([]);

  /** 系统拥有的包：目录名（例如 `Safari.app`）→ 应用 id。 */
  readonly owned = this.ownedState.asReadonly();
  /** 因为同名的非包条目占着位置而没有包的应用；它们仍可从启动台、聚焦搜索和 Dock 打开。 */
  readonly conflicts = this.conflictState.asReadonly();
  /** Finder 在 Applications 里显示的说明；没有冲突时为 `null`。 */
  readonly conflictNote = computed(() => {
    const conflicts = this.conflictState();
    if (!conflicts.length) return null;
    const names = conflicts.map(conflict => conflict.dir).join('、');
    return `${names} can’t be shown here because an item with the same name already exists. The application can still be opened from Launchpad, Spotlight and the Dock.`;
  });

  /**
   * 让 /Applications 与清单一致；在 FileSystem 的串行队列里、用未加保护的存储调用。
   * 返回的报告同时更新本服务的 `owned` 与 `conflicts`。
   */
  async reconcile(store: DiskStore): Promise<ProjectionReport> {
    const report = await reconcileApplications(store, this.manifests);
    this.ownedState.set(report.owned);
    this.conflictState.set(report.conflicts);
    return report;
  }

  /** 保护判断用：现在系统拥有的包。 */
  ownedPackages(): ReadonlyMap<string, string> {
    return this.ownedState();
  }

  /** 这条写操作会动到预装应用时返回拒绝原因（Finder 风格的一句话），否则 `null`。 */
  violation(operation: Parameters<typeof protectionViolation>[1]): string | null {
    return protectionViolation(this.ownedState(), operation);
  }

  /** /Applications 顶层系统拥有的包对应的应用 id（只看路径，不看显示名）；别的节点为 `null`。 */
  appIdAt(path: DiskPath | null): DesktopAppId | null {
    if (!path || path.length !== APPLICATIONS.length + 1 || path[0] !== APPLICATIONS[0]) return null;
    const id = this.ownedState().get(path[1]);
    return id && id in this.manifests ? (id as DesktopAppId) : null;
  }

  /** 包路径是系统拥有的预装包时的应用 id。 */
  appIdOf(node: { readonly path: DiskPath | null }): DesktopAppId | null {
    return this.appIdAt(node.path);
  }

  /** 应用在 Applications 里的包目录名；没有包（同名冲突、不在 Applications）时为 `null`。 */
  packageOf(id: DesktopAppId): string | null {
    for (const [dir, appId] of this.ownedState()) if (appId === id) return dir;
    return null;
  }

  /**
   * 解析任意一个 `.app` 包：系统拥有的包按路径回到清单；用户复制到别处的包读 `Info.plist` 里的标识，
   * 清单里有就按标识启动同一个应用，清单里已没有就是「应用已下线」，不去猜显示名。
   *
   * @param node 包节点
   * @param read 读文件（FileSystem 的 `readText`）
   */
  async resolve(
    node: { readonly name: string; readonly path: DiskPath | null },
    read: (path: DiskPath) => Promise<string>
  ): Promise<BundleResolution> {
    const owned = this.appIdOf(node);
    if (owned) return { kind: 'app', id: owned };
    if (!node.path) return { kind: 'unknown' };
    const info = parseInfoPlist(await read([...node.path, 'Contents', 'Info.plist']).catch(() => ''));
    if (!info.appId) return { kind: 'unknown' };
    const manifest = this.manifestOf(info.appId);
    return manifest ?
        { kind: 'app', id: manifest.id }
      : { kind: 'offline', name: info.name ?? node.name.replace(/\.app$/i, '') };
  }

  /** 按应用 id、包标识或显示名找清单里的应用（终端的 `open -a` 与 `-b` 用）；显示名只在没有 id/标识命中时才比。 */
  find(query: string): DesktopAppManifest | null {
    const lowered = query.replace(/\.app$/i, '').toLowerCase();
    const apps = Object.values(this.manifests).filter(app => app.kind !== 'system');
    return (
      apps.find(app => app.id === query) ??
      apps.find(app => app.bundleId.toLowerCase() === lowered) ??
      apps.find(app => app.name.toLowerCase() === lowered) ??
      null
    );
  }

  private manifestOf(id: string): DesktopAppManifest | null {
    return id in this.manifests ? this.manifests[id as DesktopAppId] : null;
  }
}
