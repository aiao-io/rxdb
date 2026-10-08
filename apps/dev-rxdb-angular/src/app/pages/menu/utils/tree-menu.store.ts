import type { HistoryScopeAPI, RxDBEntityId } from '@aiao/rxdb';
import { getEntityMutations, RxDB } from '@aiao/rxdb';
import { computed, signal, Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
  generateBatchMenus
} from './tree-utils';

/** 删除对话框展示的影响范围（取自库，不看页面已加载的节点）。 */
export interface DeleteImpact {
  childrenCount: number;
  descendantsCount: number;
}

const NO_DELETE_IMPACT: DeleteImpact = { childrenCount: 0, descendantsCount: 0 };

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

  /** 随 `menuToDelete` 一起在 {@link deleteMenu} 里按库查出；懒加载页的折叠节点没有已加载的子节点可数。 */
  readonly deleteImpact = signal<DeleteImpact>(NO_DELETE_IMPACT);

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

    // 不赋 sortOrder：引擎在事务内把缺键的新行追加到所属 parentId 组的末尾
    const menu = this.createEntity();
    menu.title = title;
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

    const menu = this.createEntity();
    menu.title = title;
    menu.parentId = parentId;

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

  /**
   * 删除节点：按库里的直接子节点决定直接删除还是打开选择对话框。
   *
   * @remarks
   * 不看 `menuResource`：懒加载页只持有已加载的节点，折叠节点的子节点不在其中，
   * 按页面判断会把有子树的节点当叶子直接删除（`parentId` 外键级联删掉整棵子树）。
   */
  async deleteMenu(menu: TreeMenuInstance<C>): Promise<void> {
    const children = await this.findChildren(menu.id);
    if (children.length === 0) {
      await menu.remove();
      return;
    }

    const subtree = await this.findSubtree(menu.id);
    this.deleteImpact.set({ childrenCount: children.length, descendantsCount: subtree.length - 1 });
    this.menuToDelete.set(menu);
  }

  cancelDelete(): void {
    this.closeDeleteDialog();
  }

  async executeCascadeDelete(): Promise<void> {
    const menu = this.menuToDelete();
    if (!menu) return;

    // findDescendants 含节点自身
    const menusToRemove = await this.findSubtree(menu.id);
    await this.rxdb.entityManager.removeMany(menusToRemove);
    this.closeDeleteDialog();
  }

  /**
   * 删除节点并把它的直接子节点提升到它原来的父节点下。
   *
   * @remarks
   * 子节点取自库、只改 `parentId`，不赋 `sortOrder`：引擎把改了父节点的行追加到新组末尾。
   * 保存子节点与删除节点在同一次 `mutations` 里提交，要么全成要么全不成。
   */
  async executePromoteChildrenDelete(): Promise<void> {
    const menu = this.menuToDelete();
    if (!menu) return;

    const children = await this.findChildren(menu.id);
    const newParentId = menu.parentId ?? null;
    children.forEach(child => {
      child.parentId = newParentId;
    });

    const options = getEntityMutations<C>({
      needSaveEntities: children,
      needRemoveEntities: [menu]
    });

    await this.rxdb.entityManager.mutations(options);
    this.closeDeleteDialog();
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
    // 一次 saveMany，节点不带 sortOrder：引擎按批内顺序把各 parentId 组追加到末尾
    const menus = generateBatchMenus(total, () => this.createEntity());
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

  private closeDeleteDialog(): void {
    this.menuToDelete.set(null);
    this.deleteImpact.set(NO_DELETE_IMPACT);
  }

  /** 库里某节点的直接子节点（按原有顺序）。 */
  private findChildren(parentId: RxDBEntityId): Promise<TreeMenuInstance<C>[]> {
    return firstValueFrom(
      this.entityClass.findAll({
        where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: parentId }] },
        orderBy: [{ field: 'sortOrder', sort: 'asc' }]
      })
    );
  }

  /** 库里某节点的子树：节点自身加全部后代。 */
  private findSubtree(entityId: RxDBEntityId): Promise<TreeMenuInstance<C>[]> {
    return firstValueFrom(this.entityClass.findDescendants({ entityId }));
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
