import { Component, computed, inject } from '@angular/core';

import { PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { NETWORKS } from '../../shared/networks';
import { Slider } from '../../shared/slider';
import { BatteryIcon, WifiBars } from '../../shared/status-glyphs';

/** 打开系统设置的某个分区，并关掉当前面板。 */
abstract class StatusPanel {
  private readonly wm = inject(WindowManager);
  protected readonly system = inject(SystemState);
  protected readonly popover = inject(PopoverService);

  protected openSettings(section: string): void {
    this.popover.close();
    this.wm.open('settings', { section });
  }
}

/** Wi-Fi 面板（`dialog`）：开关是 `role="switch"` 的按钮，每个网络是一个按钮，已连接的名称里说明 connected。 */
@Component({
  selector: 'app-wifi-panel',
  imports: [Icon, WifiBars],
  host: { class: 'panel', role: 'dialog', 'aria-label': 'Wi-Fi', style: 'min-width: 290px' },
  template: `
    <div class="row" style="height: 32px">
      <h4 style="margin: 0">Wi-Fi</h4>
      <div class="tail">
        <button
          class="sw"
          [attr.aria-checked]="system.wifi()"
          [class.on]="system.wifi()"
          (click)="system.wifi.set(!system.wifi())"
          aria-label="Wi-Fi"
          data-t="wifi"
          role="switch"
          tabindex="0"
          type="button"
        ></button>
      </div>
    </div>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">Known Network</div>
    <button
      class="row"
      [attr.aria-label]="system.wifiName() + ', connected'"
      [attr.data-net]="system.wifiName()"
      (click)="join(system.wifiName())"
      tabindex="0"
      type="button"
    >
      <span style="width: 16px; color: var(--blue)"><svg appIcon="g-check"></svg></span>
      <span class="nm">{{ system.wifiName() }}</span>
      <span class="tail"
        ><svg appIcon="g-lock" style="width: 12px; height: 12px"></svg><app-wifi-bars [strength]="3"
      /></span>
    </button>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">Other Networks</div>
    <div id="netlist">
      @for (net of others(); track net.n) {
        <button
          class="row"
          [attr.aria-label]="net.lock ? net.n + ', secured' : net.n"
          [attr.data-net]="net.n"
          (click)="join(net.n)"
          tabindex="0"
          type="button"
        >
          <span style="width: 16px"></span><span class="nm">{{ net.n }}</span>
          <span class="tail">
            @if (net.lock) {
              <svg appIcon="g-lock" style="width: 12px; height: 12px"></svg>
            }
            <app-wifi-bars [strength]="net.s" />
          </span>
        </button>
      }
    </div>
    <div class="sep"></div>
    <button class="row" (click)="openSettings('wifi')" data-open-net-settings tabindex="0" type="button">
      <span class="nm">Wi-Fi Settings…</span>
    </button>
  `
})
export class WifiPanel extends StatusPanel {
  private readonly toast = inject(Toast);
  protected readonly others = computed(() => NETWORKS.filter(net => net.n !== this.system.wifiName()));

  protected join(name: string): void {
    this.system.wifiName.set(name);
    this.system.wifi.set(true);
    this.popover.close();
    this.toast.show(`Connected to ${name}`);
  }
}

/** 蓝牙面板（`dialog`）：开关是 `role="switch"` 的按钮。 */
@Component({
  selector: 'app-bluetooth-panel',
  host: { class: 'panel', role: 'dialog', 'aria-label': 'Bluetooth', style: 'min-width: 280px' },
  template: `
    <div class="row" style="height: 32px">
      <h4 style="margin: 0">Bluetooth</h4>
      <div class="tail">
        <button
          class="sw"
          [attr.aria-checked]="system.bluetooth()"
          [class.on]="system.bluetooth()"
          (click)="system.bluetooth.set(!system.bluetooth())"
          aria-label="Bluetooth"
          data-t="bt"
          role="switch"
          tabindex="0"
          type="button"
        ></button>
      </div>
    </div>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">Devices</div>
    @for (device of devices; track device[0]) {
      <div class="row">
        <span class="nm">{{ device[0] }}</span
        ><span class="tail sub">{{ device[1] }}</span>
      </div>
    }
    <div class="sep"></div>
    <button class="row" (click)="openSettings('bluetooth')" data-bts tabindex="0" type="button">
      <span class="nm">Bluetooth Settings…</span>
    </button>
  `
})
export class BluetoothPanel extends StatusPanel {
  protected readonly devices = [
    ['AirPods Pro', 'Connected'],
    ['Magic Keyboard', 'Connected'],
    ['Magic Trackpad', '92%'],
    ['Sony WH-1000XM5', 'Not Connected']
  ] as const;
}

/** 电池面板（`dialog`）。 */
@Component({
  selector: 'app-battery-panel',
  imports: [BatteryIcon],
  host: { class: 'panel', role: 'dialog', 'aria-label': 'Battery', style: 'min-width: 250px' },
  template: `
    <h4>Battery</h4>
    <div class="row" style="height: auto; padding: 2px 6px 8px">
      <div>
        <div style="font-size: 26px; font-weight: 500; letter-spacing: -0.03em">{{ system.battery() }}%</div>
        <div class="sub">{{ remaining() }}</div>
      </div>
      <div class="tail" style="transform: scale(1.5); transform-origin: right center">
        <app-battery-icon [charging]="system.charging()" [percent]="system.battery()" />
      </div>
    </div>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">Energy Use</div>
    <div class="row"><span class="nm">Safari</span><span class="tail sub">Low</span></div>
    <div class="row"><span class="nm">Music</span><span class="tail sub">Low</span></div>
    <div class="sep"></div>
    <button class="row" (click)="toggleCharging()" data-t="chg" tabindex="0" type="button">
      <span class="nm">{{ system.charging() ? 'Unplug Power Adapter' : 'Simulate Charging' }}</span>
    </button>
    <button class="row" (click)="openSettings('battery')" data-bs tabindex="0" type="button">
      <span class="nm">Battery Settings…</span>
    </button>
  `
})
export class BatteryPanel extends StatusPanel {
  protected readonly remaining = computed(() => {
    if (this.system.charging()) return 'Charging';
    const mins = Math.round((this.system.battery() / 100) * 11.4 * 60);
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} Remaining`;
  });

  protected toggleCharging(): void {
    this.system.charging.update(on => !on);
    this.popover.close();
  }
}

/** 声音面板（`dialog`）：音量滑块能用方向键调节。 */
@Component({
  selector: 'app-sound-panel',
  imports: [Icon, Slider],
  host: { class: 'panel', role: 'dialog', 'aria-label': 'Sound', style: 'min-width: 270px' },
  template: `
    <h4>Sound</h4>
    <div class="row" style="height: 30px; gap: 11px">
      <span style="color: var(--txt-2)"><svg appIcon="g-vol-lo" style="width: 15px; height: 15px"></svg></span>
      <app-slider [value]="system.volume()" (valueChange)="system.setVolume($event)" data-slider="vol" label="Volume" />
      <span style="color: var(--txt-2)"><svg appIcon="g-vol-hi" style="width: 15px; height: 15px"></svg></span>
    </div>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">Output</div>
    <div class="row on">
      <span style="width: 15px; color: var(--blue)"
        ><svg appIcon="g-check" style="width: 15px; height: 15px"></svg
      ></span>
      <span class="nm">MacBook Pro Speakers</span>
    </div>
    <div class="row"><span style="width: 15px"></span><span class="nm">AirPods Pro</span></div>
    <div class="sep"></div>
    <button class="row" (click)="openSettings('sound')" data-ss tabindex="0" type="button">
      <span class="nm">Sound Settings…</span>
    </button>
  `
})
export class SoundPanel extends StatusPanel {}
