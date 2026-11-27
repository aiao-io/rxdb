import { Component, inject } from '@angular/core';

import { useI18n } from '@aiao/rxdb-i18n-angular';

import { MailComposer } from './mail-composer';

/** 编辑器只负责展示共享草稿；Esc、点外面或隐藏面板不会丢弃输入。 */
@Component({
  selector: 'app-mail-compose',
  host: {
    class: 'pop',
    role: 'dialog',
    '[attr.aria-label]': "i18n.t('apps.mail.localMailDraft')",
    '[attr.data-draft-id]': 'editor.value()?.id',
    style:
      'padding: 14px; width: min(600px, 84vw); max-height: 80vh; overflow: auto; border-radius: 12px; background: var(--win); color: var(--txt)'
  },
  template: `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px">
      <strong style="flex: 1">{{ i18n.t('apps.mail.localMailDraftTitle') }}</strong>
      <button class="btn" (click)="composer.hide()" tabindex="0">{{ i18n.t('apps.mail.hideDraft') }}</button>
    </div>
    <p style="font-size: 12px; margin: 8px 0">
      {{ i18n.t('apps.mail.savedOnlyHere') }}
    </p>
    @if (composer.notice()) {
      <p role="alert" style="margin: 8px 0">{{ composer.notice() }}</p>
    }
    @if (editor.error()) {
      <p role="alert" style="margin: 8px 0">{{ editor.error() }}</p>
    }
    <label style="display: block; margin-top: 8px">
      {{ i18n.t('apps.mail.to') }}
      <input
        #toField
        [attr.aria-label]="i18n.t('apps.mail.to')"
        [disabled]="editor.saving()"
        [value]="editor.value()?.to ?? ''"
        (input)="editor.edit({ to: toField.value })"
        data-f="To"
        style="display: block; width: 100%; box-sizing: border-box; min-height: 30px; color: var(--txt); background: var(--field); border: 1px solid var(--line)"
      />
    </label>
    <label style="display: block; margin-top: 8px">
      {{ i18n.t('apps.mail.subject') }}
      <input
        #subjectField
        [attr.aria-label]="i18n.t('apps.mail.subject')"
        [disabled]="editor.saving()"
        [value]="editor.value()?.subject ?? ''"
        (input)="editor.edit({ subject: subjectField.value })"
        data-f="Subject"
        style="display: block; width: 100%; box-sizing: border-box; min-height: 30px; color: var(--txt); background: var(--field); border: 1px solid var(--line)"
      />
    </label>
    <label style="display: block; margin-top: 8px">
      {{ i18n.t('apps.mail.message') }}
      <textarea
        #bodyField
        [attr.aria-label]="i18n.t('apps.mail.message')"
        [disabled]="editor.saving()"
        [value]="editor.value()?.body ?? ''"
        (input)="editor.edit({ body: bodyField.value })"
        data-body
        rows="7"
        style="display: block; width: 100%; box-sizing: border-box; resize: vertical; color: var(--txt); background: var(--field); border: 1px solid var(--line)"
      ></textarea>
    </label>
    <p aria-live="polite" role="status">
      {{
        editor.saving() ? i18n.t('apps.mail.savingDraft')
        : editor.dirty() ? i18n.t('apps.mail.unsavedDraft')
        : i18n.t('apps.mail.noUnsavedChanges')
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
        {{ editor.error() ? i18n.t('apps.mail.retrySaveDraft') : i18n.t('apps.mail.saveDraft') }}
      </button>
      @if (editor.error()) {
        <button class="btn" [disabled]="editor.saving()" (click)="composer.saveCopy()" tabindex="0">
          {{ i18n.t('apps.mail.saveCopy') }}
        </button>
      }
      <button class="btn" [disabled]="editor.saving()" (click)="composer.discard()" data-discard-draft tabindex="0">
        {{ i18n.t('apps.mail.discardChanges') }}
      </button>
    </div>
  `
})
export class MailCompose {
  protected readonly composer = inject(MailComposer);
  protected readonly editor = this.composer.editor;
  protected readonly i18n = useI18n();
}
