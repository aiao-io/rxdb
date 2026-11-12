import { Component, computed, inject, signal } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from './mail-composer';
import { MAILBOXES, MAIL_SEED, MailMessage } from './mail-data';

/** 邮件：邮箱侧栏、邮件列表与阅读区，可标旗、回复、转发。 */
@Component({
  selector: 'app-mail',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './mail.html'
})
export class MailApp {
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);
  private readonly composer = inject(MailComposer);

  protected readonly boxes = MAILBOXES;
  protected readonly mails = signal<readonly MailMessage[]>(MAIL_SEED);
  protected readonly box = signal('Inbox');
  /** 选中的是当前邮箱列表里的第几封。 */
  protected readonly selection = signal(0);

  /** 当前邮箱里的邮件：Flagged 只看打了旗的，其余邮箱都看全部。 */
  protected readonly list = computed(() =>
    this.box() === 'Flagged' ? this.mails().filter(mail => mail.flag) : this.mails()
  );
  /** 阅读区显示的邮件；选中项落在列表外（取消旗标后）就退回第一封。 */
  protected readonly current = computed<MailMessage | undefined>(() => this.list()[this.selection()] ?? this.list()[0]);

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('mail')));
  }

  protected openBox(name: string): void {
    this.box.set(name);
    this.selection.set(0);
  }

  protected select(index: number): void {
    this.selection.set(index);
    /* 沿用原行为：按位置标已读用的是全部邮件的下标，在 Flagged 邮箱里会标到另一封。 */
    this.mails.update(mails => mails.map((mail, i) => (i === index ? { ...mail, unread: false } : mail)));
  }

  protected compose(): void {
    this.composer.compose();
  }

  protected toggleFlag(): void {
    const target = this.current();
    if (!target) return;
    const flag = !target.flag;
    this.mails.update(mails => mails.map(mail => (mail === target ? { ...mail, flag } : mail)));
    this.toast.show(flag ? 'Flagged' : 'Flag removed');
  }

  protected share(anchor: HTMLElement): void {
    const mail = this.current();
    this.popover.menuUnder(anchor, [
      {
        id: 'r',
        label: 'Reply',
        run: () => this.composer.compose(`Re: ${mail ? mail.subject : ''}`, mail ? mail.from : '')
      },
      { id: 'f', label: 'Forward', run: () => this.composer.compose(`Fwd: ${mail ? mail.subject : ''}`) },
      '-',
      { id: 'c', label: 'Copy Link', run: () => this.toast.show('Link copied') },
      { id: 'p', label: 'Print…', run: () => this.toast.show('Sent to printer') }
    ]);
  }
}
