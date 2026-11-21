import { Component, DestroyRef, Service, effect, inject, signal } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS } from '../../data/live-query';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { time12Plain } from '../../shared/format';
import { MailDraftEditor, MailDraftError, MailDraftWrite, sameMailDraft } from './mail-draft';
import { DRAFTS_MAILBOX, SENT_COLOR } from './mail-model';
import { MailMessage } from './mail.entities';

/** 编辑器只负责展示共享草稿；Esc、点外面或隐藏面板不会丢弃输入。 */
@Component({
  selector: 'app-mail-compose',
  host: {
    class: 'pop',
    role: 'dialog',
    'aria-label': 'Local mail draft',
    '[attr.data-draft-id]': 'editor.value()?.id',
    style:
      'padding: 14px; width: min(600px, 84vw); max-height: 80vh; overflow: auto; border-radius: 12px; background: var(--win); color: var(--txt)'
  },
  template: `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px">
      <strong style="flex: 1">Local Mail Draft</strong>
      <button class="btn" (click)="composer.hide()" tabindex="0">Hide Draft</button>
    </div>
    <p style="font-size: 12px; margin: 8px 0">
      Saved only in this browser. No email service is connected and nothing will be sent.
    </p>
    @if (composer.notice()) {
      <p role="alert" style="margin: 8px 0">{{ composer.notice() }}</p>
    }
    @if (editor.error()) {
      <p role="alert" style="margin: 8px 0">{{ editor.error() }}</p>
    }
    <label style="display: block; margin-top: 8px">
      To
      <input
        #toField
        [disabled]="editor.saving()"
        [value]="editor.value()?.to ?? ''"
        (input)="editor.edit({ to: toField.value })"
        aria-label="To"
        data-f="To"
        style="display: block; width: 100%; box-sizing: border-box; min-height: 30px; color: var(--txt); background: var(--field); border: 1px solid var(--line)"
      />
    </label>
    <label style="display: block; margin-top: 8px">
      Subject
      <input
        #subjectField
        [disabled]="editor.saving()"
        [value]="editor.value()?.subject ?? ''"
        (input)="editor.edit({ subject: subjectField.value })"
        aria-label="Subject"
        data-f="Subject"
        style="display: block; width: 100%; box-sizing: border-box; min-height: 30px; color: var(--txt); background: var(--field); border: 1px solid var(--line)"
      />
    </label>
    <label style="display: block; margin-top: 8px">
      Message
      <textarea
        #bodyField
        [disabled]="editor.saving()"
        [value]="editor.value()?.body ?? ''"
        (input)="editor.edit({ body: bodyField.value })"
        aria-label="Message"
        data-body
        rows="7"
        style="display: block; width: 100%; box-sizing: border-box; resize: vertical; color: var(--txt); background: var(--field); border: 1px solid var(--line)"
      ></textarea>
    </label>
    <p aria-live="polite" role="status">
      {{
        editor.saving() ? 'Saving draft…'
        : editor.dirty() ? 'Unsaved draft'
        : 'No unsaved changes'
      }}
    </p>
    <div style="display: flex; flex-wrap: wrap; gap: 8px">
      <button
        class="btn"
        [disabled]="editor.saving() || !editor.dirty()"
        (click)="composer.save()"
        data-save-draft
        tabindex="0"
      >
        {{ editor.error() ? 'Retry Save Draft' : 'Save Draft' }}
      </button>
      @if (editor.error()) {
        <button class="btn" [disabled]="editor.saving()" (click)="composer.saveCopy()" tabindex="0">Save a Copy</button>
      }
      <button class="btn" [disabled]="editor.saving()" (click)="composer.discard()" data-discard-draft tabindex="0">
        Discard Changes
      </button>
    </div>
  `
})
export class MailCompose {
  protected readonly composer = inject(MailComposer);
  protected readonly editor = this.composer.editor;
}

