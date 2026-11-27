import { Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { useI18n } from '@aiao/rxdb-i18n-angular';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { Preferences } from '../../data/preferences';
import { Clock } from '../../services/clock';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { WindowManager } from '../../services/window-manager';
import { AnalogClock } from '../../shared/analog-clock';
import { time12Plain } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import {
  Alarm,
  alarmLabel,
  formatDuration,
  formatElapsed,
  isAlarmList,
  minuteKey,
  nextWorldClockPosition,
  parseAlarmTime,
  parseDurationSeconds,
  removeAlarm,
  shouldRing,
  stopwatchElapsed,
  timerRemaining,
  upsertAlarm,
  WORLD_CLOCK_DIRECTORY
} from './clock-model';
import { playAlarmTone } from './clock-tone';
import { WorldClock } from './clock.entities';

const HOUR = 3600e3;

/** 闹钟列表的偏好键。 */
const ALARMS_KEY = 'clock:alarms';

type ClockTab = 'world' | 'alarm' | 'stopwatch' | 'timer';

const TABS: readonly { id: ClockTab; label: string; key: string }[] = [
  { id: 'world', label: 'apps.clock.worldClock', key: '⌘1' },
  { id: 'alarm', label: 'apps.clock.alarm', key: '⌘2' },
  { id: 'stopwatch', label: 'apps.clock.stopwatch', key: '⌘3' },
  { id: 'timer', label: 'apps.clock.timer', key: '⌘4' }
];

/**
 * 时钟：世界时钟（本地库里的城市各一个表盘）、闹钟（持久化，到点响铃）、秒表与计时器。
 * 四个标签用 ⌘1–⌘4 切换；秒表与计时器由桌面时钟驱动，窗口关掉就不再走动。
 */
@Component({
  selector: 'app-clock',
  imports: [AnalogClock, TrafficLights, Icon],
  host: { style: 'display: contents' },
  template: `
    <div class="tb plain" data-drag>
      <div class="title">{{ i18n.t('apps.clock.clock') }}</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz">
        <div class="seg" data-nodrag>
          @for (entry of tabs; track entry.id) {
            <button
              [attr.data-ctab]="entry.id"
              [class.on]="tab() === entry.id"
              (click)="tab.set(entry.id)"
              tabindex="0"
            >
              {{ i18n.t(entry.label) }}
            </button>
          }
        </div>
      </div>
    </div>
    @switch (tab()) {
      @case ('world') {
        <div
          style="
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            padding: 10px 14px 14px;
            gap: 8px;
            background: var(--win);
          "
        >
          <div style="display: flex; justify-content: flex-end">
            <button
              class="btn"
              [attr.aria-label]="i18n.t('apps.clock.addCityAria')"
              (click)="openAddCity($event)"
              data-cadd
              data-nodrag
              tabindex="0"
              type="button"
            >
              {{ i18n.t('apps.clock.addCity') }}
            </button>
          </div>
          <div
            style="
              flex: 1;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 1px;
              background: var(--line);
              min-height: 0;
              overflow: auto;
            "
          >
            @for (zone of zones(); track zone.id) {
              <div
                style="
                  position: relative;
                  background: var(--win);
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  gap: 8px;
                  padding: 14px;
                "
              >
                <button
                  class="tbtn"
                  [attr.aria-label]="i18n.t('apps.clock.removeCityAria', { city: zone.city })"
                  [title]="i18n.t('apps.clock.removeCity')"
                  (click)="removeCity(zone.id)"
                  data-ccity-remove
                  style="position: absolute; top: 8px; right: 8px; width: 20px; height: 20px"
                  tabindex="0"
                  type="button"
                >
                  <svg appIcon="g-x" style="width: 10px; height: 10px; margin: auto"></svg>
                </button>
                <div [attr.data-cw]="zone.offset" style="width: 104px; height: 104px">
                  <app-analog-clock [size]="104" [time]="zone.time" />
                </div>
                <div style="font-size: 13px; font-weight: 600">{{ zone.city }}</div>
                <div [attr.data-ct]="zone.offset" style="font-size: 11.5px; color: var(--txt-2)">{{ zone.label }}</div>
              </div>
            }
          </div>
        </div>
      }
      @case ('alarm') {
        <div
          style="flex: 1; min-height: 0; overflow: auto; background: var(--win); padding: 18px 22px; display: flex; flex-direction: column; gap: 10px"
        >
          <div style="display: flex; gap: 8px; align-items: center">
            <input
              #alarmTime
              [attr.aria-label]="i18n.t('apps.clock.alarmTime')"
              data-calarm-time
              style="
                box-sizing: border-box;
                font-size: 13px;
                padding: 4px 8px;
                border: 1px solid var(--line);
                border-radius: 8px;
                background: var(--win-2);
                color: var(--txt);
              "
              type="time"
            />
            <button class="btn pri" (click)="addAlarm(alarmTime.value)" data-calarm-add tabindex="0" type="button">
              {{ i18n.t('apps.clock.addAlarm') }}
            </button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px">
            @for (alarm of alarms(); track alarm.id) {
              <div
                [attr.data-alarm]="alarm.id"
                style="
                  display: flex;
                  align-items: center;
                  gap: 14px;
                  padding: 12px 16px;
                  border: 1px solid var(--line);
                  border-radius: 12px;
                  background: var(--win-2);
                "
              >
                <button
                  [attr.aria-checked]="alarm.enabled"
                  [attr.aria-label]="i18n.t('apps.clock.enableAlarmAria', { time: alarmLabel(alarm) })"
                  [style.background]="alarm.enabled ? '#30d158' : 'var(--txt-3)'"
                  (click)="toggleAlarm(alarm.id)"
                  role="switch"
                  style="
                    width: 36px;
                    height: 20px;
                    border: 0;
                    border-radius: 10px;
                    padding: 0;
                    cursor: pointer;
                    flex: none;
                  "
                  tabindex="0"
                  type="button"
                >
                  <span
                    [style.margin-left.px]="alarm.enabled ? 18 : 2"
                    style="
                      display: block;
                      width: 16px;
                      height: 16px;
                      border-radius: 50%;
                      background: #fff;
                      margin: 2px;
                    "
                  ></span>
                </button>
                <span
                  [style.opacity]="alarm.enabled ? 1 : 0.4"
                  style="font-size: 30px; font-weight: 300; font-variant-numeric: tabular-nums"
                >
                  {{ alarmLabel(alarm) }}
                </span>
                <div style="flex: 1"></div>
                <button
                  class="tbtn"
                  [attr.aria-label]="i18n.t('apps.clock.deleteAlarmAria', { time: alarmLabel(alarm) })"
                  (click)="removeAlarm(alarm.id)"
                  tabindex="0"
                  type="button"
                >
                  <svg appIcon="g-x"></svg>
                </button>
              </div>
            } @empty {
              <div style="padding: 24px; text-align: center; color: var(--txt-3); font-size: 12.5px">
                {{ i18n.t('apps.clock.noAlarms') }}
              </div>
            }
          </div>
        </div>
      }
      @case ('stopwatch') {
        <div
          style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; background: var(--win)"
        >
          <div
            [attr.aria-label]="i18n.t('apps.clock.stopwatch')"
            aria-live="off"
            role="timer"
            style="font-size: 62px; font-weight: 200; font-variant-numeric: tabular-nums; letter-spacing: -0.02em"
          >
            {{ stopwatchText() }}
          </div>
          <div style="display: flex; gap: 10px">
            <button class="btn pri" (click)="stopwatchToggle()" data-stop-toggle tabindex="0" type="button">
              {{ stopwatchRunning() ? i18n.t('apps.clock.stop') : i18n.t('apps.clock.start') }}
            </button>
            <button class="btn" (click)="stopwatchReset()" data-stop-reset tabindex="0" type="button">
              {{ i18n.t('apps.clock.reset') }}
            </button>
          </div>
        </div>
      }
      @case ('timer') {
        <div
          style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; background: var(--win)"
        >
          @if (timerRunning()) {
            <div
              [attr.aria-label]="i18n.t('apps.clock.timer')"
              aria-live="off"
              role="timer"
              style="font-size: 62px; font-weight: 200; font-variant-numeric: tabular-nums; letter-spacing: -0.02em"
            >
              {{ timerText() }}
            </div>
            <button class="btn" (click)="timerCancel()" data-timer-cancel tabindex="0" type="button">
              {{ i18n.t('apps.clock.cancel') }}
            </button>
          } @else {
            <div style="display: flex; gap: 8px; align-items: center">
              <input
                #timerInput
                [attr.aria-label]="i18n.t('apps.clock.timerDuration')"
                [value]="timerInputValue()"
                (input)="timerInputValue.set(timerInput.value)"
                data-timer-input
                placeholder="5:00"
                style="
                  box-sizing: border-box;
                  width: 130px;
                  font-size: 20px;
                  text-align: center;
                  padding: 6px 10px;
                  border: 1px solid var(--line);
                  border-radius: 10px;
                  background: var(--win-2);
                  color: var(--txt);
                "
              />
              <button
                class="btn pri"
                (click)="timerStart(timerInput.value)"
                data-timer-start
                tabindex="0"
                type="button"
              >
                {{ i18n.t('apps.clock.start') }}
              </button>
            </div>
            <div style="font-size: 12px; color: var(--txt-2)">{{ i18n.t('apps.clock.timerHint') }}</div>
          }
        </div>
      }
    }
  `
})
export class ClockApp {
  private readonly clock = inject(Clock);
  private readonly data = inject(DesktopData);
  private readonly popover = inject(PopoverService);
  private readonly preferences = inject(Preferences);
  private readonly worldClocks = liveQuery(
    () => WorldClock.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    WorldClock
  );
  private readonly alarmsState = signal<readonly Alarm[]>([]);
  private readonly restoredAlarms = signal(false);
  private readonly lastRung = new Map<string, string>();
  private readonly stopwatchStarted = signal<number | null>(null);
  private readonly stopwatchAccumulated = signal(0);
  private readonly timerEnds = signal<number | null>(null);

  protected readonly tabs = TABS;
  protected readonly i18n = useI18n();
  protected readonly tab = signal<ClockTab>('world');
  protected readonly alarms = this.alarmsState.asReadonly();
  protected readonly timerInputValue = signal('5:00');
  /** 模板里直接用的纯函数。 */
  protected readonly alarmLabel = alarmLabel;
  protected readonly zones = computed(() =>
    this.worldClocks().map(({ id, city, offsetHours }) => {
      const time = new Date(this.clock.now().getTime() + offsetHours * HOUR);
      return { id, city, offset: offsetHours, time, label: time12Plain(time) };
    })
  );
  protected readonly stopwatchText = computed(() =>
    formatElapsed(stopwatchElapsed(this.stopwatchStarted(), this.stopwatchAccumulated(), this.clock.now().getTime()))
  );
  protected readonly stopwatchRunning = computed(() => this.stopwatchStarted() !== null);
  protected readonly timerText = computed(() =>
    formatDuration(timerRemaining(this.timerEnds(), this.clock.now().getTime()))
  );
  protected readonly timerRunning = computed(() => timerRemaining(this.timerEnds(), this.clock.now().getTime()) > 0);

  constructor() {
    const menus = inject(DesktopMenus);
    const wm = inject(WindowManager);
    inject(DesktopWindow).setMenus(
      computed(() =>
        menus.standard('clock', {
          [this.i18n.t('shell.menu.sectionView')]: [
            ...TABS.map(entry => ({
              id: entry.id,
              label: this.i18n.t(entry.label),
              key: entry.key,
              checked: this.tab() === entry.id,
              run: () => this.tab.set(entry.id)
            })),
            '-',
            { id: 'f', label: this.i18n.t('shell.menu.enterFullScreen'), key: '⌃⌘F', run: () => wm.zoomFront() },
            { id: 't', label: this.i18n.t('shell.menu.showToolbar'), key: '⌥⌘T', checked: true }
          ]
        })
      )
    );
    /* 启动时恢复闹钟列表；之后每次改动写回偏好。 */
    this.preferences.ready.then(
      () => {
        const saved = this.preferences.get(ALARMS_KEY, isAlarmList);
        if (saved) this.alarmsState.set(saved);
        this.restoredAlarms.set(true);
      },
      () => undefined
    );
    effect(() => {
      const alarms = this.alarmsState();
      if (!this.restoredAlarms()) return;
      untracked(() => void this.preferences.set(ALARMS_KEY, alarms).catch(() => undefined));
    });
    /* 每秒检查一次：到点的闹钟响铃，倒计时归零也响。 */
    effect(() => {
      const now = this.clock.now();
      for (const alarm of this.alarmsState()) {
        if (!shouldRing(alarm, now, this.lastRung.get(alarm.id))) continue;
        this.lastRung.set(alarm.id, minuteKey(now));
        playAlarmTone();
      }
      const ends = this.timerEnds();
      if (ends !== null && now.getTime() >= ends) {
        untracked(() => this.timerEnds.set(null));
        playAlarmTone();
      }
    });
  }

  protected openAddCity(event: Event): void {
    const anchor = event.currentTarget as HTMLElement;
    const present = new Set(this.worldClocks().map(clock => clock.city));
    const addable = WORLD_CLOCK_DIRECTORY.filter(city => !present.has(city.city));
    this.popover.menuUnder(
      anchor,
      addable.length ?
        addable.map(city => ({
          id: city.city,
          label: city.city,
          run: () => void this.addCity(city.city, city.offsetHours)
        }))
      : [{ id: 'none', label: this.i18n.t('apps.clock.allCitiesAdded'), disabled: true }],
      { label: this.i18n.t('apps.clock.addCityAria'), keyboard: true }
    );
  }

  protected async addCity(city: string, offsetHours: number): Promise<void> {
    await this.data.ensureSeeded(WorldClock);
    await this.data.transaction(async executor => {
      await executor.getRepository(WorldClock).create(
        this.data.instantiate(WorldClock, {
          city,
          offsetHours,
          position: nextWorldClockPosition(this.worldClocks().map(clock => clock.position))
        })
      );
    });
  }

  protected removeCity(id: string): void {
    const city = this.worldClocks().find(clock => clock.id === id);
    if (!city) return;
    void this.data.transaction(async executor => {
      await executor.getRepository(WorldClock).remove(city);
    });
  }

  protected addAlarm(value: string): void {
    const time = parseAlarmTime(value);
    if (!time) return;
    this.alarmsState.update(alarms =>
      upsertAlarm(alarms, { id: crypto.randomUUID(), hour: time.hour, minute: time.minute, enabled: true })
    );
  }

  protected toggleAlarm(id: string): void {
    this.alarmsState.update(alarms =>
      alarms.map(alarm => (alarm.id === id ? { ...alarm, enabled: !alarm.enabled } : alarm))
    );
  }

  protected removeAlarm(id: string): void {
    this.lastRung.delete(id);
    this.alarmsState.update(alarms => removeAlarm(alarms, id));
  }

  protected stopwatchToggle(): void {
    const started = this.stopwatchStarted();
    if (started === null) {
      this.stopwatchStarted.set(Date.now());
      return;
    }
    this.stopwatchAccumulated.update(accumulated => accumulated + Date.now() - started);
    this.stopwatchStarted.set(null);
  }

  protected stopwatchReset(): void {
    this.stopwatchStarted.set(null);
    this.stopwatchAccumulated.set(0);
  }

  protected timerStart(value: string): void {
    const seconds = parseDurationSeconds(value);
    if (seconds === null) return;
    this.timerEnds.set(Date.now() + seconds * 1000);
  }

  protected timerCancel(): void {
    this.timerEnds.set(null);
  }
}
