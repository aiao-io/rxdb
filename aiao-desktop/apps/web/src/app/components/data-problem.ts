import { Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';

import { describeProblem } from '../data/data-problem';
import { DesktopData } from '../data/desktop-data';
import { FocusTrap } from '../shared/focus-trap';

/**
 * 本地数据不可用时的阻断界面（ADESK-US-106）：盖住整个桌面，说明原因、数据有没有动过与恢复建议。
 * 「Reload」始终可用；只有数据确实不可用（损坏、没有迁移路径、存储不可用）才有「Erase Local Data…」，
 * 要再确认一次才会执行，绝不自动抹掉。
 * 无障碍（ADESK-US-108）：卡片是 `alertdialog`，出现时焦点进去（落在安全的「Reload」上，不是破坏性的抹除），Tab 只在卡片里循环。
 */
@Component({
  selector: 'app-data-problem',
  imports: [FocusTrap],
  templateUrl: './data-problem.html',
  styleUrl: './data-problem.scss',
  encapsulation: ViewEncapsulation.None,
  host: { '[style.display]': '"contents"' }
})
export class DataProblemScreen {
  private readonly data = inject(DesktopData);

  protected readonly confirming = signal(false);
  protected readonly erasing = signal(false);
  protected readonly failure = signal('');
  protected readonly view = computed(() => {
    const problem = this.data.problem();
    return problem ? describeProblem(problem) : null;
  });

  protected reload(): void {
    location.reload();
  }

  protected ask(): void {
    this.confirming.set(true);
  }

  protected cancel(): void {
    this.confirming.set(false);
  }

  protected async erase(): Promise<void> {
    this.erasing.set(true);
    this.failure.set('');
    try {
      await this.data.eraseLocalData();
      location.reload();
    } catch (error) {
      this.failure.set(error instanceof Error ? error.message : String(error));
      this.erasing.set(false);
    }
  }
}
