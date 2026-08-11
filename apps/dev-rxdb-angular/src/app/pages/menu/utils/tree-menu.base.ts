/* eslint-disable @angular-eslint/prefer-inject */
import type { HistoryScopeAPI, RxDBEntityId } from '@aiao/rxdb';
import { useAction } from '@aiao/rxdb-angular';
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  OnInit,
  PLATFORM_ID,
  Signal,
  signal,
  viewChild
} from '@angular/core';
import { listen } from '../../../shared/event-listener';
import { TreeMenuEntityConstructor, TreeMenuInstance, TreeNode } from '../models/tree-node.interface';
import { TreeMenuStore as MenuStore } from './tree-menu.store';

@Directive()
export abstract class TreeMenuBase<C extends TreeMenuEntityConstructor> implements OnInit, AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  fullHeaderRef = viewChild<ElementRef<HTMLElement>>('fullHeader');
  mainContainerRef = viewChild<ElementRef<HTMLElement>>('mainContainer');

  readonly $show_history = signal<boolean>(true);
  readonly $show_sticky_header = signal<boolean>(false);

  readonly $search_keyword = signal<string>('');
  readonly $new_menu_title = signal<string>('');
  readonly $edit_menu_title = signal<string>('');

  readonly add_1 = useAction(async (count?: number) => {
    // 模拟网络延迟，确保 loading 状态可见
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.store.add_many_menu(count ?? 100);
  });
  readonly add_2 = useAction((count?: number) => this.store.add_many_menu(count ?? 1000));
  readonly add_3 = useAction(async (count?: number) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.store.add_many_menu(count ?? 5000);
  });
  readonly add_4 = useAction((count?: number) => this.store.add_many_menu(count ?? 10000));
  readonly delete_all = useAction(() => this.store.deleteAllMenus());

  readonly batchAddOptions = [
    { count: 100, label: '添加 100 条', action: this.add_1 },
    { count: 1000, label: '添加 1000 条', action: this.add_2 },
    { count: 5000, label: '添加 5000 条', action: this.add_3 },
    { count: 10000, label: '添加 10000 条', action: this.add_4 }
  ];

  // Delegate Properties
  get expandedMenuIds() {
    return this.store.expandedMenuIds;
  }
  get editingMenuId() {
    return this.store.editingMenuId;
  }
  get selectedParentId() {
    return this.store.selectedParentId;
  }
  get menuToDelete() {
    return this.store.menuToDelete;
  }
  get pathConflictWarning() {
    return this.store.pathConflictWarning;
  }
  get searchKeyword() {
    return this.store.searchKeyword;
  }
  get matchedMenuIds() {
    return this.store.matchedMenuIds;
  }
  get deleteImpact() {
    return this.store.deleteImpact;
  }
  get expandedCount() {
    return this.store.expandedCount;
  }
  get isAllExpanded() {
    return this.store.isAllExpanded;
  }
  get treeNodes() {
    return this.store.treeNodes;
  }

  constructor(
    public store: MenuStore<C>,
    public readonly menuResource: { value: Signal<TreeMenuInstance<C>[]> },
    protected entityClass: C,
    public readonly history: HistoryScopeAPI
  ) {
    // 监听菜单标题变化，清除路径冲突警告
    effect(() => {
      const value = this.$new_menu_title();
      if (value && value.trim() && this.store.pathConflictWarning()) {
        this.store.clearPathWarning();
      }
    });

    // 监听搜索关键字变化（带 debounce）
    effect(onCleanup => {
      const value = this.$search_keyword();
      const debounceTimer = setTimeout(() => {
        this.store.setSearchKeyword(value?.trim() || '');
      }, 300);
      onCleanup(() => clearTimeout(debounceTimer));
    });
  }

  ngOnInit() {
    if (!this.isBrowser) return;
  }

  ngAfterViewInit() {
    const fullHeader = this.fullHeaderRef();
    const mainContainer = this.mainContainerRef();

    if (!this.isBrowser || !fullHeader || !mainContainer) return;

    const element = mainContainer.nativeElement;

    const checkVisibility = () => {
      const headerElement = fullHeader.nativeElement;
      const scrollTop = element.scrollTop;
      const headerOffsetTop = headerElement.offsetTop;
      const headerHeight = headerElement.offsetHeight;

      const shouldShow = scrollTop > headerOffsetTop + headerHeight;

      this.$show_sticky_header.set(shouldShow);
    };

    this.destroyRef.onDestroy(listen(element, 'scroll', checkVisibility, { passive: true }));
    checkVisibility();
  }

  toggleExpandAll(): void {
    this.store.toggleExpandAll();
  }

  toggleExpand(menu: TreeMenuInstance<C>): void {
    this.store.toggleExpand(menu);
  }

  async addRootMenu(event: Event): Promise<void> {
    event.preventDefault();
    const title = this.$new_menu_title().trim();
    if (!title) return;

    try {
      await this.store.addRootMenu(title);
      this.$new_menu_title.set('');
    } catch (error) {
      console.error('Error adding root menu:', error);
      alert('添加根菜单失败');
    }
  }

  selectParent(menuId: RxDBEntityId): void {
    this.store.selectParent(menuId);
  }

  cancelSelectParent(): void {
    this.store.cancelSelectParent();
    this.$new_menu_title.set('');
  }

  async addChildMenu(event: Event): Promise<void> {
    event.preventDefault();
    const title = this.$new_menu_title().trim();
    if (!title) return;

    try {
      await this.store.addChildMenu(title);
      this.$new_menu_title.set('');
    } catch (error) {
      console.error('Error adding child menu:', error);
      alert('添加子菜单失败');
    }
  }

  startEdit(event: Event, menu: TreeMenuInstance<C>): void {
    event.preventDefault();
    event.stopPropagation();
    this.store.startEdit(menu.id);
    this.$edit_menu_title.set(menu.title);
  }

  async saveEdit(event: Event): Promise<void> {
    event.preventDefault();
    const title = this.$edit_menu_title().trim();
    if (!title) return;

    try {
      await this.store.saveEdit(title);
    } catch (error) {
      console.error('Error updating menu:', error);
      alert('更新菜单失败');
    }
  }

  cancelEdit(): void {
    this.store.cancelEdit();
    this.$edit_menu_title.set('');
  }

  async deleteMenu(event: Event, menu: TreeMenuInstance<C>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    try {
      await this.store.deleteMenu(menu);
    } catch (error) {
      console.error('Error deleting menu:', error);
      alert('删除菜单失败');
    }
  }

  cancelDelete(): void {
    this.store.cancelDelete();
  }

  async executeCascadeDelete(): Promise<void> {
    try {
      await this.store.executeCascadeDelete();
    } catch (error) {
      console.error('Error deleting menu:', error);
      alert('删除菜单失败');
    }
  }

  async executePromoteChildrenDelete(): Promise<void> {
    try {
      await this.store.executePromoteChildrenDelete();
    } catch (error) {
      console.error('Error promoting children and deleting menu:', error);
      alert('删除失败');
    }
  }

  getSelectedParentTitle(): string {
    const parentId = this.store.selectedParentId();
    if (parentId === null) return '';
    const parent = this.menuResource.value().find(m => m.id === parentId);
    return parent?.title ?? '';
  }

  clearPathWarning(): void {
    this.store.clearPathWarning();
  }

  clearSearch(): void {
    this.$search_keyword.set('');
    this.store.setSearchKeyword('');
  }

  isMenuMatched(menuId: RxDBEntityId): boolean {
    return this.store.matchedMenuIds().has(menuId);
  }

  trackByMenuId(_index: number, node: TreeNode<TreeMenuInstance<C>>): RxDBEntityId {
    return node.menu.id;
  }

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }

  toggle_history(): void {
    this.$show_history.update(show => !show);
  }

  scroll_to_top(): void {
    const mainContainer = this.mainContainerRef();
    if (!mainContainer) return;
    mainContainer.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
