import type { HistoryScopeAPI, RxDBEntityId } from '@aiao/rxdb';
import { getEntityMutations, RxDB } from '@aiao/rxdb';
import { generateKeyBetween } from '@aiao/utils';
import { computed, signal, Signal } from '@angular/core';
import { runViewTransition, ViewTransitionStarter } from '../../../shared/view-transition';
import { DragDropState, DropMode } from '../models/drag-drop-types';
import { TreeMenuEntityConstructor, TreeMenuInstance, TreeNode } from '../models/tree-node.interface';
import { MenuDragDropService } from '../services/menu-drag-drop.service';
import { MenuSearchService } from '../services/menu-search.service';
import { PathConflict, PathValidatorService } from './path-validator';
import {
  calculateDropMode as calcDropMode,
  collectDescendants,
  compareSortOrder,
  countDescendants,
  generateBatchMenus
} from './tree-utils';

export class TreeMenuStore<C extends TreeMenuEntityConstructor> {
  // Internal State
  protected autoExpandTimer: ReturnType<typeof setTimeout> | null = null;
  protected autoExpandTargetId: RxDBEntityId | null = null;

  // State Signals
  readonly expandedMenuIds = signal<Set<RxDBEntityId>>(new Set());
  readonly editingMenuId = signal<RxDBEntityId | null>(null);
  readonly selectedParentId = signal<RxDBEntityId | null>(null);
  readonly menuToDelete = signal<TreeMenuInstance<C> | null>(null);
  readonly pathConflictWarning = signal<PathConflict | null>(null);
  readonly searchKeyword = signal<string>('');

  // Computed Properties
  readonly matchedMenuIds = computed(() => {
    const keyword = this.searchKeyword();
    if (!keyword) return new Set<RxDBEntityId>();
    return this.searchService.filterTreeNodes(this.menuResource.value(), keyword);
  });

  readonly deleteImpact = computed(() => {
    const menu = this.menuToDelete();
    if (!menu) return { childrenCount: 0, descendantsCount: 0 };

    const allMenus = this.menuResource.value();
    const children = allMenus.filter(m => m.parentId === menu.id);

    return {
      childrenCount: children.length,
      descendantsCount: countDescendants(menu.id, allMenus)
    };
  });

  readonly expandedCount = computed(() => this.expandedMenuIds().size);

  readonly isAllExpanded = computed(() => {
    const expandedCount = this.expandedCount();
    if (expandedCount === 0) return false;

    const menus = this.menuResource.value();
    const parentIds = new Set<RxDBEntityId>(menus.map(m => m.parentId).filter(id => id != null));
    return expandedCount >= parentIds.size;
  });

  readonly treeNodes = computed(() => {
    const menus = this.menuResource.value();
    const expandedIds = this.expandedMenuIds();
    const matchedIds = this.matchedMenuIds();
    // P1-1：`hasSearch` **必须由关键字决定，不能由结果条数决定**。
    // 原先是 `matchedIds.size > 0` —— 搜一个匹配不到的词时 hasSearch 变 false，
    // 整段过滤被跳过，页面显示**全量节点**：用户看到的是"搜什么都出来了"。
    const hasSearch = this.searchKeyword().trim().length > 0;
    const nodes: TreeNode<TreeMenuInstance<C>>[] = [];

    // 构建映射表
    const childrenMap = new Map<RxDBEntityId | null, TreeMenuInstance<C>[]>();
    menus.forEach(menu => {
      const parentId = menu.parentId ?? null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(menu);
    });

    // P0-3：这两张索引**每节点重建一次**是 O(n²) —— `shouldShowMenu` 每次调用重建
    // 整张 childrenByParentId，`expandMatchedAncestors` 每次调用重建整张 menuById。
    // 10k 节点时每次渲染上亿次操作。改为整棵树只算一次。
    //
    // 可见集恰好等于 `matchedIds ∪ ancestors(matchedIds)`：
    // `shouldShowMenu(x)` = "x 命中" 或 "x 有命中的后代"，
    // 而"x 有命中的后代" ⟺ "x 是某个命中节点的真祖先" ⟺ x ∈ expandMatchedAncestors(...)。
    const ancestorIds = hasSearch ? this.searchService.expandMatchedAncestors(menus, matchedIds) : null;
    const visibleIds = ancestorIds ? new Set([...matchedIds, ...ancestorIds]) : null;

    // 递归构建树节点
    const buildNodes = (parentId: RxDBEntityId | null, level: number) => {
      const children = childrenMap.get(parentId) || [];

      // 按 sortOrder 排序
      const sortedChildren = [...children].sort(compareSortOrder);

      sortedChildren.forEach(menu => {
        // 搜索过滤：只显示匹配的菜单或其祖先节点
        if (visibleIds && !visibleIds.has(menu.id)) {
          return;
        }

        const hasChildren = childrenMap.has(menu.id) && childrenMap.get(menu.id)!.length > 0;
        // 搜索时自动展开匹配项的祖先节点
        const isExpanded =
          ancestorIds ? ancestorIds.has(menu.id) || expandedIds.has(menu.id) : expandedIds.has(menu.id);

        nodes.push({
          menu,
          level,
          isExpanded,
          hasChildren
        });

        if (isExpanded) {
          buildNodes(menu.id, level + 1);
        }
      });
    };

    buildNodes(null, 0);
    return nodes;
  });

