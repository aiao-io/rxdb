import { Component, ElementRef, Service, afterNextRender, inject, input, viewChild } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS } from '../../data/live-query';
import { PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { Toast } from '../../services/toast';
import { time12Plain } from '../../shared/format';
import { SENT_COLOR, SENT_MAILBOX } from './mail-model';
import { MailMessage } from './mail.entities';

/** 写好的一封邮件。 */
export interface MailDraft {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/** 写邮件的面板：新邮件按钮、回复、转发与各应用的「通过邮件共享」都用它。 */
@Component({
  selector: 'app-mail-compose',
  host: { class: 'pop', style: 'padding: 0; width: min(600px, 84vw); border-radius: 12px; overflow: hidden' },
  template: `
    <div class="fx-tb" style="height: 46px; padding: 0 12px; gap: 8px; border-bottom: 0.5px solid var(--line)">
      <div class="fx-title" style="position: static; flex: 1; text-align: left">New Message</div>
      <button class="btn" (click)="popover.close()" data-cancel style="height: 22px">Cancel</button>
      <button class="btn pri" (click)="send()" data-send style="height: 22px">Send</button>
    </div>
    <div style="padding: 0 14px">
      <div style="display: flex; align-items: center; gap: 8px; height: 34px; border-bottom: 0.5px solid var(--line)">
        <span style="width: 54px; font-size: 12px; color: var(--txt-2)">To:</span>
        <input
          #toField
          [value]="to()"
          data-f="To"
          style="flex: 1; border: 0; background: none; font-size: 13px; outline: none; color: var(--txt)"
        />
      </div>
      <div style="display: flex; align-items: center; gap: 8px; height: 34px; border-bottom: 0.5px solid var(--line)">
        <span style="width: 54px; font-size: 12px; color: var(--txt-2)">Subject:</span>
        <input
          #subjectField
          [value]="subject()"
          data-f="Subject"
          style="flex: 1; border: 0; background: none; font-size: 13px; outline: none; color: var(--txt)"
        />
      </div>
    </div>
    <div
      #body
      contenteditable="true"
      data-body
      style="min-height: 180px; padding: 14px; font-size: 13.5px; line-height: 1.6; outline: none"
    ></div>
  `
})
export class MailCompose {
  private readonly toast = inject(Toast);
  private readonly composer = inject(MailComposer);
  private readonly toInput = viewChild.required<ElementRef<HTMLInputElement>>('toField');
  private readonly subjectInput = viewChild.required<ElementRef<HTMLInputElement>>('subjectField');
  private readonly bodyField = viewChild.required<ElementRef<HTMLElement>>('body');
  private sending = false;

  protected readonly popover = inject(PopoverService);
  readonly subject = input('');
  readonly to = input('');

  constructor() {
    afterNextRender(() =>
      setTimeout(() => (this.subject() ? this.bodyField() : this.toInput()).nativeElement.focus(), 60)
    );
  }

  /** 先存进 Sent 邮箱再关面板；正在存的时候再点发送不会重复，存失败了可以再点。 */
  protected async send(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    const recipient = this.toInput().nativeElement.value.trim();
    const subject = this.subjectInput().nativeElement.value.trim();
    const body = this.bodyField().nativeElement.innerText.trim();
    try {
      await this.composer.send({ to: recipient, subject, body });
    } finally {
      this.sending = false;
    }
    this.popover.close();
    this.toast.show(recipient ? `Message sent to ${recipient}` : 'Message sent');
  }
}

/** 打开写邮件面板（原 `Mail.compose`），并把发出的邮件存进 Sent 邮箱。 */
@Service({ autoProvided: false })
export class MailComposer {
  private readonly popover = inject(PopoverService);
  private readonly data = inject(DesktopData);
  private readonly system = inject(SystemState);

  compose(subject = '', to = ''): void {
    this.popover.openComponent(MailCompose, { x: innerWidth / 2 - 300, y: 96, origin: 'top center' }, { subject, to });
  }

  /** 把写好的邮件存进 Sent 邮箱，排在最前面。 */
  async send(draft: MailDraft): Promise<void> {
    await this.data.transaction(async executor => {
      const messages = executor.getRepository(MailMessage);
      const [first] = await messages.find({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }], limit: 1 });
      await messages.create(
        this.data.instantiate(MailMessage, {
          mailbox: SENT_MAILBOX,
          sender: this.system.user,
          recipient: draft.to,
          subject: draft.subject,
          body: draft.body,
          timeLabel: time12Plain(new Date()),
          color: SENT_COLOR,
          unread: false,
          flagged: false,
          position: first ? first.position - 1 : 0
        })
      );
    });
  }
}
