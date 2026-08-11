import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideChevronRight as ChevronRight, LucideDynamicIcon } from '@lucide/angular';
import type { PathSegment } from '../../pages/opfs-page.utils';

@Component({
  selector: 'app-opfs-breadcrumb',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="border-base-300 flex items-center gap-1 border-b px-3 py-2 text-sm" aria-label="OPFS path">
      <button class="hover:underline" (click)="navigate.emit('/')">根目录</button>
      @for (segment of segments(); track segment.path) {
        <svg class="text-base-content/40" [lucideIcon]="ChevronRight" aria-hidden="true" size="14"></svg>
        <button class="hover:underline" (click)="navigate.emit(segment.path)">{{ segment.name }}</button>
      }
    </nav>
  `
})
export class OpfsBreadcrumbComponent {
  readonly segments = input.required<readonly PathSegment[]>();
  readonly navigate = output<string>();
  protected readonly ChevronRight = ChevronRight;
}
