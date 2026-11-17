import { Component, inject, input } from '@angular/core';

import { PopoverService } from '../../services/popover';
import { Chat } from './messages-model';

/** 会话只在本地保存，详情不提供未经接入的通讯控制。 */
@Component({
  selector: 'app-messages-details',
  host: {
    class: 'pop', role: 'dialog', 'aria-label': 'Local conversation details',
    style: 'width: 280px; padding: 16px; text-align: left; background: var(--win); color: var(--txt)'
  },
  template: `
    <div style="font-size: 15px; font-weight: 600">{{ chat().name }}</div>
    <p>{{ chat().messages.length }} local messages</p>
    <p>This conversation is stored only in this browser. Sample conversations are included.</p>
    <p>No messaging or calling service is connected. Incoming replies, read receipts and file sending are unavailable.</p>
    <button class="btn" tabindex="0" (click)="close()">Close Details</button>
  `
})
export class MessagesDetails {
  private readonly popover = inject(PopoverService);

  readonly chat = input.required<Chat>();

  protected close(): void {
    this.popover.close(false, 'command');
  }
}
