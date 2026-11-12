import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { clamp, mmss } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';

/** [标题, 日期, 时长 m:ss] */
const MEMOS = [
  ['Standup notes', 'Today 4:02 PM', '1:12'],
  ['Dock easing idea', 'Today 11:40 AM', '0:38'],
  ['Call with Daniel', 'Yesterday', '14:26'],
  ['Guitar riff', 'Saturday', '2:04']
] as const;

/** 波形条的高度（百分比），两个正弦叠出一段看起来像人声的起伏。 */
const BARS = Array.from({ length: 78 }, (_, i) =>
  (8 + Math.abs(Math.sin(i * 0.7) * 40) + Math.abs(Math.sin(i * 0.23) * 22)).toFixed(0)
);

const TICK_MS = 250;

const secondsOf = (length: string): number => {
  const [minutes, seconds] = length.split(':').map(Number);
  return minutes * 60 + seconds;
};

/** 语音备忘录：波形在播放头之后变暗，可播放/暂停、快进快退 5 秒，拖动进度条定位。 */
@Component({
  selector: 'app-voice-memos',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './voice-memos.html'
})
export class VoiceMemosApp {
  private scrubbing: AbortController | null = null;

  protected readonly memos = MEMOS;
  protected readonly bars = BARS;
  protected readonly index = signal(0);
  protected readonly position = signal(0);
  protected readonly playing = signal(false);
  protected readonly memo = computed(() => MEMOS[this.index()]);
  protected readonly duration = computed(() => secondsOf(this.memo()[2]));
  protected readonly fraction = computed(() => clamp(this.position() / this.duration(), 0, 1));
  protected readonly elapsed = computed(() => mmss(Math.round(this.position())));

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('voice')));
    /* 只在播放时才有计时器，暂停或关窗口时自动清掉。 */
    effect(onCleanup => {
      if (!this.playing()) return;
      const timer = setInterval(() => this.tick(), TICK_MS);
      onCleanup(() => clearInterval(timer));
    });
    inject(DestroyRef).onDestroy(() => this.scrubbing?.abort());
  }

  /** 换一条备忘录会回到开头并暂停；点的是当前这条则什么都不变。 */
  protected select(index: number): void {
    if (index === this.index()) return;
    this.index.set(index);
    this.position.set(0);
    this.playing.set(false);
  }

  protected togglePlay(): void {
    this.playing.update(playing => !playing);
  }

  protected skip(seconds: number): void {
    this.position.set(clamp(this.position() + seconds, 0, this.duration()));
  }

  /** 按下即定位，随后跟着指针拖；监听挂在 window 上，松手或关窗口时摘掉。 */
  protected scrub(event: PointerEvent): void {
    const duration = this.duration();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const seek = (at: PointerEvent): void =>
      this.position.set(clamp((at.clientX - rect.left) / rect.width, 0, 1) * duration);
    seek(event);

    this.scrubbing?.abort();
    const scrubbing = new AbortController();
    this.scrubbing = scrubbing;
    window.addEventListener('pointermove', seek, { signal: scrubbing.signal });
    window.addEventListener('pointerup', () => scrubbing.abort(), { signal: scrubbing.signal });
  }

  private tick(): void {
    const next = this.position() + TICK_MS / 1000;
    const duration = this.duration();
    if (next < duration) {
      this.position.set(next);
      return;
    }
    this.position.set(duration);
    this.playing.set(false);
  }
}
