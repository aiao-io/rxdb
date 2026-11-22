import { Component, computed } from '@angular/core';

import { BatteryIcon } from '../../shared/status-glyphs';
import { StatusPanel } from './status-panel';

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
