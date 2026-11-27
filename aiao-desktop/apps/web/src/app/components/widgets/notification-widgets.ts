import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, computed, inject } from '@angular/core';
import { dueToday } from '../../apps/reminders/reminders-model';
import { Reminder } from '../../apps/reminders/reminders.entities';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { AppLauncher } from '../../services/app-launcher';
import { Clock } from '../../services/clock';
import { SystemState } from '../../services/system-state';
import { WindowManager } from '../../services/window-manager';
import { AnalogClock } from '../../shared/analog-clock';

/** 小组件上的键盘激活：Enter 或空格打开对应应用（宿主是无障碍按钮）。 */
function opensOn(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' ';
}

/** 方形时钟小组件（通知中心）：单击打开 Clock 应用。 */
@Component({
  selector: 'app-clock-square-widget',
  imports: [AnalogClock],
  host: {
    class: 'wgt sqw',
    style: 'cursor: pointer',
    role: 'button',
    tabindex: '0',
    '[attr.aria-label]': "i18n.t('apps.clock.open')",
    '(click)': 'open()',
    '(keydown)': 'onKey($event)'
  },
  template: `<div class="clockw" data-cl><app-analog-clock [size]="124" [time]="clock.now()" /></div>`
})
export class ClockSquareWidget {
  private readonly launcher = inject(AppLauncher);
  protected readonly clock = inject(Clock);
  protected readonly i18n = useI18n();

  protected open(): void {
    this.launcher.activate('clock');
  }

  protected onKey(event: KeyboardEvent): void {
    if (opensOn(event)) {
      event.preventDefault();
      this.open();
    }
  }
}

/** 方形电池小组件：环形电量与剩余时间；单击打开设置（电池分区）。 */
@Component({
  selector: 'app-battery-square-widget',
  host: {
    class: 'wgt sqw batsq',
    style: 'cursor: pointer',
    role: 'button',
    tabindex: '0',
    '[attr.aria-label]': "i18n.t('apps.settings.openBattery')",
    '(click)': 'open()',
    '(keydown)': 'onKey($event)'
  },
  template: `
    <div class="wh">
      <span class="t">{{ i18n.t('settings.section.battery') }}</span>
    </div>
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
  private readonly launcher = inject(AppLauncher);
  protected readonly system = inject(SystemState);
  protected readonly i18n = useI18n();
  protected readonly circumference = 2 * Math.PI * 40;
  protected readonly color = computed(() =>
    !this.system.charging() && this.system.battery() <= 20 ? '#ff9f0a' : '#30d158'
  );
  protected readonly remaining = computed(() => {
    if (this.system.charging()) return this.i18n.t('shell.menuBar.charging');
    const mins = Math.round((this.system.battery() / 100) * 11.4 * 60);
    return this.i18n.t('apps.settings.batteryRemaining', {
      hours: Math.floor(mins / 60),
      minutes: mins % 60
    });
  });

  protected open(): void {
    this.launcher.activate('settings');
  }

  protected onKey(event: KeyboardEvent): void {
    if (opensOn(event)) {
      event.preventDefault();
      this.open();
    }
  }
}

/** 今天的提醒事项：提醒事项里还没完成、时间写着 Today 的提醒，最多列三条，右上角是总数。 */
@Component({
  selector: 'app-reminders-widget',
  host: { class: 'wgt', '(dblclick)': "wm.open('reminders')" },
  template: `
    <div class="wh">
      <span class="t">{{ i18n.t('apps.reminders.today') }}</span><span class="s">{{
        i18n.t('apps.reminders.remainingCount', { count: remaining().length })
      }}</span>
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
  protected readonly i18n = useI18n();
  protected readonly remaining = computed(() => this.reminders().filter(dueToday));
  protected readonly shown = computed(() => this.remaining().slice(0, 3));
}
