import { Component, ViewEncapsulation, computed, inject } from '@angular/core';

import { FilePanels } from '../services/file-panels';
import { WindowManager } from '../services/window-manager';
import { FilePanel } from './file-panel';
import { WindowFrame } from './window-frame';

/** 窗口层：按窗口管理器的列表渲染窗口框架，并在最上面承载应用请求的打开 / 保存面板（模态）。 */
@Component({
  selector: 'app-window-layer',
  imports: [WindowFrame, FilePanel],
  templateUrl: './window-layer.html',
  styleUrl: './window-layer.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class WindowLayer {
  protected readonly wm = inject(WindowManager);
  protected readonly panels = inject(FilePanels);
  /** 最上面的面板（没有就是空）：包成列表是为了让每个面板各自重建组件，不复用上一个面板的状态。 */
  protected readonly panelStack = computed(() => {
    const top = this.panels.current();
    return top ? [top] : [];
  });
}
