import { Service, computed, inject } from '@angular/core';
import { Preferences } from '../data/preferences';

import { extensionOf, isPackageName, isTextName } from '../disk/disk-kinds';
import { AppLauncher } from './app-launcher';
import { ApplicationCatalog } from './application-catalog';
import { ApplicationRegistry } from './application-registry';
import { DesktopAppId } from './desktop-apps';
import { FileSystem, FsNode } from './file-system';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

const PREVIEW = new Set(['png', 'jpg', 'jpeg', 'heic', 'pdf', 'key', 'numbers', 'mp4', 'mov']);
const MUSIC = new Set(['mp3', 'wav']);

/** 「打开方式」关联的偏好键（D-28）：值是小写扩展名到应用 id 的记录。 */
export const OPEN_WITH_KEY = 'open-with:associations';

const isAssociations = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(appId => typeof appId === 'string');

/** 没有关联键时的固定空对象：别在 computed 里现造（每次重算换新引用会拖累下游重算）。 */
const NO_ASSOCIATIONS: Readonly<Record<string, string>> = Object.freeze({});

/** 「打开方式」候选：能真正接收这类文件的应用，id 加显示名。 */
export interface OpenWithChoice {
  readonly id: DesktopAppId;
  readonly name: string;
}

/**
 * 把文件或应用包交给对应应用打开（Finder、桌面、聚焦搜索与终端的 `open` 共用）。
 *
 * 应用包按稳定标识打开（D-17）：系统拥有的包按路径回到清单，复制到别处的包读 Info.plist 里的标识，
 * 不再拿显示名去匹配——显示名变了或有同名文件都不会打开错的应用；清单里已没有它的包提示「应用已下线」。
 *
 * 普通文件按扩展名分派；用户在「打开方式」里存过的关联（D-28，扩展名 → 应用 id）覆盖内置默认，
 * 双击、回车、聚焦搜索与终端 `open` 都在这里查它。
 */
@Service({ autoProvided: false })
export class FileOpener {
  private readonly apps = inject(ApplicationRegistry).apps;
  private readonly wm = inject(WindowManager);
  private readonly fs = inject(FileSystem);
  private readonly toast = inject(Toast);
  private readonly catalog = inject(ApplicationCatalog);
  private readonly launcher = inject(AppLauncher);
  private readonly preferences = inject(Preferences);
  private readonly associations = computed(() => this.preferences.get(OPEN_WITH_KEY, isAssociations) ?? NO_ASSOCIATIONS);

  /** 只显示已实现文档传入的应用，默认应用排第一；不把文件夹和程序包伪装成文档。 */
  choices(node: FsNode): readonly OpenWithChoice[] {
    if (node.kind !== 'file' || isPackageName(node.name)) return [];
    const candidates = this.candidatesOf(node);
    const associated = this.associations()[extensionOf(node.name)];
    const order =
      associated && candidates.includes(associated as DesktopAppId) ?
        [associated as DesktopAppId, ...candidates.filter(id => id !== associated)]
      : candidates;
    return order.map(id => ({ id, name: this.apps()[id].name }));
  }

  open(node: FsNode): void {
    if (isPackageName(node.name)) {
      void this.launchPackage(node);
      return;
    }
    const candidates = this.candidatesOf(node);
    const associated = this.associations()[extensionOf(node.name)];
    if (associated && candidates.includes(associated as DesktopAppId)) {
      if (node.path) this.fs.noteOpened(node.path);
      this.wm.open(associated as DesktopAppId, { file: node.name, node });
      return;
    }
    const [preferred] = candidates;
    if (preferred) {
      if (node.path) this.fs.noteOpened(node.path);
      this.wm.open(preferred, { file: node.name, node });
      return;
    }
    /* 打不开的文件不进「最近使用」：像 macOS 一样，只有真正交给应用打开的才记。 */
    if (MUSIC.has(extensionOf(node.name))) this.wm.open('music');
    else this.toast.show(`No application can open “${node.name}”`);
  }

  /**
   * 用指定应用（按应用 id）打开：TextEdit、预览与 Safari 带上文件，其余应用只是启动。
   * 返回是否找到了这个应用；终端的 `open -a` / `-b` 在虚拟机里已经把名字或包标识解析成了 id。
   */
  openApp(id: string, node: FsNode | null): boolean {
    if (!(id in this.apps()) || this.apps()[id as DesktopAppId].kind === 'system') {
      this.toast.show(`Unable to find application “${id}”`);
      return false;
    }
    const appId = id as DesktopAppId;
    if (node && (appId === 'textedit' || appId === 'preview' || appId === 'safari')) {
      if (node.path) this.fs.noteOpened(node.path);
      this.wm.open(appId, { file: node.name, node });
    } else this.launcher.activate(appId);
    return true;
  }

  /** 把这类文件的默认打开应用存进本地偏好；只有能接收该文件的应用才接受。 */
  setDefaultApp(node: FsNode, appId: string): Promise<void> {
    if (!this.candidatesOf(node).includes(appId as DesktopAppId)) {
      const name = this.apps()[appId as DesktopAppId]?.name ?? appId;
      return Promise.reject(new Error(`“${name}” can’t open ${node.name} files.`));
    }
    const extension = extensionOf(node.name);
    return this.preferences.update(OPEN_WITH_KEY, isAssociations, current => ({ ...current, [extension]: appId }));
  }

  /** 能真正接收这类文件的应用：html 归 Safari 与 TextEdit，文本类归 TextEdit，图片/PDF/影片归预览。 */
  private candidatesOf(node: FsNode): readonly DesktopAppId[] {
    const extension = extensionOf(node.name);
    if (extension === 'html') return ['safari', 'textedit'];
    if (isTextName(node.name)) return ['textedit'];
    if (PREVIEW.has(extension)) return ['preview'];
    return [];
  }

  private async launchPackage(node: FsNode): Promise<void> {
    const resolution = await this.catalog.resolve(node, path => this.fs.readText(path));
    if (resolution.kind === 'app') this.launcher.activate(resolution.id);
    else if (resolution.kind === 'offline')
      this.toast.show(`The application “${resolution.name}” is no longer available.`);
    else this.toast.show(`${node.name} cannot open on this Mac.`);
  }
}