  constructor(
    protected rxdb: RxDB,
    protected pathValidator: PathValidatorService,
    protected searchService: MenuSearchService,
    protected menuResource: { value: Signal<TreeMenuInstance<C>[]> },
    protected entityClass: C,
    protected history: HistoryScopeAPI
  ) {}

  // Actions & Methods

  setSearchKeyword(keyword: string) {
    this.searchKeyword.set(keyword);
  }

  toggleExpandAll(): void {
    if (this.isAllExpanded()) {
      this.expandedMenuIds.set(new Set());
    } else {
      const menus = this.menuResource.value();
      const parentIds = new Set<RxDBEntityId>(menus.map(m => m.parentId).filter(id => id != null));
      this.expandedMenuIds.set(parentIds);
    }
  }

  toggleExpand(menu: TreeMenuInstance<C>): void {
    this.expandedMenuIds.update(expanded => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(menu.id)) {
        newExpanded.delete(menu.id);
      } else {
        newExpanded.add(menu.id);
      }
      return newExpanded;
    });
  }

  selectParent(menuId: RxDBEntityId): void {
    this.selectedParentId.set(menuId);
    this.expandedMenuIds.update(expanded => {
      const newExpanded = new Set(expanded);
      newExpanded.add(menuId);
      return newExpanded;
    });
  }

  cancelSelectParent(): void {
    this.selectedParentId.set(null);
  }

  async addRootMenu(title: string): Promise<void> {
    const conflict = this.pathValidator.checkPathConflict(title, null, this.menuResource.value());
    if (conflict.hasConflict) {
      this.pathConflictWarning.set(conflict);
      return;
    }

    const rootMenus = this.menuResource
      .value()
      .filter(m => m.parentId == null)
      .sort(compareSortOrder);

    const lastRoot = rootMenus[rootMenus.length - 1];
    const newSortOrder = generateKeyBetween(lastRoot?.sortOrder ?? null, null);

    const menu = this.createEntity();
    menu.title = title;
    menu.sortOrder = newSortOrder;
    await menu.save();

    this.expandedMenuIds.update(ids => {
      ids.add(menu.id);
      return new Set(ids);
    });
  }

  async addChildMenu(title: string): Promise<void> {
    const parentId = this.selectedParentId();
    if (parentId === null) return;

    const conflict = this.pathValidator.checkPathConflict(title, parentId, this.menuResource.value());
    if (conflict.hasConflict) {
      this.pathConflictWarning.set(conflict);
      return;
    }

    const siblings = this.menuResource
      .value()
      .filter(m => m.parentId === parentId)
      .sort(compareSortOrder);

    const lastSibling = siblings[siblings.length - 1];
    const newSortOrder = generateKeyBetween(lastSibling?.sortOrder ?? null, null);

    const menu = this.createEntity();
    menu.title = title;
    menu.sortOrder = newSortOrder;
    const parentMenu = this.menuResource.value().find(m => m.id === parentId);
    if (parentMenu) {
      menu.parentId = parentMenu.id;
    }

    await menu.save();
    this.selectedParentId.set(null);
  }

  startEdit(menuId: RxDBEntityId): void {
    this.editingMenuId.set(menuId);
  }

  async saveEdit(title: string): Promise<void> {
    const menuId = this.editingMenuId();
    if (menuId === null) return;
    const menu = this.menuResource.value().find(m => m.id === menuId);
    if (!menu) return;

    menu.title = title;
    await menu.save();
    this.editingMenuId.set(null);
  }

  cancelEdit(): void {
    this.editingMenuId.set(null);
  }

  async deleteMenu(menu: TreeMenuInstance<C>): Promise<void> {
    const allMenus = this.menuResource.value();
    const hasChildren = allMenus.some(m => m.parentId === menu.id);

    if (!hasChildren) {
      await menu.remove();
    } else {
      this.menuToDelete.set(menu);
    }
  }

  cancelDelete(): void {
    this.menuToDelete.set(null);
  }

  async executeCascadeDelete(): Promise<void> {
    const menu = this.menuToDelete();
    if (!menu) return;

    const allMenus = this.menuResource.value();
    const descendantIds = collectDescendants(menu.id, allMenus);
    const menusToRemove = allMenus.filter(m => m.id === menu.id || descendantIds.has(m.id));

    await this.rxdb.entityManager.removeMany(menusToRemove);
    this.menuToDelete.set(null);
  }

  async executePromoteChildrenDelete(): Promise<void> {
    const menu = this.menuToDelete();
    if (!menu) return;

    const allMenus = this.menuResource.value();
    const children = allMenus.filter(m => m.parentId === menu.id);
    const newParentId = menu.parentId;
    const newParent = newParentId != null ? allMenus.find(m => m.id === newParentId) : null;

    children.forEach(child => {
      child.parentId = newParent?.id ?? null;
    });

    const options = getEntityMutations<C>({
      need_save_entities: children,
      need_remove_entities: [menu]
    });

    await this.rxdb.entityManager.mutations(options);
    this.menuToDelete.set(null);
  }

  clearPathWarning(): void {
    this.pathConflictWarning.set(null);
  }

  // History
  undo(): void {
    void this.history.undo();
  }

  redo(): void {
    void this.history.redo();
  }

  // Batch
  async add_many_menu(total: number) {
    const existingRoots = this.menuResource
      .value()
      .filter(m => m.parentId == null)
      .sort(compareSortOrder);

    const menus = generateBatchMenus(total, () => this.createEntity(), existingRoots);
    await this.rxdb.entityManager.saveMany<C>(menus);
  }

  async deleteAllMenus() {
    const allMenus = this.menuResource.value();
    await this.rxdb.entityManager.removeMany<C>(allMenus);
  }

  // Helpers
  protected clearAutoExpandTimer(): void {
    if (this.autoExpandTimer) {
      clearTimeout(this.autoExpandTimer);
      this.autoExpandTimer = null;
    }
    this.autoExpandTargetId = null;
  }

  private createEntity(): TreeMenuInstance<C> {
    return new this.entityClass() as TreeMenuInstance<C>;
  }
}

