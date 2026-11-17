import type { DesktopCapability } from '@aiao/orbit/desktop';
import { Component, inject } from '@angular/core';

import { AppInstallationFlow } from '../../services/app-installation-flow';
import { InstalledApplications } from '../../services/installed-applications';
import { FocusTrap } from '../../shared/focus-trap';

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
  'filesystem:write': 'Write files you select'
};

@Component({
  selector: 'app-app-store',
  imports: [FocusTrap],
  providers: [AppInstallationFlow],
  templateUrl: './app-store.html',
  styleUrl: './app-store.scss'
})
export class AppStore {
  protected readonly applications = inject(InstalledApplications);
  protected readonly flow = inject(AppInstallationFlow);

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
