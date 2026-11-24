import { Component, inject } from '@angular/core';

import { SystemState } from '../../../services/system-state';
import { ToggleSwitch } from '../toggle-switch';

/** 蓝牙：总开关写回系统状态，设备列表是静态信息（连接状态只是展示）。 */
@Component({
  selector: 'app-bluetooth-pane',
  imports: [ToggleSwitch],
  host: { style: 'display: contents' },
  template: `
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Bluetooth</div>
        <div class="rt"><div [(appSwitch)]="system.bluetooth" data-k="bt"></div></div>
      </div>
    </div>
    <div class="st-label">My Devices</div>
    <div class="st-group">
      @for (device of devices; track device[0]) {
        <div class="st-item">
          <div class="lb" style="min-width: 0; flex: 1">
            {{ device[0] }}
            <div class="hint">{{ device[1] }}</div>
          </div>
          <div class="rt">
            <span style="font-size: 12px; color: var(--txt-2)">{{ device[1] }}</span>
          </div>
        </div>
      }
    </div>
  `
})
export class BluetoothPane {
  protected readonly system = inject(SystemState);
  protected readonly devices = [
    ['AirPods Pro', 'Connected'],
    ['Magic Keyboard', 'Connected'],
    ['Magic Trackpad', 'Connected · 92%'],
    ['Sony WH‑1000XM5', 'Not Connected']
  ] as const;
}