export class TreeMenuDragDropStore<C extends TreeMenuEntityConstructor> extends TreeMenuStore<C> {
  readonly dragDropState = signal<DragDropState>({
    draggedItemId: null,
    targetItemId: null,
    dropMode: null,
    isValidTarget: false
  });

  readonly highlightedMenuIds = computed(() => {
    const state = this.dragDropState();
    if (state.targetItemId === null || !state.isValidTarget || state.dropMode !== 'into') {
      return new Set<RxDBEntityId>();
    }

    const allMenus = this.menuResource.value();
    const targetMenu = allMenus.find(m => m.id === state.targetItemId);
    if (!targetMenu) return new Set<RxDBEntityId>();

    return collectDescendants(targetMenu.id, allMenus);
  });

  constructor(
    rxdb: RxDB,
    pathValidator: PathValidatorService,
    searchService: MenuSearchService,
    protected dragDropService: MenuDragDropService,
    menuResource: { value: Signal<TreeMenuInstance<C>[]> },
    entityClass: C,
    history: HistoryScopeAPI
  ) {
    super(rxdb, pathValidator, searchService, menuResource, entityClass, history);
  }

  // Drag & Drop Logic

  onDragStart(menuId: RxDBEntityId): void {
    this.dragDropState.update(state => ({
      ...state,
      draggedItemId: menuId,
      dragStartTime: Date.now()
    }));
  }

