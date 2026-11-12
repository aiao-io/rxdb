import { Component, ViewEncapsulation, inject } from '@angular/core';

import { WindowManager } from '../services/window-manager';
import { WindowFrame } from './window-frame';

/** 窗口层：按窗口管理器的列表渲染窗口框架。 */
@Component({
  selector: 'app-window-layer',
  imports: [WindowFrame],
  templateUrl: './window-layer.html',
  styleUrl: './window-layer.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class WindowLayer {
  protected readonly wm = inject(WindowManager);
}
