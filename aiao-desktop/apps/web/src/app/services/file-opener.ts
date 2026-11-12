import { Service, inject } from '@angular/core';

import { DESKTOP_APPS, DesktopAppId } from './desktop-apps';
import { FsNode } from './file-system';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

/** 按扩展名把文件交给对应应用打开（Finder 与聚焦搜索共用）。 */
@Service({ autoProvided: false })
export class FileOpener {
  private readonly apps = inject(DESKTOP_APPS);
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);

  open(node: FsNode): void {
    const name = node.name.toLowerCase();
    if (name.endsWith('.app')) {
      this.openBundle(node.name);
      return;
    }
    if (/\.(txt|md|swift|ts|html|json)$/.test(name)) {
      this.wm.open('textedit', { file: node.name, node });
      return;
    }
    if (/\.(png|jpe?g|heic|pdf|key|numbers|mp4|mov)$/.test(name)) {
      this.wm.open('preview', { file: node.name, node });
      return;
    }
    if (/\.(mp3|wav)$/.test(name)) {
      this.wm.open('music');
      return;
    }
    this.toast.show(`No application can open “${node.name}”`);
  }

  private openBundle(fileName: string): void {
    const appName = fileName.replace(/\.app$/i, '').toLowerCase();
    const id = (Object.keys(this.apps) as DesktopAppId[]).find(key => this.apps[key].name.toLowerCase() === appName);
    if (id) this.wm.open(id);
    else this.toast.show(`${fileName} cannot open on this Mac.`);
  }
}
