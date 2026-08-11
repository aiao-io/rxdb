import { RxDB } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { FileNode } from '@aiao/rxdb-test/entities';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe, CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
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
  LucideUndo2 as Undo2,
  LucideX as X
} from '@lucide/angular';
import { HistorySidebarComponent } from '@modules/angular';
import { FileDragDropService } from '../services/file-drag-drop.service';
import { FilePathValidatorService } from '../services/file-path-validator.service';
import { TreeFileDragDropBase } from '../utils/tree-file-drag-drop.base';
import { TreeFileDragDropStore } from '../utils/tree-file.store';

/**
 * FileManagerVirtual 组件 - 虚拟滚动版本
 *
 * 特性：
 * - CDK Virtual Scroll 虚拟滚动渲染
 * - 支持完整 CRUD + 拖拽 + 搜索功能
 * - 拖拽边界自动滚动
 * - 适用于大数据量场景（1000+ 节点）
 */
@Component({
  selector: 'app-file-manager-virtual-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon, AsyncPipe, HistorySidebarComponent, ScrollingModule],
  providers: [FilePathValidatorService],
  templateUrl: './file-manager-virtual.page.html',
  styleUrl: './file-manager-virtual.page.scss',
  host: { class: 'page-host' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class FileManagerVirtualPage extends TreeFileDragDropBase<typeof FileNode> {
  /** 自动滚动定时器 */
  private autoScrollTimer: ReturnType<typeof setInterval> | null = null;

  /** 虚拟滚动初始化状态 */
  readonly $virtual_scroll_ready = signal(false);
  // Lucide icons
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

  // Virtual Scroll 配置
  readonly itemSize = 44; // 每个树节点的高度（px）
  readonly scrollViewport = viewChild<ElementRef>('virtualScrollViewport');
  readonly fullHeader = viewChild<ElementRef>('fullHeader');

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

  constructor() {
    const rxdb = inject(RxDB);
    const fileResource = useFindAll(FileNode, {
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });
    const history = rxdb.versionManager.history(FileNode);
    const store = new TreeFileDragDropStore(
      rxdb,
      inject(FilePathValidatorService),
      inject(FileDragDropService),
      fileResource,
      FileNode,
      history
    );

    super(store, fileResource, FileNode, history);

    // 资源清理：组件销毁时清理自动滚动定时器
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.stopAutoScroll();
    });

    // 检查虚拟滚动初始化
    setTimeout(() => {
      if (this.scrollViewport()) {
        this.$virtual_scroll_ready.set(true);
      } else {
        console.error('Virtual scroll viewport not found. Please check ScrollingModule import.');
      }
    }, 0);
  }

  getDisplayName(node: FileNode): string {
    if (node.type === 'folder') return node.name;
    if (!node.extension) return node.name;
    if (node.name.endsWith(`.${node.extension}`)) return node.name;
    return `${node.name}.${node.extension}`;
  }

  /**
   * 拖拽经过元素
   * 重写父类方法以添加自动滚动功能
   */
  override onDragOver(event: DragEvent, file: FileNode): void {
    super.onDragOver(event, file);
    this.handleAutoScroll(event);
  }

  /**
   * 拖拽离开元素
   * 重写父类方法以停止自动滚动
   */
  override onDragLeave(event: DragEvent): void {
    super.onDragLeave(event);

    const target = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as HTMLElement;

    if (!target.contains(related)) {
      this.stopAutoScroll();
    }
  }

  /**
   * 拖拽结束
   * 重写父类方法以清理自动滚动
   */
  override onDragEnd(event: DragEvent): void {
    super.onDragEnd(event);
    this.stopAutoScroll();
  }

  /**
   * 滚动事件监听
   * 根据滚动位置显示/隐藏粘性头部
   */
  onScroll(event: Event): void {
    const container = event.target as HTMLElement;
    const fullHeader = this.fullHeader()?.nativeElement;

    if (fullHeader) {
      const headerHeight = fullHeader.offsetHeight;
      this.$show_sticky_header.set(container.scrollTop > headerHeight);
    }
  }

  /**
   * 滚动到顶部
   */
  override scroll_to_top(): void {
    const viewport = this.scrollViewport()?.nativeElement;
    if (viewport) {
      viewport.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /**
   * 拖拽边界自动滚动
   * 当拖拽到虚拟滚动容器边缘时，自动滚动视口
   */
  private handleAutoScroll(event: DragEvent): void {
    const viewport = this.scrollViewport()?.nativeElement;
    if (!viewport) return;

    const scrollThreshold = 80; // 边界触发距离（px）
    const scrollSpeed = 15; // 滚动速度（每帧像素）

    const rect = viewport.getBoundingClientRect();
    const clientY = event.clientY;

    // 清除之前的定时器
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }

    // 判断是否在滚动触发区域
    const distanceFromTop = clientY - rect.top;
    const distanceFromBottom = rect.bottom - clientY;

    if (distanceFromTop < scrollThreshold && distanceFromTop > 0) {
      // 向上滚动 - 越靠近边缘速度越快
      const speed = Math.max(5, scrollSpeed * (1 - distanceFromTop / scrollThreshold));
      this.autoScrollTimer = setInterval(() => {
        viewport.scrollTop = Math.max(0, viewport.scrollTop - speed);
      }, 16); // 约 60fps
    } else if (distanceFromBottom < scrollThreshold && distanceFromBottom > 0) {
      // 向下滚动 - 越靠近边缘速度越快
      const speed = Math.max(5, scrollSpeed * (1 - distanceFromBottom / scrollThreshold));
      this.autoScrollTimer = setInterval(() => {
        const maxScroll = viewport.scrollHeight - viewport.clientHeight;
        viewport.scrollTop = Math.min(maxScroll, viewport.scrollTop + speed);
      }, 16);
    }
  }

  /**
   * 停止自动滚动
   */
  private stopAutoScroll(): void {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }
  }
}
