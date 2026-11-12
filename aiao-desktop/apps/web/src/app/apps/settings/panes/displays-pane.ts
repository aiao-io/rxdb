import { Component, inject } from '@angular/core';

import { SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';
import { Slider } from '../../../shared/slider';
import { ToggleSwitch } from '../toggle-switch';

/** 显示器：亮度写回系统，其余只是摆设；分辨率是打开面板那一刻的窗口大小。 */
@Component({
  selector: 'app-displays-pane',
  imports: [Icon, Slider, ToggleSwitch],
  host: { style: 'display: contents' },
  template: `
    <div class="st-label">Built‑in Liquid Retina XDR Display</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Brightness</div>
        <div class="rt">
          <svg appIcon="g-sun"></svg>
          <app-slider
            [value]="system.brightness()"
            (valueChange)="system.setBrightness($event)"
            data-slider="sbri"
            style="max-width: 220px"
          />
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Automatically adjust brightness</div>
        <div class="rt"><div [appSwitch]="true" data-k="autob"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">True Tone</div>
        <div class="rt"><div [appSwitch]="true" data-k="tt"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Refresh rate</div>
        <div class="rt">
          <button class="btn">ProMotion (120 Hz) <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Resolution</div>
        <div class="rt">
          <button class="btn">{{ resolution }} (Default) <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
    </div>
    <div class="st-label">Colour</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Colour profile</div>
        <div class="rt">
          <button class="btn">Apple XDR Display (P3‑1600 nits) <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Night Shift</div>
        <div class="rt">
          <span style="font-size: 12px; color: var(--txt-2)">Off</span><svg appIcon="g-chev-r"></svg>
        </div>
      </div>
    </div>
  `
})
export class DisplaysPane {
  protected readonly system = inject(SystemState);
  protected readonly resolution = `${innerWidth} × ${innerHeight}`;
}
