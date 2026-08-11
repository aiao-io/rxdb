import { HistoryItem, HistoryScopeType } from '@aiao/rxdb';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideX } from '@lucide/angular';

@Component({
  selector: 'ao-history-sidebar',
  imports: [DatePipe, LucideDynamicIcon, ScrollingModule],
  standalone: true,
  templateUrl: './history-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorySidebarComponent {
  readonly closeIcon = LucideX;

  show = input.required<boolean>();
  histories = input.required<HistoryItem[]>();
  scopeType = input.required<HistoryScopeType>();
  borderSide = input<'left' | 'right'>('left');
  closeClick = output<void>();
  trackByFn = (index: number, item: HistoryItem) => item.fingerprint;
}
