import { Component, ElementRef, afterNextRender, input, viewChild } from '@angular/core';

import { Icon } from '../../shared/icon';

const SUGGESTIONS = ['Anna Haro', 'David Taylor', 'Kate Bell', 'Mom'] as const;

/** 「New FaceTime」面板：先问打给谁，再拨出，避免一个点了没反应的主按钮。 */
@Component({
  selector: 'app-new-facetime',
  imports: [Icon],
  host: { class: 'pop', style: 'width: 290px; padding: 12px' },
  template: `
    <div style="font-size: 12.5px; font-weight: 600; margin-bottom: 8px">New FaceTime</div>
    <div class="sfield" style="width: 100%">
      <span><svg appIcon="g-search"></svg></span>
      <input #field (keydown.enter)="go(field.value)" placeholder="Name or email" spellcheck="false" />
    </div>
    <div
      style="
        display: flex;
        flex-direction: column;
        gap: 1px;
        margin-top: 10px;
        background: var(--line);
        border-radius: 8px;
        overflow: hidden;
      "
    >
      @for (name of suggestions; track name) {
        <div
          class="mi"
          [attr.data-pick]="name"
          (click)="go(name)"
          (keydown.enter)="go(name)"
          style="background: var(--win-2); border-radius: 0"
          tabindex="-1"
        >
          {{ name }}
        </div>
      }
    </div>
    <button class="btn pri" (click)="go(field.value)" data-go style="width: 100%; height: 26px; margin-top: 10px">
      FaceTime
    </button>
  `
})
export class NewFaceTime {
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly suggestions = SUGGESTIONS;
  /** 拨号回调：由 FaceTime 窗口传入，空名字由它负责提示。 */
  readonly dial = input.required<(name: string) => void>();

  constructor() {
    afterNextRender(() => setTimeout(() => this.field().nativeElement.focus(), 50));
  }

  protected go(name: string): void {
    this.dial()(name.trim());
  }
}
