import { Component, afterNextRender, inject, input, signal } from '@angular/core';

import { useI18n } from '@aiao/rxdb-i18n-angular';

import { PopoverService } from '../../services/popover';

/** 新建文件夹时回传名称；返回空串表示成功，否则把错误留在面板里。 */
export type NoteFolderSubmit = (name: string) => Promise<string>;

/** Notes 的新建文件夹面板。真正的校验和 SQLite 写入由 NotesApp 完成。 */
@Component({
  selector: 'app-note-folder-editor',
  host: {
    class: 'pop nf',
    '[attr.data-note-folder]': 'true',
    role: 'dialog',
    '[attr.aria-label]': "i18n.t('apps.notes.newFolder')",
    style: 'width: 320px',
    '(keydown)': 'key($event)'
  },
  template: `
    <div style="padding: 14px 16px 10px; font-weight: 600">{{ i18n.t('apps.notes.newFolder') }}</div>
    <div style="padding: 0 16px 12px; color: var(--txt-2); font-size: 12px">
      {{ i18n.t('apps.notes.createFolderHint') }}
    </div>
    <input
      #name
      [attr.aria-label]="i18n.t('apps.notes.folderName')"
      [disabled]="saving()"
      [placeholder]="i18n.t('apps.notes.folderName')"
      [value]="value()"
      (input)="value.set(name.value); error.set('')"
      autocomplete="off"
      data-folder-name
      spellcheck="false"
      style="display: block; width: calc(100% - 32px); margin: 0 16px; box-sizing: border-box"
      tabindex="0"
    />
    @if (error(); as problem) {
      <p role="alert" style="margin: 8px 16px 0; color: var(--red); overflow-wrap: anywhere">{{ problem }}</p>
    }
    <div style="display: flex; justify-content: flex-end; gap: 7px; padding: 14px 16px 16px">
      <button class="btn" [disabled]="saving()" (click)="cancel()" data-folder-cancel tabindex="0" type="button">
        {{ i18n.t('apps.notes.cancel') }}
      </button>
      <button class="btn pri" [disabled]="saving()" (click)="save()" data-folder-create tabindex="0" type="button">
        {{ i18n.t('apps.notes.create') }}
      </button>
    </div>
  `
})
export class NoteFolderEditor {
  private readonly popover = inject(PopoverService);
  protected readonly i18n = useI18n();
  protected readonly value = signal('');
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  readonly submit = input.required<NoteFolderSubmit>();

  constructor() {
    afterNextRender(() => {
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('[data-note-folder] [data-folder-name]');
        input?.focus();
        input?.select();
      }, 0);
    });
  }

  protected cancel(): void {
    this.popover.close(false, 'command');
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const problem = await this.submit()(this.value());
      if (problem) this.error.set(problem);
      else this.popover.close(false, 'command');
    } catch {
      this.error.set(this.i18n.t('error.notes.folderNotCreatedSafe'));
    } finally {
      this.saving.set(false);
    }
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.target as Element).tagName !== 'BUTTON') {
      event.preventDefault();
      void this.save();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  }
}
