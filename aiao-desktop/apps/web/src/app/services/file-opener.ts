import { Service, inject } from '@angular/core';

import { extensionOf, isPackageName, isTextName } from '../disk/disk-kinds';
import { DESKTOP_APPS, DesktopAppId } from './desktop-apps';
import { FileSystem, FsNode } from './file-system';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

const PREVIEW = new Set(['png', 'jpg', 'jpeg', 'heic', 'pdf', 'key', 'numbers', 'mp4', 'mov']);
const MUSIC = new Set(['mp3', 'wav']);

/** 按扩展名把文件交给对应应用打开（Finder、桌面、聚焦搜索与终端的 `open` 共用）。 */
@Service({ autoProvided: false })
export class FileOpener {
  private readonly apps = inject(DESKTOP_APPS);
  private readonly wm = inject(WindowManager);
  private readonly fs = inject(FileSystem);
  private readonly toast = inject(Toast);

  open(node: FsNode): void {
    if (isPackageName(node.name)) {
      this.launch(node.name.replace(/\.app$/i, ''));
      return;
    }
    if (node.path) this.fs.noteOpened(node.path);
    const extension = extensionOf(node.name);
    if (isTextName(node.name)) this.wm.open('textedit', { file: node.name, node });
    else if (PREVIEW.has(extension)) this.wm.open('preview', { file: node.name, node });
    else if (MUSIC.has(extension)) this.wm.open('music');
    else this.toast.show(`No application can open “${node.name}”`);
  }

  /** 用指定应用打开：TextEdit 与预览带上文件，其余应用只是启动。返回是否找到了应用。 */
  openWith(appName: string, node: FsNode | null): boolean {
    const id = this.appId(appName);
    if (!id) return false;
    if (node && (id === 'textedit' || id === 'preview')) {
      if (node.path) this.fs.noteOpened(node.path);
      this.wm.open(id, { file: node.name, node });
    } else this.wm.open(id);
    return true;
  }

  private launch(appName: string): void {
    if (!this.openWith(appName, null)) this.toast.show(`${appName}.app cannot open on this Mac.`);
  }

  private appId(appName: string): DesktopAppId | undefined {
    const name = appName.toLowerCase();
    return (Object.keys(this.apps) as DesktopAppId[]).find(key => this.apps[key].name.toLowerCase() === name);
  }
}
