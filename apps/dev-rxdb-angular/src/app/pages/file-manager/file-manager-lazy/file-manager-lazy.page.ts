import { RxDB } from '@aiao/rxdb';
import { FileLarge } from '@aiao/rxdb-test/entities';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe, CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideChevronDown as ChevronDown,
  LucideChevronRight as ChevronRight,
  LucideChevronsDown as ChevronsDown,
  LucideChevronsUp as ChevronsUp,
  LucideFile as File,
  LucideFileArchive as FileArchive,
  LucideFileAudio as FileAudio,
  LucideFileCode as FileCode,
  LucideFileImage as FileImage,
  LucideFileText as FileText,
  LucideFileVideo as FileVideo,
  LucideFolder as Folder,
  LucideFolderOpen as FolderOpen,
  LucideHistory as History,
  LucideDynamicIcon,
  LucidePen as Pen,
  LucidePlus as Plus,
  LucideRedo2 as Redo2,
  LucideSearch as Search,
  LucideTrash2 as Trash2,
  LucideTriangleAlert as TriangleAlert,
  LucideUndo2 as Undo2,
  LucideX as X
} from '@lucide/angular';
import { HistorySidebarComponent } from '@modules/angular';
import { TreeFileDragDropBase } from '../utils/tree-file-drag-drop.base';
import { FILE_ENTITY_CLASS, FILE_HISTORY, TreeFileLazyStore } from './file-manager-lazy.store';

@Component({
  selector: 'app-file-manager-lazy-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon, AsyncPipe, HistorySidebarComponent, ScrollingModule],
  templateUrl: './file-manager-lazy.page.html',
  styleUrl: './file-manager-lazy.page.scss',
  host: { class: 'page-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    TreeFileLazyStore,
    { provide: FILE_ENTITY_CLASS, useValue: FileLarge },
    {
      provide: FILE_HISTORY,
      useFactory: () => {
        const rxdb = inject(RxDB);
        return rxdb.versionManager.history(FileLarge);
      }
    }
  ]
})
export default class FileManagerLazyPage extends TreeFileDragDropBase<typeof FileLarge> implements OnDestroy {
  private autoScrollTimer: ReturnType<typeof setInterval> | null = null;
  private currentScrollDirection: 'up' | 'down' | null = null;

  readonly ChevronDown = ChevronDown;
  readonly ChevronRight = ChevronRight;
  readonly ChevronsDown = ChevronsDown;
  readonly ChevronsUp = ChevronsUp;
  readonly Folder = Folder;
  readonly FolderOpen = FolderOpen;
  readonly File = File;
  readonly Plus = Plus;
  readonly Pen = Pen;
  readonly Trash2 = Trash2;
  readonly X = X;
  readonly Search = Search;
  readonly Undo2 = Undo2;
  readonly Redo2 = Redo2;
  readonly History = History;
  readonly FileText = FileText;
  readonly FileCode = FileCode;
  readonly FileImage = FileImage;
  readonly FileVideo = FileVideo;
  readonly FileAudio = FileAudio;
  readonly FileArchive = FileArchive;
  readonly TriangleAlert = TriangleAlert;

  // 常用文件扩展名选项
  readonly extensionOptions = [
    { value: '.txt', label: '.txt (文本)', icon: FileText },
    { value: '.md', label: '.md (Markdown)', icon: FileText },
    { value: '.json', label: '.json (JSON)', icon: FileCode },
    { value: '.js', label: '.js (JavaScript)', icon: FileCode },
    { value: '.ts', label: '.ts (TypeScript)', icon: FileCode },
    { value: '.html', label: '.html (HTML)', icon: FileCode },
    { value: '.css', label: '.css (CSS)', icon: FileCode },
    { value: '.jpg', label: '.jpg (图片)', icon: FileImage },
    { value: '.png', label: '.png (图片)', icon: FileImage },
    { value: '.pdf', label: '.pdf (PDF)', icon: FileText },
    { value: '.zip', label: '.zip (压缩包)', icon: FileArchive }
  ];

