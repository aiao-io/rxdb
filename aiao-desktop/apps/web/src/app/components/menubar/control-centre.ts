import { Component, inject, signal } from '@angular/core';

import { SystemState } from '../../services/system-state';
import { ThemeService } from '../../services/theme';
import { Icon } from '../../shared/icon';
import { Slider } from '../../shared/slider';

/** 控制中心：Wi‑Fi、蓝牙、深色模式开关与亮度、音量滑块。 */
@Component({
  selector: 'app-control-centre',
  imports: [Icon, Slider],
  host: { class: 'panel cc', style: 'min-width: 0; width: 302px; padding: 12px' },
  template: `
    <div class="cc-grid">
      <div class="cc-tile" style="grid-column: span 2">
        <div
          class="cc-row"
          (click)="system.wifi.set(!system.wifi())"
          (keydown.enter)="system.wifi.set(!system.wifi())"
          data-t="wifi"
          tabindex="-1"
        >
          <i class="cc-b" [class.on]="system.wifi()"><svg appIcon="g-wifi" style="width: 15px; height: 15px"></svg></i>
          <div>
            <b>Wi‑Fi</b><span>{{ system.wifi() ? system.wifiName() : 'Off' }}</span>
          </div>
        </div>
        <div
          class="cc-row"
          (click)="system.bluetooth.set(!system.bluetooth())"
          (keydown.enter)="system.bluetooth.set(!system.bluetooth())"
          data-t="bt"
          tabindex="-1"
        >
          <i class="cc-b" [class.on]="system.bluetooth()"
            ><svg appIcon="g-bt" style="width: 15px; height: 15px"></svg
          ></i>
          <div>
            <b>Bluetooth</b><span>{{ system.bluetooth() ? 'On' : 'Off' }}</span>
          </div>
        </div>
        <div
          class="cc-row"
          (click)="airdrop.set(airdrop() === 'off' ? 'on' : 'off')"
          (keydown.enter)="airdrop.set(airdrop() === 'off' ? 'on' : 'off')"
          data-t="ad"
          tabindex="-1"
        >
          <i class="cc-b" [class.on]="airdrop() !== 'off'"
            ><svg appIcon="g-airdrop" style="width: 15px; height: 15px"></svg
          ></i>
          <div>
            <b>AirDrop</b
            ><span>{{
              airdrop() === 'contacts' ? 'Contacts Only'
              : airdrop() === 'on' ? 'On'
              : 'Off'
            }}</span>
          </div>
        </div>
      </div>
      <div class="cc-tile" style="grid-column: span 2">
        <div
          class="cc-row"
          (click)="focus.set(!focus())"
          (keydown.enter)="focus.set(!focus())"
          data-t="focus"
          tabindex="-1"
        >
          <i class="cc-b" [class.on]="focus()"><svg appIcon="g-moon" style="width: 15px; height: 15px"></svg></i>
          <div>
            <b>Focus</b><span>{{ focus() ? 'On' : 'Off' }}</span>
          </div>
        </div>
      </div>
      <div class="cc-tile" style="grid-column: span 1">
        <div class="cc-row" (click)="theme.toggle()" (keydown.enter)="theme.toggle()" data-t="dark" tabindex="-1">
          <i class="cc-b" [class.on]="system.theme() === 'dark'"
            ><svg appIcon="g-moon" style="width: 15px; height: 15px"></svg
          ></i>
          <div>
            <b>Dark Mode</b><span>{{ system.theme() === 'dark' ? 'On' : 'Off' }}</span>
          </div>
        </div>
      </div>
      <div class="cc-tile" style="grid-column: span 1">
        <div
          class="cc-row"
          (click)="stage.set(!stage())"
          (keydown.enter)="stage.set(!stage())"
          data-t="stage"
          tabindex="-1"
        >
          <i class="cc-b" [class.on]="stage()"><svg appIcon="g-grid" style="width: 15px; height: 15px"></svg></i>
          <div>
            <b>Stage Mgr</b><span>{{ stage() ? 'On' : 'Off' }}</span>
          </div>
        </div>
      </div>
      <div class="cc-tile" style="grid-column: span 2">
        <div class="cc-slab">
          <b>Display</b
          ><app-slider [value]="system.brightness()" (valueChange)="system.setBrightness($event)" data-slider="bri" />
        </div>
      </div>
      <div class="cc-tile" style="grid-column: span 2">
        <div class="cc-slab">
          <b>Sound</b
          ><app-slider [value]="system.volume()" (valueChange)="system.setVolume($event)" data-slider="snd" />
        </div>
      </div>
    </div>
  `
})
export class ControlCentre {
  protected readonly system = inject(SystemState);
  protected readonly theme = inject(ThemeService);
  /** 隔空投送初始显示「仅限联系人」，点一次关，再点显示「On」。 */
  protected readonly airdrop = signal<'contacts' | 'on' | 'off'>('contacts');
  protected readonly focus = signal(false);
  protected readonly stage = signal(false);
}
