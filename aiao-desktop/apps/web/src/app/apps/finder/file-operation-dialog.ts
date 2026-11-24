import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';

import { DESKTOP, DiskPath, HOME, TRASH, isWithin } from '../../disk/disk-path';
import { FileOpener } from '../../services/file-opener';
import { FileSystem, describeDiskError } from '../../services/file-system';
import { FocusTrap } from '../../shared/focus-trap';

import type { FileOperationRequest } from './finder-model';

@Component({
  selector: 'app-file-operation-dialog',
  imports: [FocusTrap],
  template: `
    <div [attr.aria-label]="title()" (keydown.escape)="cancel($event)" appFocusTrap aria-modal="true" role="dialog">
      <form (submit)="submit($event)">
        <h2>{{ title() }}</h2>
        @switch (request().kind) {
          @case ('restore') {
            <p>Restore “{{ request().node.name }}” to a folder in your home directory. Existing files will be kept.</p>
            <label
              >Destination folder<select
                #folder
                [disabled]="busy()"
                [value]="destination()"
                (change)="destination.set(folder.value)"
              >
                @for (choice of folders(); track choice.value) {
                  <option [value]="choice.value">{{ choice.label }}</option>
                }
              </select></label
            >
          }
          @case ('open-with') {
            @if (applications().length) {
              <label
                >Application<select #app [value]="application()" (change)="application.set(app.value)">
                  @for (choice of applications(); track choice.id) {
                    <option [value]="choice.id">{{ choice.name }}</option>
                  }
                </select></label
              >
            } @else {
              <p>No installed application supports this file.</p>
            }
          }
        }
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <button [disabled]="busy()" (click)="cancel()" tabindex="0" type="button">Cancel</button>
          <button
            [disabled]="busy() || (request().kind === 'open-with' && !applications().length)"
            tabindex="0"
            type="submit"
          >
            {{ busy() ? 'Working…' : action() }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      z-index: 20;
      background: #0004;
    }
    form {
      width: min(380px, 90%);
      padding: 22px;
      border-radius: 12px;
      background: var(--win-2);
      color: var(--txt);
      box-shadow: 0 12px 50px #0005;
    }
    h2 {
      margin: 0 0 16px;
      font-size: 16px;
      overflow-wrap: anywhere;
    }
    p {
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    label {
      display: grid;
      gap: 8px;
    }
    input,
    select {
      box-sizing: border-box;
      width: 100%;
      padding: 8px;
      color: inherit;
      background: var(--field);
      border: 1px solid #888;
      border-radius: 5px;
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 20px;
    }
    button {
      background: var(--win);
      color: var(--txt);
      padding: 7px 14px;
      border: 1px solid #888;
      border-radius: 5px;
    }
    [role='alert'] {
      border-left: 3px solid var(--red);
      padding-left: 8px;
    }
  `
})
export class FileOperationDialog {
  private readonly fs = inject(FileSystem);
  private readonly opener = inject(FileOpener);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly destination = signal(JSON.stringify(DESKTOP));
  protected readonly applications = computed(() => this.opener.choices(this.request().node));
  protected readonly application = linkedSignal<string>(() => this.applications()[0]?.id ?? '');
  protected readonly action = computed(() => ({ restore: 'Restore', 'open-with': 'Open' })[this.request().kind]);
  protected readonly title = computed(
    () => `${this.request().kind === 'open-with' ? 'Open With' : this.action()} “${this.request().node.name}”`
  );
  protected readonly folders = computed(() => {
    const pending = [this.fs.nodeAt(HOME)];
    const choices: { value: string; label: string; path: DiskPath }[] = [];
    while (pending.length) {
      const node = pending.pop();
      if (!node?.path || node.kind !== 'folder' || isWithin(node.path, TRASH)) continue;
      choices.push({ value: JSON.stringify(node.path), label: node.path.join('/'), path: node.path });
      pending.push(...(node.children ?? []));
    }
    return choices.sort((a, b) => a.label.localeCompare(b.label));
  });

  readonly request = input.required<FileOperationRequest>();
  readonly finished = output<DiskPath | null>();

  protected cancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.busy()) this.finished.emit(null);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const request = this.request();
    if (this.busy() || !request.node.path) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const path = await this.execute(request, request.node.path);
      this.finished.emit(path);
    } catch (error) {
      this.error.set(describeDiskError(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async execute(request: FileOperationRequest, path: DiskPath): Promise<DiskPath> {
    if (request.kind === 'restore') {
      const destination = this.folders().find(folder => folder.value === this.destination());
      if (!destination) throw new Error('Choose an existing destination folder.');
      return this.fs.restore(path, destination.path);
    }
    const app = this.applications().find(app => app.id === this.application());
    if (!app || !this.opener.openApp(app.id, request.node)) throw new Error('Choose an available application.');
    return path;
  }
}
