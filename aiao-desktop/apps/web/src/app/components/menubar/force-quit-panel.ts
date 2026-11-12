import { Component, computed, inject } from '@angular/core';

import { DESKTOP_APPS, DesktopAppId } from '../../services/desktop-apps';
import { PopoverService } from '../../services/popover';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';

/** 「强制退出应用程序」面板。 */
@Component({
  selector: 'app-force-quit-panel',
  imports: [Icon],
  host: { class: 'pop wide', style: 'width: 280px; padding: 0' },
  template: `
    <div style="padding: 12px 14px 8px; font-weight: 600">Force Quit Applications</div>
    <div style="max-height: 220px; overflow: auto; padding: 0 6px 6px">
      @for (id of running(); track id) {
        <div
          class="mi"
          [attr.data-q]="id"
          (click)="quit(id)"
          (keydown.enter)="quit(id)"
          style="height: 30px"
          tabindex="-1"
        >
          <svg class="ico" [appIcon]="apps[id].icon" style="width: 19px; height: 19px"></svg
          ><span>{{ apps[id].name }}</span>
        </div>
      } @empty {
        <div style="padding: 14px; color: var(--txt-2); font-size: 12.5px">No applications are open.</div>
      }
    </div>
  `
})
export class ForceQuitPanel {
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  protected readonly apps = inject(DESKTOP_APPS);

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
