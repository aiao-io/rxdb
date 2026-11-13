import { Service, inject } from '@angular/core';

import { extensionOf, isPackageName, isTextName } from '../disk/disk-kinds';
import { AppLauncher } from './app-launcher';
import { ApplicationCatalog } from './application-catalog';
import { DESKTOP_APPS, DesktopAppId } from './desktop-apps';
import { FileSystem, FsNode } from './file-system';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

const PREVIEW = new Set(['png', 'jpg', 'jpeg', 'heic', 'pdf', 'key', 'numbers', 'mp4', 'mov']);
const MUSIC = new Set(['mp3', 'wav']);

/**
 * 把文件或应用包交给对应应用打开（Finder、桌面、聚焦搜索与终端的 `open` 共用）。
 *
 * 应用包按稳定标识打开（D-17）：系统拥有的包按路径回到清单，复制到别处的包读 Info.plist 里的标识，
 * 不再拿显示名去匹配——显示名变了或有同名文件都不会打开错的应用；清单里已没有它的包提示「应用已下线」。
 */
@Service({ autoProvided: false })
export class FileOpener {
  private readonly apps = inject(DESKTOP_APPS);
  private readonly wm = inject(WindowManager);
  private readonly fs = inject(FileSystem);
  private readonly toast = inject(Toast);
  private readonly catalog = inject(ApplicationCatalog);
  private readonly launcher = inject(AppLauncher);

  open(node: FsNode): void {
    if (isPackageName(node.name)) {
      void this.launchPackage(node);
      return;
    }
    if (node.path) this.fs.noteOpened(node.path);
    const extension = extensionOf(node.name);
    if (isTextName(node.name)) this.wm.open('textedit', { file: node.name, node });
    else if (PREVIEW.has(extension)) this.wm.open('preview', { file: node.name, node });
    else if (MUSIC.has(extension)) this.wm.open('music');
    else this.toast.show(`No application can open “${node.name}”`);
  }

  /**
   * 用指定应用（按应用 id）打开：TextEdit 与预览带上文件，其余应用只是启动。
   * 返回是否找到了这个应用；终端的 `open -a` / `-b` 在虚拟机里已经把名字或包标识解析成了 id。
   */
  openApp(id: string, node: FsNode | null): boolean {
    if (!(id in this.apps) || this.apps[id as DesktopAppId].kind === 'system') {
      this.toast.show(`Unable to find application “${id}”`);
      return false;
    }
    const appId = id as DesktopAppId;
    if (node && (appId === 'textedit' || appId === 'preview')) {
      if (node.path) this.fs.noteOpened(node.path);
      this.wm.open(appId, { file: node.name, node });
    } else this.launcher.activate(appId);
    return true;
  }

  private async launchPackage(node: FsNode): Promise<void> {
    const resolution = await this.catalog.resolve(node, path => this.fs.readText(path));
    if (resolution.kind === 'app') this.launcher.activate(resolution.id);
    else if (resolution.kind === 'offline') this.toast.show(`The application “${resolution.name}” is no longer available.`);
    else this.toast.show(`${node.name} cannot open on this Mac.`);
  }
}
