import { Component, inject, signal } from '@angular/core';

import { SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';
import { Slider } from '../../../shared/slider';
import { ToggleSwitch } from '../toggle-switch';

/** Dock 尺寸滑块的取值范围：34～78px。 */
const SIZE_MIN = 34;
const SIZE_SPAN = 44;
/** 放大倍数的取值范围：1～1.9 倍。 */
const MAG_SPAN = 0.9;

/** 桌面与 Dock：大小、放大、位置，以及一些只改外观的开关。Dock 自己监听系统状态。 */
@Component({
  selector: 'app-dock-pane',
  imports: [Icon, Slider, ToggleSwitch],
  host: { style: 'display: contents' },
  template: `
    <div class="st-label">Dock</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Size</div>
        <div class="rt">
          <span style="font-size: 11px; color: var(--txt-2)">Small</span>
          <app-slider [value]="size()" (valueChange)="resize($event)" data-slider="dsize" style="max-width: 220px" />
          <span style="font-size: 11px; color: var(--txt-2)">Large</span>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Magnification</div>
        <div class="rt">
          <span style="font-size: 11px; color: var(--txt-2)">Off</span>
          <app-slider
            [value]="(system.dockMag() - 1) / magSpan"
            (valueChange)="magnify($event)"
            data-slider="dmag"
            style="max-width: 220px"
          />
          <span style="font-size: 11px; color: var(--txt-2)">Large</span>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Enable magnification</div>
        <div class="rt"><div [(appSwitch)]="system.dockMagOn" data-k="mag"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Position on screen</div>
        <div class="rt">
          <button class="btn">Bottom <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Minimise using</div>
        <div class="rt">
          <button class="btn">Genie Effect <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Animate opening apps</div>
        <div class="rt"><div [appSwitch]="true" data-k="anim"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Show indicators for open applications</div>
        <div class="rt"><div [appSwitch]="true" data-k="ind"></div></div>
      </div>
    </div>
    <div class="st-label">Desktop &amp; Stage Manager</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Show items</div>
        <div class="rt">
          <span style="font-size: 12px; color: var(--txt-2)">On Desktop</span>
          <div [appSwitch]="true" data-k="items"></div>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Click wallpaper to reveal desktop</div>
        <div class="rt">
          <button class="btn">Only in Stage Manager <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
    </div>
    <div class="st-label">Windows</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Tiled windows have margins</div>
        <div class="rt"><div [appSwitch]="true" data-k="marg"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Drag windows to screen edges to tile</div>
        <div class="rt"><div [appSwitch]="true" data-k="tile"></div></div>
      </div>
    </div>
  `
})
export class DockPane {
  protected readonly system = inject(SystemState);
  protected readonly magSpan = MAG_SPAN;
  /** 滑块位置只在面板创建时取一次：Dock 尺寸取整后写回，旋钮不该跟着一格一格跳。 */
  protected readonly size = signal((this.system.dockSize() - SIZE_MIN) / SIZE_SPAN);

  protected resize(fraction: number): void {
    this.size.set(fraction);
    this.system.dockSize.set(Math.round(SIZE_MIN + fraction * SIZE_SPAN));
  }

  /** 拖动放大滑块会顺带把放大打开。 */
  protected magnify(fraction: number): void {
    this.system.dockMag.set(1 + fraction * MAG_SPAN);
    this.system.dockMagOn.set(true);
  }
}
