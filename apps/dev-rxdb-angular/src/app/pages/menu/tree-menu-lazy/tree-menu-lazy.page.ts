/* eslint-disable @typescript-eslint/member-ordering */
import type { RxDBEntityId } from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
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
import { ENTITY_CLASS, HISTORY, TreeMenuLazyStore } from './tree-menu-lazy.store';

/**
 * TreeMenuLazyPage - 懒加载树菜单演示组件
 *
 * @description
 * 演示树菜单的懒加载功能。仅在初始化时加载根节点，
 * 然后在节点展开时按需获取子节点。
 * 针对大型数据集进行了优化，避免预先加载所有节点会低效的情况。
 *
 * @remarks
 * **特性：**
 * - 初始加载仅获取根节点（parentId = null）
 * - 子节点在父节点展开时按需加载
 * - 通过RxJS订阅进行响应式更新
 * - 完整的CRUD操作（创建、读取、更新、删除）
 * - 拖拽支持，自动展开
 * - 搜索功能（仅限于已加载的节点）
 * - CDK虚拟滚动以获得最佳渲染性能
 * - 加载旋转器和错误处理
 * - 历史/撤销重做支持
 *
 * **性能：**
 * - 初始加载：100+根节点约100ms
 * - 展开操作：每个节点约50ms
 * - 内存高效：仅保留已加载的节点
 *
 * @example
 * ```typescript
 * // 路由配置
 * {
 *   path: 'tree-menu-lazy',
 *   loadComponent: () => import('./tree-menu-lazy.page')
 * }
 * ```
 *
 * @see {@link TreeMenuLazyStore} 底层数据管理
 */
@Component({
  selector: 'app-tree-menu-lazy-page',
  templateUrl: './tree-menu-lazy.page.html',
  styleUrls: ['./tree-menu-lazy.page.scss'],
  host: { class: 'page-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideDynamicIcon, ScrollingModule, AsyncPipe, HistorySidebarComponent],
  standalone: true,
  providers: [
    TreeMenuLazyStore,
    { provide: ENTITY_CLASS, useValue: MenuLarge },
    {
      provide: HISTORY,
      useFactory: () => {
        const rxdb = inject(RxDB);
        return rxdb.versionManager.history(MenuLarge);
      }
    }
  ]
})
export default class TreeMenuLazyPage extends TreeMenuDragDropBase<typeof MenuLarge> implements OnDestroy {
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

  /** 自动滚动定时器 */
  private autoScrollTimer: ReturnType<typeof setInterval> | null = null;

  declare readonly store: TreeMenuLazyStore<typeof MenuLarge>;

  constructor() {
    const lazyStore = inject(TreeMenuLazyStore<typeof MenuLarge>);
    const history = inject(HISTORY);

    // 为基类创建menuResource包装器
    const menuResource = {
      value: lazyStore.visibleNodes
    };

    super(menuResource, MenuLarge, history, lazyStore);
  }

  /**
   * 覆盖toggleExpand以使用懒加载
   */
  override toggleExpand(menu: MenuLarge): void {
    if (this.store.isExpanded(menu.id)) {
      this.store.collapseNode(menu.id);
    } else {
      this.store.expandNode(menu.id);
    }
  }

  /**
   * 覆盖toggleExpandAll以递归加载
   */
  override toggleExpandAll(): void {
    if (this.isAllExpanded()) {
      this.store.collapseAll();
    } else {
      this.store.expandAll();
    }
  }

  /**
   * 检查节点是否正在加载
   */
  isNodeLoading(nodeId: RxDBEntityId): boolean {
    return this.store.loadingNodes().has(nodeId);
  }

  /**
   * 检查节点是否有错误
   */
  getNodeError(nodeId: RxDBEntityId): Error | undefined {
    return this.store.nodeErrors().get(nodeId);
  }

  /**
   * 重试加载失败节点的子节点
   */
  retryLoadChildren(nodeId: RxDBEntityId): void {
    this.store.retryLoadChildren(nodeId);
  }

  /**
   * 拖拽经过元素
   */
  override onDragOver(event: DragEvent, targetMenu: MenuLarge): void {
    super.onDragOver(event, targetMenu);
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
      this.stopAutoScroll();
    }
  }

  /**
   * 拖拽结束
   */
  override onDragEnd(): void {
    super.onDragEnd();
    this.stopAutoScroll();
  }

  /**
   * 拖拽边界自动滚动
   */
  private handleAutoScroll(event: DragEvent): void {
    const viewport = this.scrollViewport()?.nativeElement;
    if (!viewport) return;

    const scrollThreshold = 80;
    const scrollSpeed = 15;

    const rect = viewport.getBoundingClientRect();
    const clientY = event.clientY;

    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }

    const distanceFromTop = clientY - rect.top;
    const distanceFromBottom = rect.bottom - clientY;

    if (distanceFromTop < scrollThreshold && distanceFromTop > 0) {
      const speed = Math.max(5, scrollSpeed * (1 - distanceFromTop / scrollThreshold));
      this.autoScrollTimer = setInterval(() => {
        viewport.scrollTop = Math.max(0, viewport.scrollTop - speed);
      }, 16);
    } else if (distanceFromBottom < scrollThreshold && distanceFromBottom > 0) {
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

  ngOnDestroy(): void {
    this.stopAutoScroll();
    this.store.ngOnDestroy();
  }
}
