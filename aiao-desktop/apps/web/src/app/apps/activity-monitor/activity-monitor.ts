import { Component, computed, inject } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { RuntimeActivity } from '../../services/runtime-activity';
import { WindowManager } from '../../services/window-manager';
import { TrafficLights } from '../../shared/traffic-lights';

@Component({
  selector: 'app-activity-monitor',
  imports: [TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './activity-monitor.html'
})
export class ActivityMonitorApp {
  protected readonly wm = inject(WindowManager);
  protected readonly activity = inject(RuntimeActivity);

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('activity')));
  }

  protected show(id: string): void {
    if (this.wm.get(id)?.minimized()) this.wm.unminimize(id);
    else this.wm.focus(id);
  }
}
