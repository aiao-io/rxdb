import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';

import { useI18n } from '@aiao/rxdb-i18n-angular';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { localWriteFailureMessage } from '../../data/local-write-error';
import { ContentActions } from '../../services/content-actions';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { PrintableContent, printableText } from '../../services/print-document';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from './mail-composer';
import type { PartyFields } from './mail-model';
import {
  DRAFTS_MAILBOX,
  counterpartOf,
  mailboxLabel as labelForMailbox,
  mailMatches,
  mailsIn,
  partyOf
} from './mail-model';
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
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly searchField = viewChild.required<ElementRef<HTMLInputElement>>('search');

  protected readonly composer = inject(MailComposer);
  protected readonly i18n = useI18n();
  protected readonly query = signal('');
  protected readonly error = signal('');
  protected readonly savingFlag = signal(false);
  protected readonly draftsMailbox = DRAFTS_MAILBOX;
  protected readonly actions = inject(ContentActions);
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
  protected readonly list = computed(() =>
    mailsIn(this.mails(), this.box()).filter(mail => mailMatches(mail, this.query()))
  );
  /** 阅读区显示的邮件；选中项落在列表外（取消旗标后）就退回第一封。 */
  protected readonly current = computed<MailMessage | undefined>(() => this.list()[this.selection()] ?? this.list()[0]);

  constructor() {
    const menus = inject(DesktopMenus);
    const win = inject(DesktopWindow);
    win.setMenus(
      computed(() =>
        menus.standard(
          'mail',
          {
            [this.i18n.t('shell.menu.sectionFile')]: [
              { id: 'n', label: this.i18n.t('apps.mail.newMessage'), key: '⌘N', run: () => this.compose() },
              { id: 'f', label: this.i18n.t('shell.menu.find'), key: '⌘F', run: () => this.focusSearch() },
              { id: 'w', label: this.i18n.t('shell.menu.closeWindow'), key: '⌘W', run: () => this.wm.closeFront() }
            ],
            [this.i18n.t('apps.mail.sectionMessage')]: [
              {
                id: 'u',
                label: this.i18n.t('apps.mail.markAsUnread'),
                key: '⇧⌘U',
                disabled: !this.current(),
                run: () => void this.markUnread()
              },
              {
                id: 't',
                label: this.i18n.t('shell.menu.moveToTrash'),
                key: '⌘⌫',
                disabled: !this.current(),
                run: () => void this.moveToTrash()
              }
            ]
          },
          [
            this.i18n.t('shell.menu.sectionFile'),
            this.i18n.t('shell.menu.sectionEdit'),
            this.i18n.t('shell.menu.sectionView'),
            this.i18n.t('apps.mail.sectionMessage'),
            this.i18n.t('shell.menu.sectionWindow'),
            this.i18n.t('shell.menu.sectionHelp')
          ]
        )
      )
    );
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

  /** ⌘F：焦点交给搜索框。 */
  protected focusSearch(): void {
    this.searchField().nativeElement.focus();
  }

  /** 邮件列表方向键：上下移动选中项并把焦点带过去。 */
  protected rowKey(event: KeyboardEvent, index: number): void {
    const step =
      event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowUp' ? -1
      : 0;
    if (!step) return;
    event.preventDefault();
    const target = clamp(index + step, 0, this.list().length - 1);
    this.select(target);
    const mail = this.list()[target];
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelector<HTMLElement>(`[data-mail-id="${CSS.escape(mail.id)}"]`)
      ?.focus();
  }

  /** 右键菜单：回复、转发、标旗、标记未读与移到废纸篓。 */
  protected menu(event: MouseEvent, mail: MailMessage): void {
    this.popover.contextMenu(
      event,
      [
        {
          id: 'r',
          label: this.i18n.t('apps.mail.reply'),
          run: () =>
            this.composer.compose(
              this.i18n.t('apps.mail.reSubject', { subject: mail.subject }),
              counterpartOf(mail),
              `\n\n${mail.sender}:\n${mail.body}`
            )
        },
        {
          id: 'f',
          label: this.i18n.t('apps.mail.forward'),
          run: () =>
            this.composer.compose(
              this.i18n.t('apps.mail.fwdSubject', { subject: mail.subject }),
              '',
              printableText({
                title: mail.subject,
                paragraphs: [
                  this.i18n.t('apps.mail.fromLine', { name: mail.sender }),
                  this.i18n.t('apps.mail.toLabel', { name: mail.recipient }),
                  mail.timeLabel,
                  mail.body
                ]
              })
            )
        },
        '-',
        {
          id: 'g',
          label: mail.flagged ? this.i18n.t('apps.mail.removeFlag') : this.i18n.t('apps.mail.flag'),
          run: () => void this.setFlag(mail)
        },
        { id: 'u', label: this.i18n.t('apps.mail.markAsUnread'), run: () => void this.update(mail, { unread: true }) },
        '-',
        { id: 't', label: this.i18n.t('shell.menu.moveToTrash'), run: () => void this.trash(mail) }
      ],
      this.i18n.t('apps.mail.contextMenu')
    );
  }

  /** 标旗开关；右键菜单与工具栏按钮共用。 */
  protected async setFlag(mail: MailMessage): Promise<void> {
    const flagged = !mail.flagged;
    if (await this.update(mail, { flagged })) this.toast.show(flagged ? 'apps.mail.flagged' : 'apps.mail.flagRemoved');
  }

  /** 标记未读：⇧⌘U 与右键菜单共用。 */
  protected async markUnread(): Promise<void> {
    const mail = this.current();
    if (mail) await this.update(mail, { unread: true });
  }

  /** 移到废纸篓：⌘⌫ 与右键菜单共用。 */
  protected async moveToTrash(): Promise<void> {
    const mail = this.current();
    if (mail) await this.trash(mail);
  }

  protected compose(): void {
    this.composer.compose();
  }

  protected async toggleFlag(): Promise<void> {
    const target = this.current();
    if (!target || this.savingFlag()) return;
    const flagged = !target.flagged;
    this.savingFlag.set(true);
    if (await this.update(target, { flagged }))
      this.toast.show(flagged ? 'apps.mail.flagged' : 'apps.mail.flagRemoved');
    this.savingFlag.set(false);
  }

  protected count(name: string): number {
    const matches = mailsIn(this.mails(), name);
    return name === 'Inbox' ? matches.filter(mail => mail.unread).length : matches.length;
  }

  /** 侧栏邮箱的显示名；`Sent` 显示本地归档名（mail-model 的 mailboxLabel）。 */
  protected mailboxLabel(name: string): string {
    return labelForMailbox(name, key => this.i18n.t(key));
  }

  /** 列表与阅读区里显示的对方；发出的邮件没填收件人时写明。 */
  protected party(mail: PartyFields): string {
    return partyOf(mail, key => this.i18n.t(key));
  }

  /** 阅读区与复制内容共用的正文格式，去掉不可见的边界空白。 */
  protected displayBody(body: string): string {
    return body.trim();
  }

  protected share(anchor: HTMLElement, event: MouseEvent): void {
    const mail = this.current();
    const content: PrintableContent | null =
      mail ?
        {
          title: mail.subject,
          paragraphs: [
            this.i18n.t('apps.mail.fromLine', { name: mail.sender }),
            this.i18n.t('apps.mail.toLabel', { name: mail.recipient }),
            mail.timeLabel,
            this.displayBody(mail.body)
          ]
        }
      : null;
    const disabled = !content || this.actions.busy();
    this.popover.menuUnder(
      anchor,
      [
        {
          id: 'r',
          label: this.i18n.t('apps.mail.reply'),
          disabled: !mail,
          run: () =>
            mail &&
            this.composer.compose(
              this.i18n.t('apps.mail.reSubject', { subject: mail.subject }),
              counterpartOf(mail),
              `\n\n${mail.sender}:\n${mail.body}`
            )
        },
        {
          id: 'f',
          label: this.i18n.t('apps.mail.forward'),
          disabled: !mail,
          run: () =>
            mail &&
            content &&
            this.composer.compose(
              this.i18n.t('apps.mail.fwdSubject', { subject: mail.subject }),
              '',
              printableText(content)
            )
        },
        '-',
        {
          id: 'c',
          label: this.i18n.t('apps.mail.copyMessage'),
          disabled,
          run: () => content && this.actions.copy(printableText(content))
        },
        {
          id: 'p',
          label: this.i18n.t('apps.mail.print'),
          disabled,
          run: () => content && this.actions.print(content)
        }
      ],
      { keyboard: event.detail === 0, label: this.i18n.t('apps.mail.sharingMenu') }
    );
  }

  private async trash(mail: MailMessage): Promise<void> {
    if (await this.update(mail, { mailbox: 'Trash' })) this.toast.show('apps.mail.movedToTrash');
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
