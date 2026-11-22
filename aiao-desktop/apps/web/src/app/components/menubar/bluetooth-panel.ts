import { Component } from '@angular/core';

import { StatusPanel } from './status-panel';

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
        <span class="nm">{{ device[0] }}</span><span class="tail sub">{{ device[1] }}</span>
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
