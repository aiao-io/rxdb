import { Component, afterNextRender, inject, input, signal } from '@angular/core';

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
    'aria-label': 'New Folder',
    style: 'width: 320px',
    '(keydown)': 'key($event)'
  },
  template: `
    <div style="padding: 14px 16px 10px; font-weight: 600">New Folder</div>
    <div style="padding: 0 16px 12px; color: var(--txt-2); font-size: 12px">Create a folder for your notes.</div>
    <input
      #name
      [value]="value()"
      (input)="value.set(name.value); error.set('')"
      [disabled]="saving()"
      data-folder-name
      aria-label="Folder name"
      placeholder="Folder name"
      spellcheck="false"
      autocomplete="off"
      tabindex="0"
      style="display: block; width: calc(100% - 32px); margin: 0 16px; box-sizing: border-box"
    />
    @if (error(); as problem) {
      <p role="alert" style="margin: 8px 16px 0; color: var(--red); overflow-wrap: anywhere">{{ problem }}</p>
    }
    <div style="display: flex; justify-content: flex-end; gap: 7px; padding: 14px 16px 16px">
      <button class="btn" type="button" [disabled]="saving()" (click)="cancel()" data-folder-cancel tabindex="0">Cancel</button>
      <button class="btn pri" type="button" [disabled]="saving()" (click)="save()" data-folder-create tabindex="0">Create</button>
    </div>
  `
})
export class NoteFolderEditor {
  private readonly popover = inject(PopoverService);
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
      this.error.set('The folder could not be created. Your notes are still safe.');
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
