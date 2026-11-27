import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, computed, inject } from '@angular/core';
import { ApplicationRegistry } from '../../services/application-registry';

import { appDisplayName } from '../../services/desktop-app-name';
import { DesktopAppId } from '../../services/desktop-apps';
import { PopoverService } from '../../services/popover';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';

/** 「强制退出应用程序」面板（`dialog`）：每个运行中的应用是一个按钮，Enter 或空格退出它。 */
@Component({
  selector: 'app-force-quit-panel',
  imports: [Icon],
  host: {
    class: 'pop wide',
    role: 'dialog',
    '[attr.aria-label]': "i18n.t('shell.forceQuit.title')",
    style: 'width: 280px; padding: 0'
  },
  template: `
    <div aria-hidden="true" style="padding: 12px 14px 8px; font-weight: 600">
      {{ i18n.t('shell.forceQuit.title') }}
    </div>
    <div style="max-height: 220px; overflow: auto; padding: 0 6px 6px">
      @for (id of running(); track id) {
        <button class="mi" [attr.data-q]="id" (click)="quit(id)" style="height: 30px" tabindex="0" type="button">
          <svg class="ico" [appIcon]="apps()[id].icon" style="width: 19px; height: 19px"></svg
          ><span>{{ appName(apps()[id]) }}</span>
        </button>
      } @empty {
        <div style="padding: 14px; color: var(--txt-2); font-size: 12.5px">
          {{ i18n.t('shell.forceQuit.noneOpen') }}
        </div>
      }
    </div>
  `
})
export class ForceQuitPanel {
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  protected readonly apps = inject(ApplicationRegistry).apps;
  protected readonly i18n = useI18n();
  protected readonly appName = appDisplayName.bind(null, this.i18n);

  protected readonly running = computed(() => [
    ...new Set(
      this.wm
        .windows()
        .filter(win => !win.closing())
        .map(win => win.appId)
    )
  ]);

  protected quit(id: DesktopAppId): void {
    this.popover.close();
    this.wm.quitApp(id);
  }
}
