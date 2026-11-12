import { Component, WritableSignal, inject, input } from '@angular/core';

import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { Chat } from './messages-data';

/** 详情面板里的两个开关；状态存在窗口里，面板关了再开也记得。 */
export interface MessagesSwitches {
  readonly alerts: WritableSignal<boolean>;
  readonly receipts: WritableSignal<boolean>;
}

/** 会话详情的弹出面板：头像、音视频通话、两个开关。 */
@Component({
  selector: 'app-messages-details',
  host: { class: 'pop', style: 'width: 250px; padding: 14px; text-align: center' },
  template: `
    <div
      class="av"
      [style.background]="chat().color"
      style="
        width: 56px;
        height: 56px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: #fff;
        font-size: 22px;
        font-weight: 600;
        margin: 0 auto 8px;
      "
    >
      {{ chat().name[0] }}
    </div>
    <div style="font-size: 15px; font-weight: 600">{{ chat().name }}</div>
    <div style="font-size: 11.5px; color: var(--txt-2); margin-bottom: 12px">
      {{ chat().group ? chat().messages.length + ' messages · group' : 'iMessage' }}
    </div>
    <div style="display: flex; gap: 8px; justify-content: center">
      <button class="btn" (click)="call()" data-d="audio" style="flex: 1; height: 26px">Audio</button>
      <button class="btn" (click)="call()" data-d="video" style="flex: 1; height: 26px">Video</button>
    </div>
    <div
      style="
        display: flex;
        flex-direction: column;
        gap: 1px;
        margin-top: 12px;
        background: var(--line);
        border-radius: 8px;
        overflow: hidden;
      "
    >
      @for (row of rows; track row.key) {
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            background: var(--win-2);
            padding: 7px 10px;
            font-size: 12px;
          "
        >
          {{ row.label }}
          <span
            class="sw"
            [attr.data-t]="row.key"
            [class.on]="switches()[row.key]()"
            (click)="flip(row.key)"
            (keydown.enter)="flip(row.key)"
            tabindex="-1"
            ><i></i
          ></span>
        </div>
      }
    </div>
  `
})
export class MessagesDetails {
  private readonly popover = inject(PopoverService);
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);

  protected readonly rows = [
    { label: 'Hide Alerts', key: 'alerts' },
    { label: 'Send Read Receipts', key: 'receipts' }
  ] as const;

  readonly chat = input.required<Chat>();
  readonly switches = input.required<MessagesSwitches>();

  protected call(): void {
    this.popover.close();
    this.wm.open('facetime');
    this.toast.show(`Calling ${this.chat().name}…`);
  }

  protected flip(key: keyof MessagesSwitches): void {
    this.switches()[key].update(on => !on);
  }
}
