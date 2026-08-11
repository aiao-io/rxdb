import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DevToolsStateService } from '../services/devtools-state.service';
import { DevToolsValueComponent } from './devtools-value.component';

/**
 * 事件详情组件
 */
@Component({
  selector: 'app-event-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DevToolsValueComponent],
  template: `
    @if (selectedEvent(); as event) {
      <div class="flex h-full flex-col">
        <!-- 头部信息 -->
        <div class="border-base-300 border-b p-4">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">{{ event.eventType }}</h3>
            <button class="btn btn-ghost btn-xs" (click)="closeDetail()">✕</button>
          </div>
          <div class="mt-1 text-xs opacity-70">
            <span>ID: {{ event.id }}</span>
            <span class="mx-2">•</span>
            <span>{{ event.timestamp | date: 'yyyy-MM-dd HH:mm:ss.SSS' }}</span>
            <span class="mx-2">•</span>
            <span>Sequence: {{ event.sequence }}</span>
          </div>
        </div>

        <!-- 数据详情 -->
        <div class="flex-1 overflow-auto p-4">
          <h4 class="mb-2 text-sm font-medium">Data</h4>
          <div class="bg-base-200 max-h-full overflow-auto rounded p-3">
            <app-devtools-value [value]="event.data" />
          </div>
        </div>
      </div>
    } @else {
      <div class="flex h-full items-center justify-center text-sm opacity-50">Select an event to view details</div>
    }
  `
})
export class EventDetailComponent {
  private readonly devToolsState = inject(DevToolsStateService);

  readonly selectedEvent = this.devToolsState.selectedEvent;

  closeDetail(): void {
    this.devToolsState.selectEvent(null);
  }
}