  onDragOver(
    targetMenu: TreeMenuInstance<C>,
    clientY: number,
    rect: DOMRect
  ): { dropMode: DropMode | null; isValid: boolean } {
    const draggedId = this.dragDropState().draggedItemId;
    if (draggedId === null) return { dropMode: null, isValid: false };

    const draggedMenu = this.menuResource.value().find(m => m.id === draggedId);
    if (!draggedMenu) return { dropMode: null, isValid: false };

    const dropMode = calcDropMode(clientY, rect);
    const isValid = this.dragDropService.isValidDropTarget(
      draggedMenu,
      targetMenu,
      dropMode,
      this.menuResource.value()
    );

    const prevTargetId = this.dragDropState().targetItemId;
    if (prevTargetId !== targetMenu.id) {
      this.clearAutoExpandTimer();
      this.autoExpandTargetId = null;
    }

    this.dragDropState.update(state => ({
      ...state,
      targetItemId: targetMenu.id,
      dropMode,
      isValidTarget: isValid
    }));

    if (
      dropMode === 'into' &&
      isValid &&
      !this.expandedMenuIds().has(targetMenu.id) &&
      this.autoExpandTargetId !== targetMenu.id
    ) {
      const hasChildren = this.menuResource.value().some(m => m.parentId === targetMenu.id);

      if (hasChildren) {
        this.autoExpandTargetId = targetMenu.id;
        this.autoExpandTimer = setTimeout(() => {
          this.expandedMenuIds.update(ids => {
            const newIds = new Set(ids);
            newIds.add(targetMenu.id);
            return newIds;
          });
          this.autoExpandTargetId = null;
        }, 800);
      }
    }

    return { dropMode, isValid };
  }

  onDragLeave(): void {
    this.clearAutoExpandTimer();
    this.dragDropState.update(state => ({
      ...state,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    }));
  }

  async onDrop(targetMenu: TreeMenuInstance<C>): Promise<void> {
    const state = this.dragDropState();
    if (state.draggedItemId === null || !state.isValidTarget || !state.dropMode) {
      this.resetDragState();
      return;
    }

    const draggedMenu = this.menuResource.value().find(m => m.id === state.draggedItemId);
    if (!draggedMenu) {
      this.resetDragState();
      return;
    }

    if (this.isDropRedundant(draggedMenu, targetMenu, state.dropMode, this.menuResource.value())) {
      this.resetDragState();
      return;
    }

    try {
      let dropResult = this.dragDropService.calculateDropPosition(
        draggedMenu,
        targetMenu,
        state.dropMode,
        this.menuResource.value()
      );

      if (!dropResult.success && dropResult.error?.message === 'REORDER_NEEDED') {
        const allMenus = this.menuResource.value();
        const targetParentId = state.dropMode === 'into' ? targetMenu.id : (targetMenu.parentId ?? null);
        const siblings = allMenus.filter(m => m.parentId === targetParentId);

        await this.dragDropService.rebalanceSortOrder(siblings);

        dropResult = this.dragDropService.calculateDropPosition(
          draggedMenu,
          targetMenu,
          state.dropMode,
          this.menuResource.value()
        );
      }

      if (!dropResult.success) {
        throw new Error(dropResult.error?.message || '拖放失败');
      }

      const dropLogic = async (): Promise<void> => {
        const result = await this.dragDropService.performDrop(draggedMenu, dropResult);
        if (!result.success) {
          throw result.error ?? new Error('拖放失败');
        }
      };
      const startTransition: ViewTransitionStarter | undefined =
        'startViewTransition' in document ? update => document.startViewTransition(update) : undefined;

      await runViewTransition(dropLogic, startTransition);

      if (dropResult.newParentId != null && state.dropMode === 'into') {
        this.expandedMenuIds.update(ids => {
          const newIds = new Set(ids);
          newIds.add(dropResult.newParentId!);
          return newIds;
        });
      }
    } finally {
      this.resetDragState();
    }
  }

  onDragEnd(): void {
    this.clearAutoExpandTimer();
    this.resetDragState();
  }

  protected isDropRedundant(
    draggedMenu: TreeMenuInstance<C>,
    targetMenu: TreeMenuInstance<C>,
    dropMode: DropMode,
    allMenus: TreeMenuInstance<C>[]
  ): boolean {
    let newParentId: RxDBEntityId | null;
    if (dropMode === 'into') {
      newParentId = targetMenu.id;
    } else {
      newParentId = targetMenu.parentId ?? null;
    }

    const currentParentId = draggedMenu.parentId ?? null;
    if (newParentId !== currentParentId) {
      return false;
    }

    const siblings = allMenus.filter(m => (m.parentId ?? null) === currentParentId).sort(compareSortOrder);

    const currentIndex = siblings.findIndex(m => m.id === draggedMenu.id);
    if (currentIndex === -1) return false;

    if (dropMode === 'into') {
      return currentIndex === siblings.length - 1;
    }

    const targetIndex = siblings.findIndex(m => m.id === targetMenu.id);
    if (targetIndex === -1) return false;

    if (dropMode === 'before') {
      return currentIndex === targetIndex || currentIndex === targetIndex - 1;
    }

    if (dropMode === 'after') {
      return currentIndex === targetIndex || currentIndex === targetIndex + 1;
    }

    return false;
  }

  protected resetDragState(): void {
    this.dragDropState.set({
      draggedItemId: null,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    });
  }
}
