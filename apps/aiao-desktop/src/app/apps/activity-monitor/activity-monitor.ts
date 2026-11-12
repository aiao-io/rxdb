import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { SystemState } from '../../services/system-state';
import { clamp } from '../../shared/format';
import { TrafficLights } from '../../shared/traffic-lights';
import { ACTIVITY_TABS, ActivityTab, PROCESSES, TABS } from './activity-data';

interface ActivityCell {
  readonly text: string;
  /** 核心指标列超过阈值时标红。 */
  readonly hot: boolean;
  /** 最后一列（用户）用次要色。 */
  readonly dim: boolean;
}

interface ActivityRow {
  readonly name: string;
  readonly cells: readonly ActivityCell[];
}

/** 当前标签页在某一时刻的完整读数：表格、图例、圆环与走势。 */
interface ActivityView {
  readonly cols: readonly string[];
  readonly rows: readonly ActivityRow[];
  readonly legend: readonly (readonly [string, string])[];
  readonly hue: string;
  readonly percent: number;
  readonly dashOffset: number;
  readonly points: string;
}

const RING = 2 * Math.PI * 22;
const REFRESH_MS = 1400;

const jitter = (spread: number): number => (Math.random() - 0.5) * spread;

const seedHistory = (): number[] => Array.from({ length: 60 }, () => 8 + Math.random() * 14);

/** 活动监视器：五个标签页各自重排进程表，每 1.4 秒带着随机抖动刷新一次。 */
@Component({
  selector: 'app-activity-monitor',
  imports: [TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './activity-monitor.html'
})
export class ActivityMonitorApp {
  private readonly system = inject(SystemState);
  /** 每个标签页各存 60 个历史读数，走势图只画当前标签的那一条。 */
  private readonly history: Record<ActivityTab, number[]> = {
    CPU: seedHistory(),
    Memory: seedHistory(),
    Energy: seedHistory(),
    Disk: seedHistory(),
    Network: seedHistory()
  };

  protected readonly tabs = ACTIVITY_TABS;
  protected readonly ring = RING;
  protected readonly tab = signal<ActivityTab>('CPU');
  protected readonly view = signal(this.sample());

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('activity')));
    const timer = setInterval(() => this.view.set(this.sample()), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected select(tab: ActivityTab): void {
    this.tab.set(tab);
    this.view.set(this.sample());
  }

  /** 给每个进程加一点抖动、按当前标签排序，并把这一刻的负载记进该标签的历史。 */
  private sample(): ActivityView {
    const tab = this.tab();
    const spec = TABS[tab];
    const rows = PROCESSES.map(process => ({
      ...process,
      cpu: Math.max(0, process.cpu + jitter(1.4)),
      energy: Math.max(0, process.energy + jitter(1.8)),
      disk: Math.max(0, process.disk + jitter(0.5)),
      net: Math.max(0, process.net + jitter(40))
    })).sort((a, b) => b[spec.key] - a[spec.key]);

    const load = spec.ring(rows) / 100;
    const history = this.history[tab];
    history.push(clamp(load * 100, 2, 96));
    history.shift();
    const points = history
      .map((value, i) => `${((i / (history.length - 1)) * 100).toFixed(2)},${(100 - value).toFixed(1)}`)
      .join(' ');

    return {
      cols: spec.cols,
      rows: rows.map(process => ({
        name: process.name,
        cells: spec.cells(process).map((text, k) => ({ text, hot: k === 1 && spec.hot(process), dim: k === 4 }))
      })),
      legend: spec.legend(rows, this.system.battery()),
      hue: spec.hue,
      percent: Math.round(load * 100),
      dashOffset: RING * (1 - load),
      points
    };
  }
}
