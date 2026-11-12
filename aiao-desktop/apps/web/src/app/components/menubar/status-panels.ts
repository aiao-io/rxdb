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

@Component({
  selector: 'app-wifi-panel',
  imports: [Icon, WifiBars],
  host: { class: 'panel', style: 'min-width: 290px' },
  template: `
    <div class="row" style="height: 32px">
      <h4 style="margin: 0">Wi-Fi</h4>
      <div class="tail">
        <div
          class="sw"
          [class.on]="system.wifi()"
          (click)="system.wifi.set(!system.wifi())"
          (keydown.enter)="system.wifi.set(!system.wifi())"
          data-t="wifi"
          tabindex="-1"
        ></div>
      </div>
    </div>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">Known Network</div>
    <div
      class="row"
      [attr.data-net]="system.wifiName()"
      (click)="join(system.wifiName())"
      (keydown.enter)="join(system.wifiName())"
      tabindex="-1"
    >
      <span style="width: 16px; color: var(--blue)"><svg appIcon="g-check"></svg></span>
      <span class="nm">{{ system.wifiName() }}</span>
      <span class="tail"
        ><svg appIcon="g-lock" style="width: 12px; height: 12px"></svg><app-wifi-bars [strength]="3"
      /></span>
    </div>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">Other Networks</div>
    <div id="netlist">
      @for (net of others(); track net.n) {
        <div class="row" [attr.data-net]="net.n" (click)="join(net.n)" (keydown.enter)="join(net.n)" tabindex="-1">
          <span style="width: 16px"></span><span class="nm">{{ net.n }}</span>
          <span class="tail">
            @if (net.lock) {
              <svg appIcon="g-lock" style="width: 12px; height: 12px"></svg>
            }
            <app-wifi-bars [strength]="net.s" />
          </span>
        </div>
      }
    </div>
    <div class="sep"></div>
    <div
      class="row"
      (click)="openSettings('wifi')"
      (keydown.enter)="openSettings('wifi')"
      data-open-net-settings
      tabindex="-1"
    >
      <span class="nm">Wi-Fi Settings…</span>
    </div>
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

@Component({
  selector: 'app-bluetooth-panel',
  host: { class: 'panel', style: 'min-width: 280px' },
  template: `
    <div class="row" style="height: 32px">
      <h4 style="margin: 0">Bluetooth</h4>
      <div class="tail">
        <div
          class="sw"
          [class.on]="system.bluetooth()"
          (click)="system.bluetooth.set(!system.bluetooth())"
          (keydown.enter)="system.bluetooth.set(!system.bluetooth())"
          data-t="bt"
          tabindex="-1"
        ></div>
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
    <div
      class="row"
      (click)="openSettings('bluetooth')"
      (keydown.enter)="openSettings('bluetooth')"
      data-bts
      tabindex="-1"
    >
      <span class="nm">Bluetooth Settings…</span>
    </div>
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

@Component({
  selector: 'app-battery-panel',
  imports: [BatteryIcon],
  host: { class: 'panel', style: 'min-width: 250px' },
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
    <div class="row" (click)="toggleCharging()" (keydown.enter)="toggleCharging()" data-t="chg" tabindex="-1">
      <span class="nm">{{ system.charging() ? 'Unplug Power Adapter' : 'Simulate Charging' }}</span>
    </div>
    <div class="row" (click)="openSettings('battery')" (keydown.enter)="openSettings('battery')" data-bs tabindex="-1">
      <span class="nm">Battery Settings…</span>
    </div>
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

@Component({
  selector: 'app-sound-panel',
  imports: [Icon, Slider],
  host: { class: 'panel', style: 'min-width: 270px' },
  template: `
    <h4>Sound</h4>
    <div class="row" style="height: 30px; gap: 11px">
      <span style="color: var(--txt-2)"><svg appIcon="g-vol-lo" style="width: 15px; height: 15px"></svg></span>
      <app-slider [value]="system.volume()" (valueChange)="system.setVolume($event)" data-slider="vol" />
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
    <div class="row" (click)="openSettings('sound')" (keydown.enter)="openSettings('sound')" data-ss tabindex="-1">
      <span class="nm">Sound Settings…</span>
    </div>
  `
})
export class SoundPanel extends StatusPanel {}
