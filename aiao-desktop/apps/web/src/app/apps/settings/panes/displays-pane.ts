import { Component, inject } from '@angular/core';

import { SystemSettingsStore } from '../../../services/system-settings';
import { SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';
import { Slider } from '../../../shared/slider';
import { ToggleSwitch } from '../toggle-switch';

/** 显示器：亮度、自动亮度与 True Tone 写回系统设置并持久化；色彩文件与 Night Shift 是静态信息。 */
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
            label="Brightness"
            style="max-width: 220px"
          />
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Automatically adjust brightness</div>
        <div class="rt"><div [(appSwitch)]="settings.autoBrightness" data-k="autob"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">True Tone</div>
        <div class="rt"><div [(appSwitch)]="settings.trueTone" data-k="tt"></div></div>
      </div>
    </div>
    <div class="st-label">Colour</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Colour profile</div>
        <div class="rt"><span style="font-size: 12px; color: var(--txt-2)">Apple XDR Display (P3‑1600 nits)</span></div>
      </div>
      <div class="st-item">
        <div class="lb">Night Shift</div>
        <div class="rt"><span style="font-size: 12px; color: var(--txt-2)">Off</span></div>
      </div>
    </div>
  `
})
export class DisplaysPane {
  protected readonly system = inject(SystemState);
  protected readonly settings = inject(SystemSettingsStore);
}