/** 本地邮件草稿贯穿面板生命周期；唯一所属 Mail 窗口负责关闭与重启保护。 */
@Service({ autoProvided: false })
export class MailComposer {
  private readonly popover = inject(PopoverService);
  private readonly data = inject(DesktopData);
  private readonly system = inject(SystemState);
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);
  private readonly owner = signal<DesktopWindow | null>(null);

  readonly editor = new MailDraftEditor(change => this.persist(change));
  readonly notice = signal('');

  constructor() {
    effect(() => this.owner()?.hasUnsavedChanges.set(this.editor.dirty() || this.editor.saving()));
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!this.editor.dirty() && !this.editor.saving()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeunload', beforeUnload);
      this.editor.dispose();
    });
  }

  bindWindow(win: DesktopWindow): void {
    if (this.owner() === win) return;
    this.owner.set(win);
    win.confirmClose = async () => {
      await this.editor.settle();
      if (!this.editor.dirty()) return true;
      this.notice.set('There is an unsaved mail draft. Save it locally or discard your changes before closing Mail.');
      this.show();
      return false;
    };
    win.beforeClose.subscribe(() => {
      const active = this.popover.active();
      if (active?.content.kind === 'component' && active.content.component === MailCompose) this.popover.close();
      this.editor.discard();
      this.owner.set(null);
    });
  }

  compose(subject = '', to = '', body = ''): void {
    this.notice.set('');
    if (!this.editor.start({ subject, to, body }))
      this.notice.set('Finish the current draft before starting another one. Your original content is still here.');
    this.resume();
  }

  edit(mail: MailMessage): void {
    if (mail.mailbox !== DRAFTS_MAILBOX) return;
    this.notice.set('');
    if (!this.editor.open({ id: mail.id, to: mail.recipient, subject: mail.subject, body: mail.body }))
      this.notice.set('Finish the current draft before opening another one. Your original content is still here.');
    this.resume();
  }

  resume(): void {
    const win = this.wm.open('mail');
    if (win) this.bindWindow(win);
    this.show();
  }

  hide(): void {
    this.popover.close(false, 'command');
  }

  discard(): void {
    if (!this.editor.discard()) return;
    this.notice.set('');
    this.hide();
  }

  async save(): Promise<void> {
    const active = this.popover.active();
    this.notice.set('');
    if (!(await this.editor.save())) return;
    if (active?.id === this.popover.active()?.id) this.hide();
    this.toast.show('Draft saved locally. No email was sent.');
  }

  async saveCopy(): Promise<void> {
    if (this.editor.makeCopy()) await this.save();
  }

  private show(): void {
    this.popover.openComponent(MailCompose, {
      x: innerWidth / 2 - 300,
      y: 70,
      origin: 'top center',
      focus: true,
      onClose: reason => {
        if (reason === 'escape' || reason === 'command')
          document.querySelector<HTMLElement>('[data-resume-mail]')?.focus();
      }
    });
  }

  private async persist({ base, value }: MailDraftWrite): Promise<void> {
    await this.data.ensureSeeded(MailMessage);
    await this.data.transaction(async executor => {
      const messages = executor.getRepository(MailMessage);
      const [existing] = await messages.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: value.id }] },
        limit: 1
      });
      const saved = existing ? { to: existing.recipient, subject: existing.subject, body: existing.body } : null;
      if (existing && saved && existing.mailbox === DRAFTS_MAILBOX && sameMailDraft(saved, value)) return;
      if (base && !existing) throw new MailDraftError('missing');
      if (existing && (!base || !saved || existing.mailbox !== DRAFTS_MAILBOX || !sameMailDraft(saved, base)))
        throw new MailDraftError('conflict');
      const fields = {
        recipient: value.to,
        subject: value.subject,
        body: value.body,
        timeLabel: time12Plain(new Date())
      };
      if (existing) {
        await messages.update(existing, fields);
        return;
      }
      const [first] = await messages.find({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }], limit: 1 });
      await messages.create(
        this.data.instantiate(MailMessage, {
          ...fields,
          id: value.id,
          mailbox: DRAFTS_MAILBOX,
          sender: this.system.user,
          color: SENT_COLOR,
          unread: false,
          flagged: false,
          position: first ? first.position - 1 : 0
        })
      );
    });
  }
}
