import { ScrollingModule } from '@angular/cdk/scrolling';
import { DatePipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DevToolsStateService } from '../services/devtools-state.service';
import type { SerializedEvent } from '../types/devtools.types';

const EVENT_TYPE_BADGE: Record<string, string> = {
  INSERT: 'badge-primary',
  UPDATE: 'badge-secondary',
  DELETE: 'badge-accent',
  QUERY: 'badge-info'
};

/**
 * 事件列表组件
 */
@Component({
  selector: 'app-event-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, DatePipe, ScrollingModule],
  template: `
    <div class="flex h-full flex-col">
      <div class="min-h-0 flex-1">
        @if (eventIndexes().length === 0) {
          <div class="flex h-full items-center justify-center text-sm opacity-50">No events recorded</div>
        } @else {
          <cdk-virtual-scroll-viewport class="h-full" [itemSize]="32">
            <ul class="menu menu-compact p-0">
              <li *cdkVirtualFor="let index of eventIndexes(); trackBy: trackIndex">
                @if (eventAt(index); as event) {
                  <button
                    class="flex h-8 w-full items-center gap-2 px-2 py-1 text-left text-xs"
                    [ngClass]="{ active: selectedEvent()?.id === event.id }"
                    (click)="selectEvent(event)"
                    type="button"
                  >
                    <span class="badge badge-xs {{ getEventTypeBadgeClass(event.eventType) }}">
                      {{ event.eventType }}
                    </span>
                    <span class="flex-1 truncate opacity-70">{{ getEventSummary(event) }}</span>
                    <span class="opacity-50">{{ event.timestamp | date: 'HH:mm:ss.SSS' }}</span>
                  </button>
                }
              </li>
            </ul>
          </cdk-virtual-scroll-viewport>
        }
      </div>
    </div>
  `
})
export class EventListComponent {
  private readonly devToolsState = inject(DevToolsStateService);

  readonly eventIndexes = this.devToolsState.eventIndexes;
  readonly selectedEvent = this.devToolsState.selectedEvent;

  eventAt(index: number): SerializedEvent | undefined {
    return this.devToolsState.eventAt(index);
  }

  trackIndex(_index: number, value: number): number {
    return value;
  }

  selectEvent(event: SerializedEvent): void {
    this.devToolsState.selectEvent(event);
  }

  getEventTypeBadgeClass(eventType: string): string {
    return EVENT_TYPE_BADGE[eventType] ?? 'badge-ghost';
  }

  getEventSummary(event: SerializedEvent): string {
    const data = event.data;
    if (typeof data === 'object' && data !== null) {
      if ('collection' in data) {
        return String(data['collection']);
      }
      if ('entity' in data) {
        return String(data['entity']);
      }
    }
    return event.eventType;
  }
}
