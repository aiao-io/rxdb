import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';

import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { Icon } from '../../shared/icon';

const FIRST_AID_STEPS = [
  'Running First Aid on “Macintosh HD”',
  'Checking the container superblock',
  'Checking the object map',
  'Checking the fsroot tree',
  'Checking the snapshot metadata tree',
  'Verifying allocated space',
  'The volume Macintosh HD appears to be OK',
  'Operation successful.'
] as const;

/** 「First Aid」进度面板：逐行写日志、进度条随之推进，跑完才允许点 Done。 */
@Component({
  selector: 'app-first-aid-panel',
  host: { class: 'pop', style: 'width: 400px; padding: 16px' },
  template: `
    <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px">First Aid</div>
    <div style="font-size: 12px; color: var(--txt-2); margin-bottom: 12px">Checking Macintosh HD for errors.</div>
    <div style="height: 6px; border-radius: 3px; background: var(--fill-2); overflow: hidden">
      <i
        [style.width.%]="progress()"
        data-bar
        style="display: block; height: 100%; width: 0; background: var(--blue); transition: width 0.3s linear"
      ></i>
    </div>
    <pre
      #log
      data-log
      style="
        margin: 10px 0 0;
        font: 11px/1.55 var(--mono);
        color: var(--txt-2);
        max-height: 110px;
        overflow: auto;
        white-space: pre-wrap;
      "
      >{{ text() }}</pre>
    <div style="display: flex; justify-content: flex-end; margin-top: 12px">
      <button class="btn pri" [disabled]="!done()" (click)="popover.close()" data-done style="height: 24px">
        Done
      </button>
    </div>
  `
})
export class FirstAidPanel {
  private readonly log = viewChild.required<ElementRef<HTMLElement>>('log');
  private readonly lines = signal(0);

  protected readonly popover = inject(PopoverService);
  protected readonly text = computed(() =>
    FIRST_AID_STEPS.slice(0, this.lines())
      .map(step => `${step}\n`)
      .join('')
  );
  protected readonly progress = computed(() => (this.lines() / FIRST_AID_STEPS.length) * 100);
  protected readonly done = computed(() => this.lines() === FIRST_AID_STEPS.length);

  constructor() {
    const timers = FIRST_AID_STEPS.map((_, i) => setTimeout(() => this.lines.set(i + 1), 260 + i * 340));
    inject(DestroyRef).onDestroy(() => timers.forEach(clearTimeout));
    afterRenderEffect(() => {
      this.lines();
      const log = this.log().nativeElement;
      log.scrollTop = log.scrollHeight;
    });
  }
}

/** 「Erase」确认面板：启动盘不可抹掉，点 Erase 只会弹出提示。 */
@Component({
  selector: 'app-erase-panel',
  imports: [Icon],
  host: { class: 'pop', style: 'width: 340px; padding: 16px; text-align: center' },
  template: `
    <div style="width: 52px; height: 52px; margin: 0 auto 10px"><svg appIcon="f-hd"></svg></div>
    <div style="font-size: 13px; font-weight: 600">Erase “Macintosh HD”?</div>
    <div style="font-size: 12px; color: var(--txt-2); margin: 6px 0 14px">
      This is the startup disk. Erasing it would take the whole desktop with it — including this window.
    </div>
    <div style="display: flex; gap: 8px">
      <button class="btn" (click)="popover.close()" data-x style="flex: 1; height: 26px">Cancel</button>
      <button class="btn" (click)="erase()" data-e style="flex: 1; height: 26px; background: var(--red); color: #fff">
        Erase
      </button>
    </div>
  `
})
export class ErasePanel {
  private readonly toast = inject(Toast);

  protected readonly popover = inject(PopoverService);

  protected erase(): void {
    this.popover.close();
    this.toast.show('Erase blocked — cannot erase the startup disk');
  }
}
