import { Component, ElementRef, computed, model, output, viewChild } from '@angular/core';

import { clamp } from './format';

/** 通用滑块（0..1）：拖动中持续写回 `value`，松手时发出 `release`。 */
@Component({
  selector: 'app-slider',
  host: {
    class: 'sl',
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
  readonly value = model(0);
  readonly release = output<number>();

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
