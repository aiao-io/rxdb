import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideTrash2 as Trash2, LucideTriangleAlert as TriangleAlert } from '@lucide/angular';
import { isBackdropInteraction } from '../../pages/opfs-page.utils';
import { PanelI18nService } from '../../services/panel-i18n.service';
import type { OPFSFile } from '../../types/devtools.types';

@Component({
  selector: 'app-opfs-dialogs',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showNewFolder()) {
      <div
        class="modal modal-open"
        (click)="closeNewFolderFromBackdrop($event)"
        (keydown.escape)="closeNewFolder.emit()"
        tabindex="-1"
      >
        <div class="modal-box">
          <h3 class="mb-4 text-base font-bold">{{ t('opfs.newFolder') }}</h3>
          <input
            class="input input-bordered w-full"
            [value]="newFolderName()"
            (input)="onFolderNameInput($event)"
            (keydown.enter)="createFolder.emit()"
            [placeholder]="t('opfs.folderNamePlaceholder')"
            type="text"
          />
          <div class="modal-action">
            <button class="btn btn-sm" (click)="closeNewFolder.emit()">{{ t('common.cancel') }}</button>
            <button class="btn btn-sm btn-primary" [disabled]="!newFolderName().trim()" (click)="createFolder.emit()">
              {{ t('common.create') }}
            </button>
          </div>
        </div>
      </div>
    }
    @if (deleteFile()) {
      <div
        class="modal modal-open"
        (click)="closeDeleteFromBackdrop($event)"
        (keydown.escape)="closeDelete.emit()"
        tabindex="-1"
      >
        <div class="modal-box">
          <h3 class="mb-4 flex items-center gap-2 text-base font-bold">
            <svg class="text-error" [lucideIcon]="Trash2" aria-hidden="true" size="18"></svg>
            {{ t('opfs.confirmDeleteTitle') }}
          </h3>
          <p class="mb-4">
            @if (deleteFile()?.type === 'file') {
              {{ t('opfs.deleteFileConfirm', { name: deleteFile()?.name }) }}
            } @else {
              {{ t('opfs.deleteFolderConfirm', { name: deleteFile()?.name }) }}
            }
          </p>
          @if (deleteFile()?.type === 'directory') {
            <p class="text-warning mb-4 flex items-center gap-1 text-sm">
              <svg [lucideIcon]="TriangleAlert" aria-hidden="true" size="16"></svg>
              {{ t('opfs.deleteFolderWarning') }}
            </p>
          }
          <div class="modal-action">
            <button class="btn btn-sm" (click)="closeDelete.emit()">{{ t('common.cancel') }}</button>
            <button class="btn btn-sm btn-error" (click)="confirmDelete.emit()">{{ t('common.delete') }}</button>
          </div>
        </div>
      </div>
    }
  `
})
export class OpfsDialogsComponent {
  protected readonly t = inject(PanelI18nService).t;
  readonly showNewFolder = input.required<boolean>();
  readonly newFolderName = input.required<string>();
  readonly deleteFile = input.required<OPFSFile | null>();
  readonly newFolderNameChange = output<string>();
  readonly createFolder = output<void>();
  readonly closeNewFolder = output<void>();
  readonly confirmDelete = output<void>();
  readonly closeDelete = output<void>();

  protected readonly Trash2 = Trash2;
  protected readonly TriangleAlert = TriangleAlert;

  closeNewFolderFromBackdrop(event: MouseEvent): void {
    if (isBackdropInteraction(event)) this.closeNewFolder.emit();
  }

  closeDeleteFromBackdrop(event: MouseEvent): void {
    if (isBackdropInteraction(event)) this.closeDelete.emit();
  }

  onFolderNameInput(event: Event): void {
    const target = event.currentTarget;
    if (target instanceof HTMLInputElement) this.newFolderNameChange.emit(target.value);
  }
}
