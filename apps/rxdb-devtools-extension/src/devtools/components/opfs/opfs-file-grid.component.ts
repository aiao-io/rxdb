import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideFile as FileIcon, LucideFolder as Folder, LucideDynamicIcon } from '@lucide/angular';
import { formatFileSize } from '../../pages/opfs-page.utils';
import type { OPFSFile } from '../../types/devtools.types';

@Component({
  selector: 'app-opfs-file-grid',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      @for (file of files(); track file.path) {
        <div
          class="hover:bg-base-200 group flex cursor-pointer flex-col items-center rounded-lg p-3 transition-colors"
          (click)="file.type === 'directory' ? navigate.emit(file.path) : null"
          (contextmenu)="contextMenuRequested.emit({ event: $event, file })"
          (dblclick)="file.type === 'file' ? downloadRequested.emit(file) : null"
          (keydown.enter)="activateRequested.emit(file)"
          (keydown.space)="activateRequested.emit(file); $event.preventDefault()"
          role="button"
          tabindex="0"
        >
          @if (file.type === 'directory') {
            <svg class="text-warning mb-2" [lucideIcon]="Folder" aria-hidden="true" size="32"></svg>
          } @else {
            <svg class="text-base-content/70 mb-2" [lucideIcon]="FileIcon" aria-hidden="true" size="32"></svg>
          }
          <span class="w-full truncate text-center text-xs" [title]="file.name">{{ file.name }}</span>
          @if (file.type === 'file') {
            <span class="text-base-content/50 text-xs">{{ formatFileSize(file.size) }}</span>
          }
        </div>
      }
    </div>
  `
})
export class OpfsFileGridComponent {
  readonly files = input.required<readonly OPFSFile[]>();
  readonly navigate = output<string>();
  readonly downloadRequested = output<OPFSFile>();
  readonly activateRequested = output<OPFSFile>();
  readonly contextMenuRequested = output<{ event: MouseEvent; file: OPFSFile }>();

  protected readonly FileIcon = FileIcon;
  protected readonly Folder = Folder;
  protected readonly formatFileSize = formatFileSize;
}