  readonly itemSize = 44;
  readonly scrollViewport = viewChild<ElementRef>('virtualScrollViewport');

  declare readonly store: TreeFileLazyStore<typeof FileLarge>;

  constructor() {
    const lazyStore = inject(TreeFileLazyStore<typeof FileLarge>);
    const history = inject(FILE_HISTORY);

    const fileResource = { value: lazyStore.visibleNodes };
    super(lazyStore, fileResource, FileLarge, history);
  }

  override onDragOver(event: DragEvent, file: FileLarge): void {
    super.onDragOver(event, file);
    this.handleAutoScroll(event);
  }

  override onDragLeave(event: DragEvent): void {
    super.onDragLeave(event);
    const target = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as HTMLElement;
    if (!target.contains(related)) this.stopAutoScroll();
  }

  override onDragEnd(event: DragEvent): void {
    super.onDragEnd(event);
    this.stopAutoScroll();
  }

  isNodeLoading(nodeId: string): boolean {
    return this.store.loadingNodes().has(nodeId);
  }

  getNodeError(nodeId: string): Error | undefined {
    return this.store.nodeErrors().get(nodeId);
  }

  getDisplayName(node: FileLarge): string {
    if (node.type === 'folder') return node.name;
    if (!node.extension) return node.name;
    if (node.name.endsWith(`.${node.extension}`)) return node.name;
    return `${node.name}.${node.extension}`;
  }

  retryLoadChildren(nodeId: string): void {
    this.store.retryLoadChildren(nodeId);
  }

  onScroll(event: Event): void {
    const container = event.target as HTMLElement;
    const fullHeader = this.fullHeaderRef()?.nativeElement;
    if (fullHeader) {
      const headerHeight = fullHeader.offsetHeight;
      this.$show_sticky_header.set(container.scrollTop > headerHeight);
    }
  }

  override scroll_to_top(): void {
    const viewport = this.scrollViewport()?.nativeElement;
    if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
  }

  ngOnDestroy(): void {
    this.stopAutoScroll();
    this.store.ngOnDestroy();
  }

  private handleAutoScroll(event: DragEvent): void {
    const viewport = this.scrollViewport()?.nativeElement;
    if (!viewport) return;
    const scrollThreshold = 80;
    const scrollSpeed = 15;
    const rect = viewport.getBoundingClientRect();
    const clientY = event.clientY;
    const distanceFromTop = clientY - rect.top;
    const distanceFromBottom = rect.bottom - clientY;

    // 判断应该滚动的方向
    let targetDirection: 'up' | 'down' | null = null;
    let speed = 0;

    if (distanceFromTop < scrollThreshold && distanceFromTop > 0) {
      targetDirection = 'up';
      speed = Math.max(5, scrollSpeed * (1 - distanceFromTop / scrollThreshold));
    } else if (distanceFromBottom < scrollThreshold && distanceFromBottom > 0) {
      targetDirection = 'down';
      speed = Math.max(5, scrollSpeed * (1 - distanceFromBottom / scrollThreshold));
    }

    // 如果方向改变或需要停止，清除现有 timer
    if (this.currentScrollDirection !== targetDirection) {
      this.stopAutoScroll();
      this.currentScrollDirection = targetDirection;
    }

    // 如果需要滚动且还没有 timer，创建新的
    if (targetDirection && !this.autoScrollTimer) {
      if (targetDirection === 'up') {
        this.autoScrollTimer = setInterval(() => {
          viewport.scrollTop = Math.max(0, viewport.scrollTop - speed);
        }, 16);
      } else {
        this.autoScrollTimer = setInterval(() => {
          const maxScroll = viewport.scrollHeight - viewport.clientHeight;
          viewport.scrollTop = Math.min(maxScroll, viewport.scrollTop + speed);
        }, 16);
      }
    }
  }

  private stopAutoScroll(): void {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }
    this.currentScrollDirection = null;
  }
}
