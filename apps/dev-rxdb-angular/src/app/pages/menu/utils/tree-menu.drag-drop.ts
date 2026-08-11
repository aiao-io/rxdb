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
    try {
      await this.store.onDrop(targetMenu);
    } catch (error: unknown) {
      console.error('Drop error:', error);
      alert(error instanceof Error ? error.message : '拖放操作失败');
    }
  }

  onDragEnd(): void {
    this.store.onDragEnd();
  }
}
