import type { DesktopCapability } from '@aiao/orbit/desktop';
import { Component, computed, inject, signal } from '@angular/core';

import { AppInstallationFlow } from '../../services/app-installation-flow';
import { InstalledApplications } from '../../services/installed-applications';
import { FocusTrap } from '../../shared/focus-trap';
import { Icon } from '../../shared/icon';
import { filterCatalog } from './app-store-model';

const capabilityNames: Readonly<Record<DesktopCapability, string>> = {
  window: 'Manage its own window',
  menu: 'Provide application menus',
  app: 'Open installed applications',
  appearance: 'Read desktop appearance',
  'appearance:write': 'Change desktop appearance',
  notification: 'Show desktop notifications',
  'clipboard:read': 'Read clipboard after approval',
  'clipboard:write': 'Write to clipboard',
  'filesystem:read': 'Read files you select',
  'filesystem:write': 'Write files you select',
  workspace: 'Read and update Git workspaces'
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
  /** 搜索过滤后的目录条目（名称、摘要、来源都参与匹配）。 */
  protected readonly query = signal('');
  protected readonly visibleItems = computed(() =>
    filterCatalog(this.flow.items(), item => `${item.latest.name} ${item.latest.summary} ${item.origin}`, this.query())
  );

  constructor() {
    void this.flow.refresh();
  }

  protected capability(value: DesktopCapability): string {
    return capabilityNames[value];
  }

  protected cancel(event: Event): void {
    event.stopPropagation();
    this.flow.cancel();
  }
}
