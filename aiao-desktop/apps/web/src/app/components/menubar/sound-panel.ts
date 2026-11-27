import { Component } from '@angular/core';

import { Icon } from '../../shared/icon';
import { Slider } from '../../shared/slider';
import { StatusPanel } from './status-panel';

/** 声音面板（`dialog`）：音量滑块能用方向键调节。 */
@Component({
  selector: 'app-sound-panel',
  imports: [Icon, Slider],
  host: {
    class: 'panel',
    role: 'dialog',
    '[attr.aria-label]': "i18n.t('settings.section.sound')",
    style: 'min-width: 270px'
  },
  template: `
    <h4>{{ i18n.t('settings.section.sound') }}</h4>
    <div class="row" style="height: 30px; gap: 11px">
      <span style="color: var(--txt-2)"><svg appIcon="g-vol-lo" style="width: 15px; height: 15px"></svg></span>
      <app-slider
        [label]="i18n.t('shell.menuBar.volume')"
        [value]="system.volume()"
        (valueChange)="system.setVolume($event)"
        data-slider="vol"
      />
      <span style="color: var(--txt-2)"><svg appIcon="g-vol-hi" style="width: 15px; height: 15px"></svg></span>
    </div>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">{{ i18n.t('shell.menuBar.output') }}</div>
    <div class="row on">
      <span style="width: 15px; color: var(--blue)"
        ><svg appIcon="g-check" style="width: 15px; height: 15px"></svg
      ></span>
      <span class="nm">MacBook Pro Speakers</span>
    </div>
    <div class="row"><span style="width: 15px"></span><span class="nm">AirPods Pro</span></div>
    <div class="sep"></div>
    <button class="row" (click)="openSettings('sound')" data-ss tabindex="0" type="button">
      <span class="nm">{{ i18n.t('shell.menuBar.soundSettings') }}</span>
    </button>
  `
})
export class SoundPanel extends StatusPanel {}
