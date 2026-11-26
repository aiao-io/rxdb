import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  LucideDownload as Download,
  LucideFolderOpen as FolderOpen,
  LucideDynamicIcon,
  LucideTrash2 as Trash2
} from '@lucide/angular';
import { PanelI18nService } from '../../services/panel-i18n.service';
import type { OPFSFile } from '../../types/devtools.types';

/** OPFS 上下文菜单的位置、可见性和目标文件。 */
export interface OpfsContextMenuState {
  show: boolean;
  x: number;
  y: number;
  file: OPFSFile | null;
}

/** 展示 OPFS 文件或目录操作，并向父组件发出用户意图。 */
@Component({
  selector: 'app-opfs-context-menu',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state().show) {
      <ul
        class="bg-base-300/95 border-base-content/10 menu fixed z-50 w-40 rounded-lg border p-1.5 text-sm shadow-2xl"
        [style.backdrop-filter]="'blur(12px)'"
        [style.left.px]="state().x"
        [style.top.px]="state().y"
      >
        @if (state().file?.type === 'directory') {
          <li>
            <button class="gap-2 px-2 py-1.5" (click)="openRequested.emit()" type="button">
              <svg [lucideIcon]="FolderOpen" aria-hidden="true" size="14"></svg>
              {{ t('common.open') }}
            </button>
          </li>
        } @else {
          <li>
            <button class="gap-2 px-2 py-1.5" (click)="downloadRequested.emit()" type="button">
              <svg [lucideIcon]="Download" aria-hidden="true" size="14"></svg>
              {{ t('common.download') }}
            </button>
          </li>
        }
        <li>
          <button class="text-error gap-2 px-2 py-1.5" (click)="deleteRequested.emit()" type="button">
            <svg [lucideIcon]="Trash2" aria-hidden="true" size="14"></svg>
            {{ t('common.delete') }}
          </button>
        </li>
      </ul>
    }
  `,
  host: {
    '(document:click)': 'onDocumentClick()'
  }
})
export class OpfsContextMenuComponent {
  protected readonly t = inject(PanelI18nService).t;
  readonly state = input.required<OpfsContextMenuState>();
  readonly openRequested = output<void>();
  readonly downloadRequested = output<void>();
  readonly deleteRequested = output<void>();
  readonly closed = output<void>();

  protected readonly Download = Download;
  protected readonly FolderOpen = FolderOpen;
  protected readonly Trash2 = Trash2;

  onDocumentClick(): void {
    this.closed.emit();
  }
}
