import { Component, inject, signal } from '@angular/core';

import { SystemState } from '../../services/system-state';
import { ThemeService } from '../../services/theme';
import { Icon } from '../../shared/icon';
import { Slider } from '../../shared/slider';

/**
 * 控制中心：Wi‑Fi、蓝牙、深色模式开关与亮度、音量滑块。
 * 无障碍（ADESK-US-108）：面板是 `dialog`；每个开关是原生按钮（`role="switch"`、`aria-checked`，副标题作描述），
 * 滑块能用方向键调节。
 */
@Component({
  selector: 'app-control-centre',
  imports: [Icon, Slider],
  host: {
    class: 'panel cc',
    role: 'dialog',
    'aria-label': 'Control Centre',
    style: 'min-width: 0; width: 302px; padding: 12px'
  },
  template: `
    <div class="cc-grid">
      <div class="cc-tile" style="grid-column: span 2">
        <button
          class="cc-row"
          [attr.aria-checked]="system.wifi()"
          (click)="system.wifi.set(!system.wifi())"
          aria-describedby="cc-wifi-sub"
          aria-label="Wi-Fi"
          data-t="wifi"
          role="switch"
          tabindex="0"
          type="button"
        >
          <i class="cc-b" [class.on]="system.wifi()"><svg appIcon="g-wifi" style="width: 15px; height: 15px"></svg></i>
          <div>
            <b aria-hidden="true">Wi‑Fi</b><span id="cc-wifi-sub">{{ system.wifi() ? system.wifiName() : 'Off' }}</span>
          </div>
        </button>
        <button
          class="cc-row"
          [attr.aria-checked]="system.bluetooth()"
          (click)="system.bluetooth.set(!system.bluetooth())"
          aria-describedby="cc-bt-sub"
          aria-label="Bluetooth"
          data-t="bt"
          role="switch"
          tabindex="0"
          type="button"
        >
          <i class="cc-b" [class.on]="system.bluetooth()"
            ><svg appIcon="g-bt" style="width: 15px; height: 15px"></svg
          ></i>
          <div>
            <b aria-hidden="true">Bluetooth</b><span id="cc-bt-sub">{{ system.bluetooth() ? 'On' : 'Off' }}</span>
          </div>
        </button>
        <button
          class="cc-row"
          [attr.aria-checked]="airdrop() !== 'off'"
          (click)="airdrop.set(airdrop() === 'off' ? 'on' : 'off')"
          aria-describedby="cc-ad-sub"
          aria-label="AirDrop"
          data-t="ad"
          role="switch"
          tabindex="0"
          type="button"
        >
          <i class="cc-b" [class.on]="airdrop() !== 'off'"
            ><svg appIcon="g-airdrop" style="width: 15px; height: 15px"></svg
          ></i>
          <div>
            <b aria-hidden="true">AirDrop</b
            ><span id="cc-ad-sub">{{
              airdrop() === 'contacts' ? 'Contacts Only'
              : airdrop() === 'on' ? 'On'
              : 'Off'
            }}</span>
          </div>
        </button>
      </div>
      <div class="cc-tile" style="grid-column: span 2">
        <button
          class="cc-row"
          [attr.aria-checked]="focus()"
          (click)="focus.set(!focus())"
          aria-describedby="cc-focus-sub"
          aria-label="Focus"
          data-t="focus"
          role="switch"
          tabindex="0"
          type="button"
        >
          <i class="cc-b" [class.on]="focus()"><svg appIcon="g-moon" style="width: 15px; height: 15px"></svg></i>
          <div>
            <b aria-hidden="true">Focus</b><span id="cc-focus-sub">{{ focus() ? 'On' : 'Off' }}</span>
          </div>
        </button>
      </div>
      <div class="cc-tile" style="grid-column: span 1">
        <button
          class="cc-row"
          [attr.aria-checked]="system.theme() === 'dark'"
          (click)="theme.toggle()"
          aria-describedby="cc-dark-sub"
          aria-label="Dark Mode"
          data-t="dark"
          role="switch"
          tabindex="0"
          type="button"
        >
          <i class="cc-b" [class.on]="system.theme() === 'dark'"
            ><svg appIcon="g-moon" style="width: 15px; height: 15px"></svg
          ></i>
          <div>
            <b aria-hidden="true">Dark Mode</b
            ><span id="cc-dark-sub">{{ system.theme() === 'dark' ? 'On' : 'Off' }}</span>
          </div>
        </button>
      </div>
      <div class="cc-tile" style="grid-column: span 1">
        <button
          class="cc-row"
          [attr.aria-checked]="stage()"
          (click)="stage.set(!stage())"
          aria-describedby="cc-stage-sub"
          aria-label="Stage Manager"
          data-t="stage"
          role="switch"
          tabindex="0"
          type="button"
        >
          <i class="cc-b" [class.on]="stage()"><svg appIcon="g-grid" style="width: 15px; height: 15px"></svg></i>
          <div>
            <b aria-hidden="true">Stage Mgr</b><span id="cc-stage-sub">{{ stage() ? 'On' : 'Off' }}</span>
          </div>
        </button>
      </div>
      <div class="cc-tile" style="grid-column: span 2">
        <div class="cc-slab">
          <b aria-hidden="true">Display</b
          ><app-slider
            [value]="system.brightness()"
            (valueChange)="system.setBrightness($event)"
            data-slider="bri"
            label="Display"
          />
        </div>
      </div>
      <div class="cc-tile" style="grid-column: span 2">
        <div class="cc-slab">
          <b aria-hidden="true">Sound</b
          ><app-slider
            [value]="system.volume()"
            (valueChange)="system.setVolume($event)"
            data-slider="snd"
            label="Sound"
          />
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
