import { inject } from '@angular/core';

import { PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { WindowManager } from '../../services/window-manager';

/** 打开系统设置的某个分区，并关掉当前面板。 */
export abstract class StatusPanel {
  private readonly wm = inject(WindowManager);
  protected readonly system = inject(SystemState);
  protected readonly popover = inject(PopoverService);

  protected openSettings(section: string): void {
    this.popover.close();
    this.wm.open('settings', { section });
  }
}
