import { Component, computed, inject } from '@angular/core';

import { PopoverService } from '../../../services/popover';
import { LowPowerMode, SystemSettingsStore } from '../../../services/system-settings';
import { SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';
import { BatteryIcon } from '../../../shared/status-glyphs';
import { ToggleSwitch } from '../toggle-switch';

const LOW_POWER_LABELS: Readonly<Record<LowPowerMode, string>> = {
  never: 'Never',
  always: 'Always',
  battery: 'Only on Battery'
};

/** 电池：电量、剩余时间（按 11.4 小时满电续航估算）、健康度与低电量/优化充电选项（持久化）。 */
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
        <div class="rt"><span style="font-size: 12px; color: var(--txt-2)">Normal</span></div>
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
          <button class="btn" #mode (click)="pickLowPowerMode(mode)" data-pick="lowPowerMode">
            {{ lowPowerLabel() }} <svg appIcon="g-chev-d"></svg>
          </button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Optimised battery charging</div>
        <div class="rt"><div [(appSwitch)]="settings.optimisedCharging" data-k="obc"></div></div>
      </div>
    </div>
  `
})
export class BatteryPane {
  private readonly popover = inject(PopoverService);

  protected readonly system = inject(SystemState);
  protected readonly settings = inject(SystemSettingsStore);
  protected readonly remaining = computed(() => {
    if (this.system.charging()) return 'Charging';
    const mins = Math.round((this.system.battery() / 100) * 11.4 * 60);
    return `${Math.floor(mins / 60)} hr ${mins % 60} min remaining`;
  });
  protected readonly lowPowerLabel = computed(() => LOW_POWER_LABELS[this.settings.lowPowerMode()]);

  /** 低电量模式是真正的选择：写回系统设置并持久化。 */
  protected pickLowPowerMode(anchor: Element): void {
    this.popover.menuUnder(
      anchor,
      (Object.keys(LOW_POWER_LABELS) as LowPowerMode[]).map(id => ({
        id,
        label: LOW_POWER_LABELS[id],
        checked: this.settings.lowPowerMode() === id,
        run: () => this.settings.lowPowerMode.set(id)
      }))
    );
  }
}
