import { Component, computed, inject, output } from '@angular/core';

import { SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';
import { NETWORKS } from '../../../shared/networks';
import { WifiBars } from '../../../shared/status-glyphs';
import { ToggleSwitch } from '../toggle-switch';

/** Wi‑Fi：总开关、当前网络和附近的网络（点一下切换，不弹提示）。 */
@Component({
  selector: 'app-wifi-pane',
  imports: [Icon, ToggleSwitch, WifiBars],
  host: { style: 'display: contents' },
  template: `
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Wi‑Fi</div>
        <div class="rt"><div [(appSwitch)]="system.wifi" data-k="wifi"></div></div>
      </div>
    </div>
    <div class="st-label">Known Network</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb" style="min-width: 0; flex: 1">
          {{ system.wifiName() }}
          <div class="hint">Connected · 1.2 Gbps</div>
        </div>
        <div class="rt">
          <svg appIcon="g-lock"></svg>
          <app-wifi-bars [strength]="3" />
          <button class="btn">Details…</button>
        </div>
      </div>
    </div>
    <div class="st-label">Other Networks</div>
    <div class="st-group">
      @for (net of others(); track net.n) {
        <div class="st-item" [attr.data-net]="net.n" (click)="join(net.n)" (keydown.enter)="join(net.n)" tabindex="-1">
          <div class="lb" style="min-width: 0; flex: 1">{{ net.n }}</div>
          <div class="rt">
            @if (net.lock) {
              <svg appIcon="g-lock"></svg>
            }
            <app-wifi-bars [strength]="net.s" />
          </div>
        </div>
      }
    </div>
  `
})
export class WifiPane {
  protected readonly system = inject(SystemState);
  protected readonly others = computed(() => NETWORKS.filter(net => net.n !== this.system.wifiName()));

  /** 换网络后面板整块重绘（原来的行为）。 */
  readonly rerender = output<void>();

  protected join(name: string): void {
    this.system.wifiName.set(name);
    this.rerender.emit();
  }
}
