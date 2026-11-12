import { Component, computed, inject } from '@angular/core';

import { SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';

/** 网络：几个网络服务的连接状态，Wi‑Fi 一行跟着当前网络名走。 */
@Component({
  selector: 'app-network-pane',
  imports: [Icon],
  host: { style: 'display: contents' },
  template: `
    <div class="st-group">
      @for (service of services(); track service.name) {
        <div class="st-item">
          <span
            [style.background]="service.colour"
            style="width: 9px; height: 9px; border-radius: 50%; flex: none"
          ></span>
          <div class="lb" style="min-width: 0; flex: 1">
            {{ service.name }}
            <div class="hint">{{ service.status }}</div>
          </div>
          <div class="rt"><svg appIcon="g-chev-r"></svg></div>
        </div>
      }
    </div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Firewall</div>
        <div class="rt"><span style="font-size: 12px; color: var(--txt-2)">On</span><svg appIcon="g-chev-r"></svg></div>
      </div>
    </div>
  `
})
export class NetworkPane {
  private readonly system = inject(SystemState);

  protected readonly services = computed(() => [
    { name: 'Wi‑Fi', status: this.system.wifiName(), colour: '#30d158' },
    { name: 'Thunderbolt Bridge', status: 'Not Connected', colour: '#8e8e93' },
    { name: 'VPN — Home', status: 'Not Connected', colour: '#8e8e93' }
  ]);
}
