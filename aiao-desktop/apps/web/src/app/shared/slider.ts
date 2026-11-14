import { Component, ElementRef, computed, input, model, output, viewChild } from '@angular/core';

import { sliderValue } from '../services/focus-order';
import { clamp } from './format';

/**
 * 通用滑块（0..1）：拖动中持续写回 `value`，松手时发出 `release`。
 * 无障碍（ADESK-US-108）：`role="slider"`，能 Tab 到；方向键每次 5%、翻页键 10%、Home / End 到两端，
 * 键盘改动与拖动一样写回 `value` 并发出 `release`。`label` 是它的名称（Display、Sound……）。
 */
@Component({
  selector: 'app-slider',
  host: {
    class: 'sl',
    role: 'slider',
    tabindex: '0',
    'aria-valuemax': '100',
    'aria-valuemin': '0',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-valuenow]': 'percent()',
    '[attr.aria-valuetext]': 'percent() + "%"',
    '(keydown)': 'key($event)',
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'end()'
  },
  template: `
    <div class="trk" #track><div class="fil" [style.right.%]="100 - fraction() * 100"></div></div>
    <div class="kn" [style.left]="'calc(' + fraction() * 100 + '% )'"></div>
  `
})
export class Slider {
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private dragging = false;
  protected readonly fraction = computed(() => clamp(this.value(), 0, 1));
  protected readonly percent = computed(() => Math.round(this.fraction() * 100));
  readonly value = model(0);
  /** 滑块的无障碍名称。 */
  readonly label = input('');
  readonly release = output<number>();

  protected key(event: KeyboardEvent): void {
    const next = sliderValue(event.key, this.fraction());
    if (next === null) return;
    event.preventDefault();
    if (next === this.fraction()) return;
    this.value.set(next);
    this.release.emit(next);
  }

  protected start(event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.follow(event);
  }

  protected move(event: PointerEvent): void {
    if (this.dragging) this.follow(event);
  }

  protected end(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.release.emit(this.value());
  }

  private follow(event: PointerEvent): void {
    const rect = this.track().nativeElement.getBoundingClientRect();
    this.value.set(clamp((event.clientX - rect.left) / rect.width, 0, 1));
  }
}
