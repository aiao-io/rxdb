import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConnectionGuardComponent } from '../components/connection-guard.component';
import { EventDetailComponent } from '../components/event-detail.component';
import { EventListComponent } from '../components/event-list.component';
import { DevToolsStateService } from '../services/devtools-state.service';

/**
 * Events 页面
 * 实时显示 RxDB 事件流
 */
@Component({
  selector: 'app-events-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConnectionGuardComponent, EventListComponent, EventDetailComponent],
  template: `
    <app-connection-guard>
      <div class="flex h-full flex-col overflow-hidden">
        <!-- Toolbar -->
        <div class="border-base-300 flex items-center justify-between border-b px-3 py-1.5">
          <div class="text-base-content/60 text-xs">{{ eventIndexes().length }} 事件</div>
          <button
            class="btn btn-ghost btn-xs gap-1"
            [disabled]="eventIndexes().length === 0"
            (click)="clearEvents()"
            title="清空事件列表"
          >
            <svg
              fill="none"
              height="12"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              viewBox="0 0 24 24"
              width="12"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            清空
          </button>
        </div>

        <!-- Content -->
        <div class="flex flex-1 overflow-hidden">
          <div class="border-base-300 w-1/2 overflow-hidden border-r">
            <app-event-list />
          </div>
          <div class="w-1/2 overflow-hidden">
            <app-event-detail />
          </div>
        </div>
      </div>
    </app-connection-guard>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `
  ]
})
export class EventsPage {
  private readonly devToolsState = inject(DevToolsStateService);
  readonly eventIndexes = this.devToolsState.eventIndexes;

  clearEvents(): void {
    this.devToolsState.clearEvents();
  }
}
