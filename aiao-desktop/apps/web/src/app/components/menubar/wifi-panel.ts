import { Component, computed, inject } from '@angular/core';

import { Toast } from '../../services/toast';
import { Icon } from '../../shared/icon';
import { NETWORKS } from '../../shared/networks';
import { WifiBars } from '../../shared/status-glyphs';
import { StatusPanel } from './status-panel';

/** Wi-Fi 面板（`dialog`）：开关是 `role="switch"` 的按钮，每个网络是一个按钮，已连接的名称里说明 connected。 */
@Component({
  selector: 'app-wifi-panel',
  imports: [Icon, WifiBars],
  host: {
    class: 'panel',
    role: 'dialog',
    '[attr.aria-label]': "i18n.t('shell.menuBar.wifi')",
    style: 'min-width: 290px'
  },
  template: `
    <div class="row" style="height: 32px">
      <h4 style="margin: 0">{{ i18n.t('shell.menuBar.wifi') }}</h4>
      <div class="tail">
        <button
          class="sw"
          [attr.aria-checked]="system.wifi()"
          [attr.aria-label]="i18n.t('shell.menuBar.wifi')"
          [class.on]="system.wifi()"
          (click)="system.wifi.set(!system.wifi())"
          data-t="wifi"
          role="switch"
          tabindex="0"
          type="button"
        ></button>
      </div>
    </div>
    <div class="sep"></div>
    <div class="mhead" style="padding-left: 0">{{ i18n.t('shell.menuBar.knownNetwork') }}</div>
    <button
      class="row"
      [attr.aria-label]="i18n.t('shell.menuBar.networkConnected', { name: system.wifiName() })"
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
    <div class="mhead" style="padding-left: 0">{{ i18n.t('shell.menuBar.otherNetworks') }}</div>
    <div id="netlist">
      @for (net of others(); track net.n) {
        <button
          class="row"
          [attr.aria-label]="net.lock ? i18n.t('shell.menuBar.networkSecured', { name: net.n }) : net.n"
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
      <span class="nm">{{ i18n.t('shell.menuBar.wifiSettings') }}</span>
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
    this.toast.show('shell.menuBar.connectedTo', { name });
  }
}
