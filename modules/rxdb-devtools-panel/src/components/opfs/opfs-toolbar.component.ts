import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  LucideFolderPlus as FolderPlus,
  LucideGrid2x2 as Grid2x2,
  LucideHouse as House,
  LucideList as List,
  LucideDynamicIcon,
  LucideRefreshCw as RefreshCw,
  LucideUpload as Upload
} from '@lucide/angular';
import { PanelI18nService } from '../../services/panel-i18n.service';

@Component({
  selector: 'app-opfs-toolbar',
  imports: [NgClass, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border-base-300 flex items-center gap-2 border-b p-2">
      <button class="btn btn-xs btn-ghost" [title]="t('opfs.rootTitle')" (click)="navigateRoot.emit()">
        <svg [lucideIcon]="House" aria-hidden="true" size="16"></svg>
      </button>
      <button class="btn btn-xs btn-ghost" [title]="t('common.refresh')" (click)="refreshRequested.emit()">
        <svg [class.animate-spin]="loading()" [lucideIcon]="RefreshCw" aria-hidden="true" size="16"></svg>
      </button>
      <div class="divider divider-horizontal m-0"></div>
      <div class="join">
        <button
          class="join-item btn btn-xs"
          [ngClass]="{ 'btn-active': viewMode() === 'list', 'btn-ghost': viewMode() !== 'list' }"
          [title]="t('opfs.listView')"
          (click)="viewModeChange.emit('list')"
        >
          <svg [lucideIcon]="List" aria-hidden="true" size="16"></svg>
        </button>
        <button
          class="join-item btn btn-xs"
          [ngClass]="{ 'btn-active': viewMode() === 'grid', 'btn-ghost': viewMode() !== 'grid' }"
          [title]="t('opfs.gridView')"
          (click)="viewModeChange.emit('grid')"
        >
          <svg [lucideIcon]="Grid2x2" aria-hidden="true" size="16"></svg>
        </button>
      </div>
      <div class="divider divider-horizontal m-0"></div>
      <button class="btn btn-xs btn-primary" (click)="fileInput.click()">
        <svg [lucideIcon]="Upload" aria-hidden="true" size="16"></svg>
        {{ t('opfs.uploadFile') }}
      </button>
      <button class="btn btn-xs btn-secondary" (click)="createFolderRequested.emit()">
        <svg [lucideIcon]="FolderPlus" aria-hidden="true" size="16"></svg>
        {{ t('opfs.newFolder') }}
      </button>
      <input class="hidden" #fileInput (change)="onFileInput($event)" multiple type="file" />
    </div>
  `
})
export class OpfsToolbarComponent {
  protected readonly t = inject(PanelI18nService).t;
  readonly loading = input.required<boolean>();
  readonly viewMode = input.required<'list' | 'grid'>();
  readonly navigateRoot = output<void>();
  readonly refreshRequested = output<void>();
  readonly viewModeChange = output<'list' | 'grid'>();
  readonly uploadRequested = output<File[]>();
  readonly createFolderRequested = output<void>();

  protected readonly FolderPlus = FolderPlus;
  protected readonly Grid2x2 = Grid2x2;
  protected readonly House = House;
  protected readonly List = List;
  protected readonly RefreshCw = RefreshCw;
  protected readonly Upload = Upload;

  onFileInput(event: Event): void {
    const inputElement = event.currentTarget;
    if (!(inputElement instanceof HTMLInputElement)) return;
    const files = Array.from(inputElement.files ?? []);
    if (files.length > 0) this.uploadRequested.emit(files);
    inputElement.value = '';
  }
}
