import { Component, computed, inject } from '@angular/core';

import { PopoverService } from '../../../services/popover';
import { ALERT_SOUNDS, AlertSoundKey, SystemSettingsStore } from '../../../services/system-settings';
import { SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';
import { Slider } from '../../../shared/slider';
import { ToggleSwitch } from '../toggle-switch';

const ALERT_SOUND_LABELS: Readonly<Record<AlertSoundKey, string>> = {
  boop: 'Boop',
  basso: 'Basso',
  blow: 'Blow',
  bottle: 'Bottle',
  frog: 'Frog',
  funk: 'Funk',
  glass: 'Glass',
  hero: 'Hero',
  morse: 'Morse',
  ping: 'Ping',
  pop: 'Pop',
  purr: 'Purr',
  sosumi: 'Sosumi',
  submarine: 'Submarine',
  tink: 'Tink'
};

/** 声音：输出音量、静音、提示音选择与界面音效开关都写回系统设置并持久化。 */
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
            label="Output volume"
            style="max-width: 220px"
          />
          <svg appIcon="g-vol-hi"></svg>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Mute</div>
        <div class="rt"><div [(appSwitch)]="system.muted" data-k="mute"></div></div>
      </div>
    </div>
    <div class="st-label">Sound Effects</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Alert sound</div>
        <div class="rt">
          <button class="btn" #sound (click)="pickAlertSound(sound)" data-pick="alertSound">
            {{ alertLabel() }} <svg appIcon="g-chev-d"></svg>
          </button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Play user-interface sound effects</div>
        <div class="rt"><div [(appSwitch)]="settings.uiSounds" data-k="ui"></div></div>
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
  private readonly popover = inject(PopoverService);

  protected readonly system = inject(SystemState);
  protected readonly settings = inject(SystemSettingsStore);
  protected readonly alertLabel = computed(() => ALERT_SOUND_LABELS[this.settings.alertSound()]);

  /** 提示音是真正的选择：选中的音色写回系统设置（没有真实播放）。 */
  protected pickAlertSound(anchor: Element): void {
    this.popover.menuUnder(
      anchor,
      ALERT_SOUNDS.map(id => ({
        id,
        label: ALERT_SOUND_LABELS[id],
        checked: this.settings.alertSound() === id,
        run: () => this.settings.alertSound.set(id)
      }))
    );
  }
}
