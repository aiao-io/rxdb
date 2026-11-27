import { Component } from '@angular/core';

import { StatusPanel } from './status-panel';

/** 蓝牙面板（`dialog`）：开关是 `role="switch"` 的按钮。 */
@Component({
  selector: 'app-bluetooth-panel',
  host: {
    class: 'panel',
    role: 'dialog',
    '[attr.aria-label]': "i18n.t('settings.section.bluetooth')",
    style: 'min-width: 280px'
  },
  template: `
    <div class="row" style="height: 32px">
      <h4 style="margin: 0">{{ i18n.t('settings.section.bluetooth') }}</h4>
      <div class="tail">
        <button
          class="sw"
          [attr.aria-checked]="system.bluetooth()"
          [attr.aria-label]="i18n.t('settings.section.bluetooth')"
          [class.on]="system.bluetooth()"
          (click)="system.bluetooth.set(!system.bluetooth())"
          data-t="bt"
          role="switch"
          tabindex="0"
          type="button"
        ></button>
      </div>
    </div>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">{{ i18n.t('shell.menuBar.devices') }}</div>
    @for (device of devices; track device.name) {
      <div class="row">
        <span class="nm">{{ device.name }}</span>
        <span class="tail sub">
          @if (device.status === 'connected') {
            {{ i18n.t('shell.menuBar.connected') }}
          } @else if (device.status === 'notConnected') {
            {{ i18n.t('shell.menuBar.notConnected') }}
          } @else {
            {{ device.status }}
          }
        </span>
      </div>
    }
    <div class="sep"></div>
    <button class="row" (click)="openSettings('bluetooth')" data-bts tabindex="0" type="button">
      <span class="nm">{{ i18n.t('shell.menuBar.bluetoothSettings') }}</span>
    </button>
  `
})
export class BluetoothPanel extends StatusPanel {
  /** 演示设备行：`status` 是连接状态目录 key（`connected` / `notConnected`），电量百分比之类直显的值原样展示。 */
  protected readonly devices = [
    { name: 'AirPods Pro', status: 'connected' },
    { name: 'Magic Keyboard', status: 'connected' },
    { name: 'Magic Trackpad', status: '92%' },
    { name: 'Sony WH-1000XM5', status: 'notConnected' }
  ] as const;
}
