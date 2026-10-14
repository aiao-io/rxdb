/* eslint-disable @angular-eslint/prefer-inject */
import type { HistoryScopeAPI } from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
import { Directive, inject, Signal } from '@angular/core';
import { TreeMenuEntityConstructor, TreeMenuInstance } from '../models/tree-node.interface';
import { MenuDragDropService } from '../services/menu-drag-drop.service';
import { MenuSearchService } from '../services/menu-search.service';
import { PathValidatorService } from './path-validator';
import { TreeMenuBase } from './tree-menu.base';
import { TreeMenuDragDropStore } from './tree-menu.store';

@Directive()
export abstract class TreeMenuDragDropBase<C extends TreeMenuEntityConstructor> extends TreeMenuBase<C> {
  override readonly store: TreeMenuDragDropStore<C>;

  get dragDropState() {
    return this.store.dragDropState;
  }
  get highlightedMenuIds() {
    return this.store.highlightedMenuIds;
  }

  constructor(
    menuResource: { value: Signal<TreeMenuInstance<C>[]> },
    entityClass: C,
    history: HistoryScopeAPI,
    providedStore?: TreeMenuDragDropStore<C>
  ) {
    const store =
      providedStore ??
      new TreeMenuDragDropStore(
        inject(RxDB),
        inject(PathValidatorService),
        inject(MenuSearchService),
        inject(MenuDragDropService),
        menuResource,
        entityClass,
        history
      );
    super(store, menuResource, entityClass, history);
    this.store = store;
  }

  onDragStart(event: DragEvent, menu: TreeMenuInstance<C>): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(menu.id));
    this.store.onDragStart(menu.id);
  }

  onDragOver(event: DragEvent, targetMenu: TreeMenuInstance<C>): void {
    event.preventDefault();
    if (!event.dataTransfer) return;

    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    const { isValid } = this.store.onDragOver(targetMenu, event.clientY, rect);

    event.dataTransfer.dropEffect = isValid ? 'move' : 'none';
  }

  onDragLeave(event: DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as HTMLElement;

    if (!target.contains(related)) {
      this.store.onDragLeave();
    }
  }

  async onDrop(event: DragEvent, targetMenu: TreeMenuInstance<C>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    // 失败只进页内提示（`拖放失败：…`）；拖拽状态在 store.onDrop 开始（异步写入前）就复位
    await this.runWrite('拖放', () => this.store.onDrop(targetMenu));
  }

  onDragEnd(): void {
    this.store.onDragEnd();
  }

  // ── Pointer 拖拽（触屏可用；store 判定逻辑与原生 DnD 完全共用） ──────────────────

  /**
   * 手柄 pointerdown 起拖：捕获指针后 move/up 都落回手柄，落点用 elementFromPoint 命中行。
   */
  startPointerDrag(event: PointerEvent, menu: TreeMenuInstance<C>): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.store.onDragStart(menu.id);
  }

  /** 拖动中：按指针位置命中目标行，复用 store 的三档落点判定。 */
  onPointerMove(event: PointerEvent): void {
    if (this.store.dragDropState().draggedItemId === null) return;
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-menu-id]') as HTMLElement | null;
    if (!row) {
      this.store.onDragLeave();
      return;
    }
    const menu = this.menuResource.value().find(m => m.id === row.getAttribute('data-menu-id'));
    if (!menu) return;
    this.store.onDragOver(menu, event.clientY, row.getBoundingClientRect());
  }

  /** 松开：命中目标行则走 store 落库，否则仅复位拖拽状态。 */
  async onPointerUp(event: PointerEvent): Promise<void> {
    if (this.store.dragDropState().draggedItemId === null) return;
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-menu-id]') as HTMLElement | null;
    const menu = row ? this.menuResource.value().find(m => m.id === row.getAttribute('data-menu-id')) : undefined;
    if (menu) {
      await this.runWrite('拖放', () => this.store.onDrop(menu));
    } else {
      this.store.onDragEnd();
    }
  }
}
