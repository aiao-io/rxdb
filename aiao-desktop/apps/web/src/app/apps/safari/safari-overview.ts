import { Component, inject, input } from '@angular/core';

import { PopoverService } from '../../services/popover';
import { Icon } from '../../shared/icon';

/** 标签概览里的一格：标题、色块（没有色块就用站点图标）。 */
export interface SafariOverviewTab {
  readonly title: string;
  readonly color: string | null;
  readonly icon: string;
}

/** 「显示标签页概览」的弹出面板：缩略格里挑一个标签，或新开一个。 */
@Component({
  selector: 'app-safari-overview',
  imports: [Icon],
  host: { class: 'pop', style: 'padding: 14px', '[style.width]': '"min(560px, " + width() + "px)"' },
  template: `
    <div style="font-size: 12px; font-weight: 600; color: var(--txt-2); padding: 0 2px 10px">
      {{ tabs().length }} Tab{{ tabs().length > 1 ? 's' : '' }}
    </div>
    <div class="sf-ov">
      @for (tab of tabs(); track $index) {
        <button [attr.data-ovi]="$index" [class.on]="$index === current()" (click)="choose($index)">
          <span class="pv">{{ tab.title[0] || '?' }}</span>
          <span class="lb">
            @if (tab.color) {
              <i [style.background]="tab.color"></i>
            } @else {
              <img
                [src]="tab.icon"
                (error)="hide($event)"
                alt=""
                style="width: 12px; height: 12px; border-radius: 3px; flex: none"
              />
            }
            {{ tab.title }}
          </span>
        </button>
      }
      <button (click)="add()" data-ovnew>
        <span class="pv add"><svg appIcon="g-plus"></svg></span><span class="lb">New Tab</span>
      </button>
    </div>
  `
})
export class SafariOverview {
  private readonly popover = inject(PopoverService);

  /** 浮层宽度的上限：窗口宽度减去两侧留白。 */
  readonly width = input.required<number>();
  readonly tabs = input.required<readonly SafariOverviewTab[]>();
  readonly current = input.required<number>();
  readonly pick = input.required<(index: number) => void>();
  readonly create = input.required<() => void>();

  protected choose(index: number): void {
    this.popover.close();
    this.pick()(index);
  }

  protected add(): void {
    this.popover.close();
    this.create()();
  }

  protected hide(event: Event): void {
    (event.target as HTMLElement).style.visibility = 'hidden';
  }
}
