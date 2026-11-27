import type { DesktopCapability } from '@aiao/orbit/desktop';
import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, computed, inject, signal } from '@angular/core';

import { AppInstallationFlow } from '../../services/app-installation-flow';
import { InstalledApplications } from '../../services/installed-applications';
import { FocusTrap } from '../../shared/focus-trap';
import { Icon } from '../../shared/icon';
import { filterCatalog } from './app-store-model';

/** 桌面能力说明文案的消息 key（确认面板里按当前语言解析展示）。 */
const capabilityNameKeys: Readonly<Record<DesktopCapability, string>> = {
  window: 'apps.appstore.capability.window',
  menu: 'apps.appstore.capability.menu',
  app: 'apps.appstore.capability.app',
  appearance: 'apps.appstore.capability.appearance',
  'appearance:write': 'apps.appstore.capability.appearanceWrite',
  notification: 'apps.appstore.capability.notification',
  'clipboard:read': 'apps.appstore.capability.clipboardRead',
  'clipboard:write': 'apps.appstore.capability.clipboardWrite',
  'filesystem:read': 'apps.appstore.capability.filesystemRead',
  'filesystem:write': 'apps.appstore.capability.filesystemWrite',
  workspace: 'apps.appstore.capability.workspace'
};

@Component({
  selector: 'app-app-store',
  imports: [FocusTrap, Icon],
  providers: [AppInstallationFlow],
  templateUrl: './app-store.html',
  styleUrl: './app-store.scss'
})
export class AppStore {
  protected readonly applications = inject(InstalledApplications);
  protected readonly flow = inject(AppInstallationFlow);
  protected readonly i18n = useI18n();
  /** 搜索过滤后的目录条目（名称、摘要、来源都参与匹配）。 */
  protected readonly query = signal('');
  protected readonly visibleItems = computed(() =>
    filterCatalog(this.flow.items(), item => `${item.latest.name} ${item.latest.summary} ${item.origin}`, this.query())
  );

  constructor() {
    void this.flow.refresh();
  }

  protected capability(value: DesktopCapability): string {
    return this.i18n.t(capabilityNameKeys[value]);
  }

  protected cancel(event: Event): void {
    event.stopPropagation();
    this.flow.cancel();
  }
}
