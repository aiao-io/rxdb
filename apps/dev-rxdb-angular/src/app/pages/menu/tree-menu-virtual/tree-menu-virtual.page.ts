/* eslint-disable @typescript-eslint/member-ordering */
import { RxDB } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideChevronDown as ChevronDown,
  LucideChevronRight as ChevronRight,
  LucideChevronsDown as ChevronsDown,
  LucideChevronsUp as ChevronsUp,
  LucideGripVertical as GripVertical,
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
import { TreeMenuDragDropBase } from '../utils/tree-menu.drag-drop';

/**
 * MenuTreeVirtual 组件 - 场景2：大数据量（1000+ 节点）
 *
 * 特性：
 * - 全量加载所有菜单数据（懒加载可选）
 * - CDK Virtual Scroll 虚拟滚动渲染
 * - hasChildren 由数据库计算（MenuLarge实体）
 * - 支持完整 CRUD + 拖拽 + 搜索功能
 * - 拖拽边界自动滚动
 */
@Component({
  selector: 'app-tree-menu-virtual-page',
  templateUrl: './tree-menu-virtual.page.html',
  styleUrls: ['./tree-menu-virtual.page.scss'],
  host: { class: 'page-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideDynamicIcon, ScrollingModule, AsyncPipe, HistorySidebarComponent],
  standalone: true
})
export default class MenuTreePage extends TreeMenuDragDropBase<typeof MenuLarge> {
  // Icons
  readonly ChevronRight = ChevronRight;
  readonly ChevronDown = ChevronDown;
  readonly ChevronsDown = ChevronsDown;
  readonly ChevronsUp = ChevronsUp;
  readonly Pen = Pen;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;
  readonly X = X;
  readonly TriangleAlert = TriangleAlert;
  readonly GripVertical = GripVertical;
  readonly Undo2 = Undo2;
  readonly Redo2 = Redo2;
  readonly History = History;
  readonly Search = Search;

  // Virtual Scroll 配置
  readonly itemSize = 44; // 每个树节点的高度（px）
  readonly scrollViewport = viewChild<ElementRef>('scrollViewport');

  /** 自动滚动定时器 (T059) */
  private autoScrollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const rxdb = inject(RxDB);
    super(
      useFindAll(MenuLarge, {
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'sortOrder', sort: 'asc' }]
      }),
      MenuLarge,
      rxdb.versionManager.history(MenuLarge)
    );
  }

  /**
   * 拖拽经过元素
   */
  override onDragOver(event: DragEvent, targetMenu: MenuLarge): void {
    super.onDragOver(event, targetMenu);
    // T059: 拖拽边界自动滚动
    this.handleAutoScroll(event);
  }

  /**
   * 拖拽离开元素
   */
  override onDragLeave(event: DragEvent): void {
    super.onDragLeave(event);

    const target = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as HTMLElement;

    if (!target.contains(related)) {
      this.stopAutoScroll(); // T059: 停止自动滚动
    }
  }

  /**
   * 拖拽结束
   */
  override onDragEnd(): void {
    super.onDragEnd();
    this.stopAutoScroll(); // T059: 停止自动滚动
  }

  /**
   * T059: 拖拽边界自动滚动
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
