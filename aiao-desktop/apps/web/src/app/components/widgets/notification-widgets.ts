import { Component, computed, inject } from '@angular/core';
import { dueToday } from '../../apps/reminders/reminders-model';
import { Reminder } from '../../apps/reminders/reminders.entities';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { Clock } from '../../services/clock';
import { SystemState } from '../../services/system-state';
import { WindowManager } from '../../services/window-manager';
import { AnalogClock } from '../../shared/analog-clock';

/** 方形时钟小组件（通知中心）。 */
@Component({
  selector: 'app-clock-square-widget',
  imports: [AnalogClock],
  host: { class: 'wgt sqw' },
  template: `<div class="clockw" data-cl><app-analog-clock [size]="124" [time]="clock.now()" /></div>`
})
export class ClockSquareWidget {
  protected readonly clock = inject(Clock);
}

/** 方形电池小组件：环形电量与剩余时间。 */
@Component({
  selector: 'app-battery-square-widget',
  host: { class: 'wgt sqw batsq' },
  template: `
    <div class="wh"><span class="t">Battery</span></div>
    <div class="rw">
      <svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" fill="none" r="40" stroke="var(--fill-2)" stroke-width="8" />
        <circle
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="circumference * (1 - system.battery() / 100)"
          [attr.stroke]="color()"
          cx="48"
          cy="48"
          fill="none"
          r="40"
          stroke-linecap="round"
          stroke-width="8"
          transform="rotate(-90 48 48)"
        />
      </svg>
      <b>{{ system.battery() }}%</b>
    </div>
    <div class="sub">{{ remaining() }}</div>
  `
})
export class BatterySquareWidget {
  protected readonly system = inject(SystemState);
  protected readonly circumference = 2 * Math.PI * 40;
  protected readonly color = computed(() =>
    !this.system.charging() && this.system.battery() <= 20 ? '#ff9f0a' : '#30d158'
  );
  protected readonly remaining = computed(() => {
    if (this.system.charging()) return 'Charging';
    const mins = Math.round((this.system.battery() / 100) * 11.4 * 60);
    return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
  });
}

/** 今天的提醒事项：提醒事项里还没完成、时间写着 Today 的提醒，最多列三条，右上角是总数。 */
@Component({
  selector: 'app-reminders-widget',
  host: { class: 'wgt', '(dblclick)': "wm.open('reminders')" },
  template: `
    <div class="wh">
      <span class="t">Today</span><span class="s">{{ remaining().length }} remaining</span>
    </div>
    @for (item of shown(); track item.id) {
      <div style="display: flex; gap: 9px; align-items: center; padding: 5px 0; border-top: 0.5px solid var(--line)">
        <span
          [style.border]="'1.6px solid ' + item.tint"
          style="width: 15px; height: 15px; border-radius: 50%; flex: none"
        ></span>
        <span style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{
          item.title
        }}</span>
      </div>
    }
  `
})
export class RemindersWidget {
  private readonly reminders = liveQuery(
    () => Reminder.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    Reminder
  );

  protected readonly wm = inject(WindowManager);
  protected readonly remaining = computed(() => this.reminders().filter(dueToday));
  protected readonly shown = computed(() => this.remaining().slice(0, 3));
}
