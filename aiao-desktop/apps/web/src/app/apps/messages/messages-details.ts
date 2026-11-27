import { Component, inject, input } from '@angular/core';

import { useI18n } from '@aiao/rxdb-i18n-angular';

import { PopoverService } from '../../services/popover';
import { Chat } from './messages-model';

/** 会话只在本地保存，详情不提供未经接入的通讯控制。 */
@Component({
  selector: 'app-messages-details',
  host: {
    class: 'pop',
    role: 'dialog',
    '[attr.aria-label]': "i18n.t('apps.messages.localConversationDetails')",
    style: 'width: 280px; padding: 16px; text-align: left; background: var(--win); color: var(--txt)'
  },
  template: `
    <div style="font-size: 15px; font-weight: 600">{{ chat().name }}</div>
    <p>{{ i18n.t('apps.messages.localMessages', { count: chat().messages.length }) }}</p>
    <p>{{ i18n.t('apps.messages.storedOnlyHere') }}</p>
    <p>
      {{ i18n.t('apps.messages.noMessagingService') }}
    </p>
    <button class="btn" (click)="close()" tabindex="0">{{ i18n.t('apps.messages.closeDetails') }}</button>
  `
})
export class MessagesDetails {
  private readonly popover = inject(PopoverService);

  protected readonly i18n = useI18n();
  readonly chat = input.required<Chat>();

  protected close(): void {
    this.popover.close(false, 'command');
  }
}
