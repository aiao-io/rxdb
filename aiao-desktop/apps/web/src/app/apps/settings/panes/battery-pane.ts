import { Component, computed, inject } from '@angular/core';

import { SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';
import { BatteryIcon } from '../../../shared/status-glyphs';
import { ToggleSwitch } from '../toggle-switch';

/** 电池：电量、剩余时间（按 11.4 小时满电续航估算）与健康度。 */
@Component({
  selector: 'app-battery-pane',
  imports: [BatteryIcon, Icon, ToggleSwitch],
  host: { style: 'display: contents' },
  template: `
    <div class="st-group">
      <div class="st-item">
        <div class="lb" style="min-width: 0; flex: 1">
          <b style="font-size: 22px; font-weight: 500">{{ system.battery() }}%</b>
          <div class="hint">{{ remaining() }}</div>
        </div>
        <div class="rt" style="transform: scale(1.6); transform-origin: right center">
          <app-battery-icon [charging]="system.charging()" [percent]="system.battery()" />
        </div>
      </div>
    </div>
    <div class="st-label">Battery Health</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Condition</div>
        <div class="rt">
          <span style="font-size: 12px; color: var(--txt-2)">Normal</span><svg appIcon="g-chev-r"></svg>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Maximum capacity</div>
        <div class="rt"><span style="font-size: 12px; color: var(--txt-2)">98%</span></div>
      </div>
      <div class="st-item">
        <div class="lb">Cycle count</div>
        <div class="rt"><span style="font-size: 12px; color: var(--txt-2)">142</span></div>
      </div>
    </div>
    <div class="st-label">Options</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Low Power Mode</div>
        <div class="rt">
          <button class="btn">Never <svg appIcon="g-chev-d"></svg></button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Optimised battery charging</div>
        <div class="rt"><div [appSwitch]="true" data-k="obc"></div></div>
      </div>
    </div>
  `
})
export class BatteryPane {
  protected readonly system = inject(SystemState);
  protected readonly remaining = computed(() => {
    if (this.system.charging()) return 'Charging';
    const mins = Math.round((this.system.battery() / 100) * 11.4 * 60);
    return `${Math.floor(mins / 60)} hr ${mins % 60} min remaining`;
  });
}
