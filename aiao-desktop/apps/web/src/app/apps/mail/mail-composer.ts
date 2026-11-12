import { Component, ElementRef, Service, afterNextRender, inject, input, viewChild } from '@angular/core';

import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';

/** 写邮件的面板：新邮件按钮、回复、转发与各应用的「通过邮件共享」都用它。 */
@Component({
  selector: 'app-mail-compose',
  host: { class: 'pop', style: 'padding: 0; width: min(600px, 84vw); border-radius: 12px; overflow: hidden' },
  template: `
    <div class="fx-tb" style="height: 46px; padding: 0 12px; gap: 8px; border-bottom: 0.5px solid var(--line)">
      <div class="fx-title" style="position: static; flex: 1; text-align: left">New Message</div>
      <button class="btn" (click)="popover.close()" data-cancel style="height: 22px">Cancel</button>
      <button class="btn pri" (click)="send(toField.value)" data-send style="height: 22px">Send</button>
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
  private readonly toInput = viewChild.required<ElementRef<HTMLInputElement>>('toField');
  private readonly bodyField = viewChild.required<ElementRef<HTMLElement>>('body');

  protected readonly popover = inject(PopoverService);
  readonly subject = input('');
  readonly to = input('');

  constructor() {
    afterNextRender(() =>
      setTimeout(() => (this.subject() ? this.bodyField() : this.toInput()).nativeElement.focus(), 60)
    );
  }

  protected send(to: string): void {
    const recipient = to.trim();
    this.popover.close();
    this.toast.show(recipient ? `Message sent to ${recipient}` : 'Message sent');
  }
}

/** 打开写邮件面板（原 `Mail.compose`）。 */
@Service({ autoProvided: false })
export class MailComposer {
  private readonly popover = inject(PopoverService);

  compose(subject = '', to = ''): void {
    this.popover.openComponent(MailCompose, { x: innerWidth / 2 - 300, y: 96, origin: 'top center' }, { subject, to });
  }
}
