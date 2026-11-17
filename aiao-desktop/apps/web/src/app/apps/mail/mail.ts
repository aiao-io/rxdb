import { Component, computed, inject, signal } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { localWriteFailureMessage } from '../../data/local-write-error';
import { ContentActions } from '../../services/content-actions';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { PrintableContent, printableText } from '../../services/print-document';
import { Toast } from '../../services/toast';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from './mail-composer';
import { DRAFTS_MAILBOX, counterpartOf, mailMatches, mailboxLabel, mailsIn, partyOf } from './mail-model';
import { MailMailbox, MailMessage } from './mail.entities';

/** 邮件：邮箱侧栏、邮件列表与阅读区，可标旗、回复、转发；邮件和已读、旗标都存在本地库里。 */
@Component({
  selector: 'app-mail',
  imports: [Icon, TrafficLights],
  providers: [ContentActions],
  host: { style: 'display: contents' },
  templateUrl: './mail.html'
})
export class MailApp {
  private readonly data = inject(DesktopData);
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);

  protected readonly composer = inject(MailComposer);
  protected readonly query = signal('');
  protected readonly error = signal('');
  protected readonly savingFlag = signal(false);
  protected readonly mailboxLabel = mailboxLabel;
  protected readonly draftsMailbox = DRAFTS_MAILBOX;
  protected readonly actions = inject(ContentActions);
  protected readonly party = partyOf;
  protected readonly boxes = liveQuery(
    () => MailMailbox.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    MailMailbox
  );
  protected readonly mails = liveQuery(
    () => MailMessage.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    MailMessage
  );
  protected readonly box = signal('Inbox');
  /** 选中的是当前邮箱列表里的第几封。 */
  protected readonly selection = signal(0);

  /** 当前邮箱里的邮件：Flagged 汇集各邮箱里打了旗的，其余邮箱只看放在里面的。 */
  protected readonly list = computed(() => mailsIn(this.mails(), this.box()).filter(mail => mailMatches(mail, this.query())));
  /** 阅读区显示的邮件；选中项落在列表外（取消旗标后）就退回第一封。 */
  protected readonly current = computed<MailMessage | undefined>(() => this.list()[this.selection()] ?? this.list()[0]);

  constructor() {
    const menus = inject(DesktopMenus);
    const win = inject(DesktopWindow);
    win.setMenus(computed(() => menus.standard('mail')));
    this.composer.bindWindow(win);
  }

  protected openBox(name: string): void {
    this.box.set(name);
    this.selection.set(0);
    this.query.set('');
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
    if (!target || this.savingFlag()) return;
    const flagged = !target.flagged;
    this.savingFlag.set(true);
    if (await this.update(target, { flagged })) this.toast.show(flagged ? 'Flagged' : 'Flag removed');
    this.savingFlag.set(false);
  }

  protected count(name: string): number {
    const matches = mailsIn(this.mails(), name);
    return name === 'Inbox' ? matches.filter(mail => mail.unread).length : matches.length;
  }

  protected share(anchor: HTMLElement, event: MouseEvent): void {
    const mail = this.current();
    const content: PrintableContent | null =
      mail ?
        {
          title: mail.subject,
          paragraphs: [`From: ${mail.sender}`, `To: ${mail.recipient}`, mail.timeLabel, mail.body]
        }
      : null;
    const disabled = !content || this.actions.busy();
    this.popover.menuUnder(
      anchor,
      [
        {
          id: 'r',
          label: 'Reply',
          disabled: !mail,
          run: () => mail && this.composer.compose(`Re: ${mail.subject}`, counterpartOf(mail), `\n\n${mail.sender}:\n${mail.body}`)
        },
        { id: 'f', label: 'Forward', disabled: !mail, run: () => mail && content && this.composer.compose(`Fwd: ${mail.subject}`, '', printableText(content)) },
        '-',
        { id: 'c', label: 'Copy Message', disabled, run: () => content && this.actions.copy(printableText(content)) },
        { id: 'p', label: 'Print…', disabled, run: () => content && this.actions.print(content) }
      ],
      { keyboard: event.detail === 0, label: 'mail sharing' }
    );
  }

  private async update(mail: MailMessage, patch: Partial<MailMessage>): Promise<boolean> {
    this.error.set('');
    try {
      await (await this.data.repository(MailMessage)).update(mail, patch);
      return true;
    } catch (error) {
      this.error.set(localWriteFailureMessage(error));
      return false;
    }
  }
}
