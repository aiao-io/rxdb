import { Component, computed, inject, signal } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from './mail-composer';
import { counterpartOf, mailsIn, partyOf } from './mail-model';
import { MailMailbox, MailMessage } from './mail.entities';

/** 邮件：邮箱侧栏、邮件列表与阅读区，可标旗、回复、转发；邮件和已读、旗标都存在本地库里。 */
@Component({
  selector: 'app-mail',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './mail.html'
})
export class MailApp {
  private readonly data = inject(DesktopData);
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);
  private readonly composer = inject(MailComposer);

  protected readonly party = partyOf;
  protected readonly boxes = liveQuery(
    () => MailMailbox.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    []
  );
  protected readonly mails = liveQuery(
    () => MailMessage.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    []
  );
  protected readonly box = signal('Inbox');
  /** 选中的是当前邮箱列表里的第几封。 */
  protected readonly selection = signal(0);

  /** 当前邮箱里的邮件：Flagged 汇集各邮箱里打了旗的，其余邮箱只看放在里面的。 */
  protected readonly list = computed(() => mailsIn(this.mails(), this.box()));
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
    const mail: MailMessage | undefined = this.list()[index];
    if (mail?.unread) void this.update(mail, { unread: false });
  }

  protected compose(): void {
    this.composer.compose();
  }

  protected async toggleFlag(): Promise<void> {
    const target = this.current();
    if (!target) return;
    const flagged = !target.flagged;
    await this.update(target, { flagged });
    this.toast.show(flagged ? 'Flagged' : 'Flag removed');
  }

  protected share(anchor: HTMLElement): void {
    const mail = this.current();
    this.popover.menuUnder(anchor, [
      {
        id: 'r',
        label: 'Reply',
        run: () => this.composer.compose(`Re: ${mail ? mail.subject : ''}`, mail ? counterpartOf(mail) : '')
      },
      { id: 'f', label: 'Forward', run: () => this.composer.compose(`Fwd: ${mail ? mail.subject : ''}`) },
      '-',
      { id: 'c', label: 'Copy Link', run: () => this.toast.show('Link copied') },
      { id: 'p', label: 'Print…', run: () => this.toast.show('Sent to printer') }
    ]);
  }

  private async update(mail: MailMessage, patch: Partial<MailMessage>): Promise<void> {
    await (await this.data.repository(MailMessage)).update(mail, patch);
  }
}
