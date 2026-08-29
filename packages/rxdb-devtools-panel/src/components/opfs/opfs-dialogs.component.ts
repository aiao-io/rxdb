import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideTrash2 as Trash2, LucideTriangleAlert as TriangleAlert } from '@lucide/angular';
import { isBackdropInteraction } from '../../pages/opfs-page.utils';
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
          <h3 class="mb-4 text-base font-bold">新建文件夹</h3>
          <input
            class="input input-bordered w-full"
            [value]="newFolderName()"
            (input)="onFolderNameInput($event)"
            (keydown.enter)="createFolder.emit()"
            placeholder="文件夹名称"
            type="text"
          />
          <div class="modal-action">
            <button class="btn btn-sm" (click)="closeNewFolder.emit()">取消</button>
            <button class="btn btn-sm btn-primary" [disabled]="!newFolderName().trim()" (click)="createFolder.emit()">
              创建
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
            确认删除
          </h3>
          <p class="mb-4">
            确定要删除
            <span class="font-semibold">{{ deleteFile()?.type === 'file' ? '文件' : '文件夹' }}</span>
            <span class="text-error font-semibold">{{ deleteFile()?.name }}</span> 吗？
          </p>
          @if (deleteFile()?.type === 'directory') {
            <p class="text-warning mb-4 flex items-center gap-1 text-sm">
              <svg [lucideIcon]="TriangleAlert" aria-hidden="true" size="16"></svg>
              此操作将删除文件夹及其所有内容
            </p>
          }
          <div class="modal-action">
            <button class="btn btn-sm" (click)="closeDelete.emit()">取消</button>
            <button class="btn btn-sm btn-error" (click)="confirmDelete.emit()">删除</button>
          </div>
        </div>
      </div>
    }
  `
})
export class OpfsDialogsComponent {
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
