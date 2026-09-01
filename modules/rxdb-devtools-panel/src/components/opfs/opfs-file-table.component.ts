import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideDownload as Download,
  LucideFile as FileIcon,
  LucideFolder as Folder,
  LucideDynamicIcon,
  LucideTrash2 as Trash2
} from '@lucide/angular';
import { formatFileDate, formatFileSize } from '../../pages/opfs-page.utils';
import type { OPFSFile } from '../../types/devtools.types';

@Component({
  selector: 'app-opfs-file-table',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-full overflow-x-auto">
      <table class="table-sm table-pin-rows table">
        <thead>
          <tr class="bg-base-200">
            <th class="w-1/2">名称</th>
            <th>大小</th>
            <th>修改时间</th>
            <th class="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          @for (file of files(); track file.path) {
            <tr class="hover:bg-base-200/50" (contextmenu)="contextMenuRequested.emit({ event: $event, file })">
              <td>
                <div class="flex items-center gap-2">
                  @if (file.type === 'directory') {
                    <svg class="text-warning" [lucideIcon]="Folder" aria-hidden="true" size="16"></svg>
                    <button class="link link-hover" (click)="navigate.emit(file.path)">{{ file.name }}</button>
                  } @else {
                    <svg class="text-base-content/70" [lucideIcon]="FileIcon" aria-hidden="true" size="16"></svg>
                    <span>{{ file.name }}</span>
                  }
                </div>
              </td>
              <td class="text-base-content/60 text-xs">{{ formatFileSize(file.size) }}</td>
              <td class="text-base-content/60 text-xs">{{ formatFileDate(file.lastModified) }}</td>
              <td class="text-right">
                <div class="flex items-center justify-end gap-1">
                  @if (file.type === 'file') {
                    <button class="btn btn-ghost btn-xs" (click)="downloadRequested.emit(file)" title="下载">
                      <svg [lucideIcon]="Download" aria-hidden="true" size="14"></svg>
                    </button>
                  }
                  <button class="btn btn-ghost btn-xs text-error" (click)="deleteRequested.emit(file)" title="删除">
                    <svg [lucideIcon]="Trash2" aria-hidden="true" size="14"></svg>
                  </button>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class OpfsFileTableComponent {
  readonly files = input.required<readonly OPFSFile[]>();
  readonly navigate = output<string>();
  readonly downloadRequested = output<OPFSFile>();
  readonly deleteRequested = output<OPFSFile>();
  readonly contextMenuRequested = output<{ event: MouseEvent; file: OPFSFile }>();

  protected readonly Download = Download;
  protected readonly FileIcon = FileIcon;
  protected readonly Folder = Folder;
  protected readonly Trash2 = Trash2;
  protected readonly formatFileDate = formatFileDate;
  protected readonly formatFileSize = formatFileSize;
}
