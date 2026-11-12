import { Component, inject } from '@angular/core';

import { SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';
import { Slider } from '../../../shared/slider';
import { ToggleSwitch } from '../toggle-switch';

/** 声音：输出音量写回系统（与菜单栏、音乐共用），其余只是摆设。 */
@Component({
  selector: 'app-sound-pane',
  imports: [Icon, Slider, ToggleSwitch],
  host: { style: 'display: contents' },
  template: `
    <div class="st-label">Output &amp; Input</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Output volume</div>
        <div class="rt">
          <svg appIcon="g-vol-lo"></svg>
          <app-slider
            [value]="system.volume()"
            (valueChange)="system.setVolume($event)"
            data-slider="svol"
            style="max-width: 220px"
          />
          <svg appIcon="g-vol-hi"></svg>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Mute</div>
        <div class="rt"><div [appSwitch]="system.muted()" data-k="mute"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Show Sound in menu bar</div>
        <div class="rt">
          <button class="btn">Always <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
    </div>
    <div class="st-label">Sound Effects</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Alert sound</div>
        <div class="rt">
          <button class="btn">Boop <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Play sound on startup</div>
        <div class="rt"><div [appSwitch]="true" data-k="boot"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Play user-interface sound effects</div>
        <div class="rt"><div [appSwitch]="true" data-k="ui"></div></div>
      </div>
    </div>
    <div class="st-label">Output device</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb" style="min-width: 0; flex: 1">
          MacBook Pro Speakers
          <div class="hint">Built‑in · 6 speakers</div>
        </div>
        <div class="rt" style="color: var(--blue)"><svg appIcon="g-check"></svg></div>
      </div>
      <div class="st-item">
        <div class="lb" style="min-width: 0; flex: 1">
          AirPods Pro
          <div class="hint">Bluetooth</div>
        </div>
      </div>
    </div>
  `
})
export class SoundPane {
  protected readonly system = inject(SystemState);
}
