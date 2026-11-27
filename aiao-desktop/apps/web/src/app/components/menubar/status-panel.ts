import { useI18n } from '@aiao/rxdb-i18n-angular';
import { inject } from '@angular/core';

import { PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { WindowManager } from '../../services/window-manager';

/** 打开系统设置的某个分区，并关掉当前面板。 */
export abstract class StatusPanel {
  private readonly wm = inject(WindowManager);
  protected readonly system = inject(SystemState);
  protected readonly popover = inject(PopoverService);
  /** 状态面板族的文案目录绑定。 */
  protected readonly i18n = useI18n();

  protected openSettings(section: string): void {
    this.popover.close();
    this.wm.open('settings', { section });
  }
}
