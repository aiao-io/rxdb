/* eslint-disable @typescript-eslint/member-ordering */

import type { HistoryScopeAPI, RxDBEntityId } from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
import { computed, inject, Injectable, InjectionToken, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TreeMenuEntityConstructor, TreeMenuInstance, TreeNode } from '../models/tree-node.interface';
import { MenuDragDropService } from '../services/menu-drag-drop.service';
import { MenuSearchService } from '../services/menu-search.service';
import { PathValidatorService } from '../utils/path-validator';
import { TreeMenuDragDropStore } from '../utils/tree-menu.store';

/**
 * 注入令牌，用于向TreeMenuLazyStore提供实体类
 * @example
 * ```typescript
 * providers: [
 *   { provide: ENTITY_CLASS, useValue: MenuLarge }
 * ]
 * ```
 */
export const ENTITY_CLASS = new InjectionToken<unknown>('ENTITY_CLASS');

/**
 * 注入令牌，用于向TreeMenuLazyStore提供历史服务
 * @example
 * ```typescript
 * providers: [
 *   {
 *     provide: HISTORY,
 *     useFactory: () => inject(RxDB).versionManager.history(MenuLarge)
 *   }
 * ]
 * ```
 */
export const HISTORY = new InjectionToken<HistoryScopeAPI>('HISTORY');

function resolveEntityClass<C extends TreeMenuEntityConstructor>(value: unknown): C {
  if (typeof value !== 'function' || !('findAll' in value) || typeof value.findAll !== 'function') {
    throw new TypeError('ENTITY_CLASS must be an RxDB entity constructor');
  }
  return value as C;
}

/**
 * TreeMenuLazyStore - 懒加载树菜单存储，支持按需数据获取
 *
 * @description
 * 扩展TreeMenuDragDropStore以实现树菜单的懒加载功能。
 * 初始化时仅加载根节点，然后在节点展开时按需获取子节点。
 * 所有加载的数据通过RxJS订阅保持响应式。
 *
 * @remarks
 * 关键特性：
 * - 初始加载仅获取根节点（parentId = null）
 * - 子节点在父节点展开时按需加载
 * - 所有订阅都被正确管理和清理
 * - 支持递归展开/折叠操作
 * - 保持与拖拽和搜索功能的兼容性
 * - 为每个节点提供加载和错误状态
 *
 * @example
 * ```typescript
 * // 在组件提供者中
 * providers: [
 *   TreeMenuLazyStore,
 *   { provide: ENTITY_CLASS, useValue: MenuLarge },
 *   { provide: HISTORY, useFactory: () => inject(RxDB).versionManager.history(MenuLarge) }
 * ]
 *
 * // 在组件中
 * constructor() {
 *   const store = inject(TreeMenuLazyStore<MenuLarge>);
 *   // 使用store方法
 * }
 * ```
 *
 * @typeParam T - 扩展ITreeEntity的实体类型
 */
@Injectable()
export class TreeMenuLazyStore<C extends TreeMenuEntityConstructor>
  extends TreeMenuDragDropStore<C>
  implements OnDestroy
{
  /**
   * 跟踪哪些节点当前正在加载其子节点的信号
   * @readonly
   */
  readonly loadingNodes = signal<Set<RxDBEntityId>>(new Set());

  /**
   * 跟踪节点加载失败错误状态的信号
   * @readonly
   */
  readonly nodeErrors = signal<Map<RxDBEntityId, Error>>(new Map());

  // Private fields
  private rootSubscription!: Subscription;
  private childSubscriptions = new Map<RxDBEntityId, Subscription>();
  private rootNodes = signal<TreeMenuInstance<C>[]>([]);
  private childNodesMap = signal<Map<RxDBEntityId, TreeMenuInstance<C>[]>>(new Map());

  // Override treeNodes to build tree from loaded data
  override readonly treeNodes = computed(() => {
    const roots = this.rootNodes();
    const childMap = this.childNodesMap();
    const expandedIds = this.expandedMenuIds();
    const matchedIds = this.matchedMenuIds();
    // P1-1：见 tree-menu.store.ts 中的同名说明 —— hasSearch 必须由关键字决定。
    const hasSearch = this.searchKeyword().trim().length > 0;
    const nodes: TreeNode<TreeMenuInstance<C>>[] = [];

    // P0-3：原实现在**每个节点上**都重新拼一次这个扁平数组（而且拼两次：
    // 一次给 shouldShowMenu，一次给 expandMatchedAncestors），两个方法内部再各自重建全量索引。
    const allLoaded = [...roots, ...Array.from(childMap.values()).flat()];
    const ancestorIds = hasSearch ? this.searchService.expandMatchedAncestors(allLoaded, matchedIds) : null;
    const visibleIds = ancestorIds ? new Set([...matchedIds, ...ancestorIds]) : null;

    // 递归构建树节点 - 只使用已加载的数据
    const buildNodes = (parentNodes: TreeMenuInstance<C>[], level: number) => {
      // 按 sortOrder 排序 - 使用字符串直接比较而不是 localeCompare
      const sortedNodes = [...parentNodes].sort((a, b) => {
        const aOrder = a.sortOrder ?? '';
        const bOrder = b.sortOrder ?? '';
        return (
          aOrder < bOrder ? -1
          : aOrder > bOrder ? 1
          : 0
        );
      });

      sortedNodes.forEach(menu => {
        // 搜索过滤：只显示匹配的菜单或其祖先节点
        if (visibleIds && !visibleIds.has(menu.id)) {
          return;
        }

        // 使用数据库中的 hasChildren 属性
        const hasChildren = menu.hasChildren ?? false;

        // 搜索时自动展开匹配项的祖先节点
        const isExpanded =
          ancestorIds ? ancestorIds.has(menu.id) || expandedIds.has(menu.id) : expandedIds.has(menu.id);

        nodes.push({
          menu,
          level,
          isExpanded,
          hasChildren
        });

        // 如果展开且有子节点数据，递归构建子节点
        if (isExpanded) {
          const children = childMap.get(menu.id);
          if (children && children.length > 0) {
            buildNodes(children, level + 1);
          }
        }
      });
    };

    buildNodes(roots, 0);
    return nodes;
  });

  // Expose visibleNodes for compatibility with parent class
  readonly visibleNodes = computed(() => {
    const roots = this.rootNodes();
    const childMap = this.childNodesMap();
    const allNodes: TreeMenuInstance<C>[] = [...roots];

    // Collect all loaded children
    for (const children of childMap.values()) {
      allNodes.push(...children);
    }

    return allNodes;
  });

  /**
   * 当搜索仅限于已加载节点时的警告消息
   *
   * @description
   * 在懒加载模式下，搜索仅对已加载的节点有效。
   * 当以下情况时，此计算信号返回警告消息：
   * 1. 搜索处于活动状态（searchKeyword不为空）
   * 2. 存在可能包含匹配结果的折叠节点
   *
   * @returns 包含消息和计数的警告对象，或null（无需警告）
   *
   * @example
   * ```typescript
   * const warning = store.searchWarning();
   * if (warning) {
   *   console.log(warning.message);
   *   console.log(`已加载: ${warning.loadedCount}, 已展开: ${warning.expandedCount}, 根节点: ${warning.rootCount}`);
   * }
   * ```
   */
  readonly searchWarning = computed(() => {
    const keyword = this.searchKeyword();
    if (!keyword) return null;

    const loadedCount = this.visibleNodes().length;
    const expandedCount = this.expandedMenuIds().size;
    const rootCount = this.rootNodes().length;

    // If we have collapsed nodes (nodes with hasChildren but not expanded),
    // there might be unloaded nodes that could match the search
    const hasCollapsedNodes = this.visibleNodes().some(
      node => node.hasChildren && !this.expandedMenuIds().has(node.id)
    );

    if (hasCollapsedNodes) {
      return {
        message: '搜索仅限于已加载的节点。展开更多节点以搜索其子节点。',
        loadedCount,
        expandedCount,
        rootCount
      };
    }

    return null;
  });

  constructor() {
    // 使用inject()函数注入依赖
    const rxdb = inject(RxDB);
    const pathValidator = inject(PathValidatorService);
    const searchService = inject(MenuSearchService);
    const dragDropService = inject(MenuDragDropService);
    const entityClass = resolveEntityClass<C>(inject(ENTITY_CLASS));
    const history = inject(HISTORY);

    // 创建虚拟资源，因为我们自己管理数据
    const dummyResource = { value: computed(() => this.visibleNodes()) };

    super(rxdb, pathValidator, searchService, dragDropService, dummyResource, entityClass, history);

    // 初始化根节点订阅
    this.initRootSubscription();
  }

  /**
   * 清理所有订阅
   */
  ngOnDestroy(): void {
    // 清理根订阅
    this.rootSubscription?.unsubscribe();

    // 清理所有子订阅
    for (const subscription of this.childSubscriptions.values()) {
      subscription.unsubscribe();
    }
    this.childSubscriptions.clear();
  }

  /**
   * 检查节点当前是否展开
   *
   * @param nodeId - 要检查的节点ID
   * @returns 如果节点展开则返回true，否则返回false
   *
   * @example
   * ```typescript
   * if (store.isExpanded('node-123')) {
   *   console.log('节点已展开');
   * }
   * ```
   */
  isExpanded(nodeId: RxDBEntityId): boolean {
    return this.expandedMenuIds().has(nodeId);
  }

  /** 选择父节点时同时建立子节点订阅，确保新增子菜单能回流到懒加载树。 */
  override selectParent(menuId: RxDBEntityId): void {
    super.selectParent(menuId);
    this.expandNode(menuId);
  }

  /**
   * 展开节点并按需加载其子节点
   *
   * @description
   * 创建一个订阅来观察具有给定parentId的子节点。
   * 订阅保持活动状态直到节点折叠，允许在子节点添加、删除或修改时进行响应式更新。
   *
   * @param nodeId - 要展开的节点ID
   *
   * @remarks
   * - 如果节点已展开或已订阅，此方法不执行任何操作
   * - 在获取数据时将节点添加到loadingNodes信号
   * - 将订阅存储在childSubscriptions Map中以便清理
   * - 如果未找到子节点，则自动将hasChildren更新为false
   * - 处理错误并将它们存储在nodeErrors信号中
   *
   * @example
   * ```typescript
   * // 展开单个节点
   * store.expandNode('node-123');
   *
   * // 检查加载状态
   * if (store.loadingNodes().has('node-123')) {
   *   console.log('正在加载子节点...');
   * }
   * ```
   */
  expandNode(nodeId: RxDBEntityId): void {
    // If already subscribed, no need to create another subscription
    if (this.childSubscriptions.has(nodeId)) {
      // Just ensure it's in expanded set
      if (!this.expandedMenuIds().has(nodeId)) {
        this.expandedMenuIds.update((set: Set<RxDBEntityId>) => new Set(set).add(nodeId));
      }
      return;
    }

    // Add to expanded set if not already expanded
    if (!this.expandedMenuIds().has(nodeId)) {
      this.expandedMenuIds.update((set: Set<RxDBEntityId>) => new Set(set).add(nodeId));
    }

    // Add to loading set
    this.loadingNodes.update((set: Set<RxDBEntityId>) => new Set(set).add(nodeId));

    // Create child query using findAll()
    const childQuery$ = this.entityClass.findAll({
      where: {
        combinator: 'and',
        rules: [{ field: 'parentId', operator: '=', value: nodeId }]
      },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });

    // Subscribe to child changes with error handling
    const subscription = childQuery$.subscribe({
      next: (children: TreeMenuInstance<C>[]) => {
        // Update child nodes map
        this.childNodesMap.update((map: Map<RxDBEntityId, TreeMenuInstance<C>[]>) => {
          const newMap = new Map(map);
          newMap.set(nodeId, children);
          return newMap;
        });

        // Remove from loading
        this.loadingNodes.update((set: Set<RxDBEntityId>) => {
          const newSet = new Set(set);
          newSet.delete(nodeId);
          return newSet;
        });

        // 更新hasChildren状态
        this.updateHasChildren(nodeId, children.length > 0);
      },
      error: (error: Error) => {
        // Remove from loading
        this.loadingNodes.update((set: Set<RxDBEntityId>) => {
          const newSet = new Set(set);
          newSet.delete(nodeId);
          return newSet;
        });

        // Store error state
        this.nodeErrors.update((map: Map<RxDBEntityId, Error>) => new Map(map).set(nodeId, error));

        console.error(`Failed to load children for node ${nodeId}:`, error);
      }
    });

    // Store subscription
    this.childSubscriptions.set(nodeId, subscription);
  }

  /**
   * 折叠节点并清理其订阅
   *
   * @description
   * 从展开集中移除节点，取消订阅其子节点的Observable，
   * 从数据映射中移除子节点，并递归折叠所有后代节点。
   *
   * @param nodeId - 要折叠的节点ID
   *
   * @remarks
   * - 递归折叠所有子节点以防止内存泄漏
   * - 取消订阅RxDB查询以停止接收更新
   * - 从childNodesMap信号中移除子节点数据
   * - 如果节点未展开，此方法不执行任何操作
   *
   * @example
   * ```typescript
   * // 折叠单个节点
   * store.collapseNode('node-123');
   *
   * // 节点及其所有后代现在都已折叠
   * console.log(store.isExpanded('node-123')); // false
   * ```
   */
  collapseNode(nodeId: RxDBEntityId): void {
    if (!this.expandedMenuIds().has(nodeId)) return;

    // 在移除映射之前获取子节点
    const children = this.getChildrenOf(nodeId);

    // Remove from expanded set
    this.expandedMenuIds.update((set: Set<RxDBEntityId>) => {
      const newSet = new Set(set);
      newSet.delete(nodeId);
      return newSet;
    });

    // Unsubscribe from child query
    const subscription = this.childSubscriptions.get(nodeId);
    if (subscription) {
      subscription.unsubscribe();
      this.childSubscriptions.delete(nodeId);
    }

    // 先递归折叠子节点（在删除 childNodesMap 之前）
    for (const child of children) {
      this.collapseNode(child.id);
    }

    // 最后移除 childrenMap
    this.childNodesMap.update((map: Map<RxDBEntityId, TreeMenuInstance<C>[]>) => {
      const newMap = new Map(map);
      newMap.delete(nodeId);
      return newMap;
    });
  }

  /**
   * 展开所有节点（切换到全量订阅模式）
   *
   * @description
   * 取消所有当前的懒加载订阅，并发起一个全量查询订阅。
   * 这将一次性加载所有节点并在内存中构建树结构。
   */
  expandAll(): void {
    // 1. Unsubscribe everything
    this.rootSubscription?.unsubscribe();
    for (const sub of this.childSubscriptions.values()) {
      sub.unsubscribe();
    }
    this.childSubscriptions.clear();

    // 2. Subscribe to ALL
    const allQuery$ = this.entityClass.findAll({
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });

    const subscription = allQuery$.subscribe({
      next: (allMenus: TreeMenuInstance<C>[]) => {
        const newChildMap = new Map<RxDBEntityId, TreeMenuInstance<C>[]>();
        const newRoots: TreeMenuInstance<C>[] = [];
        const newExpanded = new Set<RxDBEntityId>();

        allMenus.forEach(menu => {
          if (menu.parentId != null) {
            if (!newChildMap.has(menu.parentId)) {
              newChildMap.set(menu.parentId, []);
            }
            newChildMap.get(menu.parentId)!.push(menu);
          } else {
            newRoots.push(menu);
          }
        });

        // Expand all nodes that have children
        for (const parentId of newChildMap.keys()) {
          newExpanded.add(parentId);
        }

        // Update signals
        this.rootNodes.set(newRoots);
        this.childNodesMap.set(newChildMap);
        this.expandedMenuIds.set(newExpanded);
        this.loadingNodes.set(new Set());
      },
      error: (err: unknown) => console.error('[TreeMenuLazyStore] ExpandAll error:', err)
    });

    // Store as root subscription (or a special key in childSubscriptions if preferred, but rootSubscription is fine as it replaces the main data source)
    this.rootSubscription = subscription;
  }

  /**
   * 折叠所有展开的节点
   *
   * @description
   * 折叠所有当前展开的节点，清理所有订阅
   * 并从内存中移除所有加载的子节点数据。
   *
   * @remarks
   * - 遍历所有展开的节点并折叠它们
   * - 每个折叠递归处理其后代
   * - 所有订阅都被正确清理
   * - 重置树到初始状态（仅根节点可见）
   *
   * @example
   * ```typescript
   * // 折叠所有节点
   * store.collapseAll();
   * console.log('所有节点已折叠');
   * ```
   */
  collapseAll(): void {
    // 1. Unsubscribe everything
    this.rootSubscription?.unsubscribe();
    for (const sub of this.childSubscriptions.values()) {
      sub.unsubscribe();
    }
    this.childSubscriptions.clear();

    // 2. Reset State
    this.expandedMenuIds.set(new Set());
    this.childNodesMap.set(new Map());
    this.loadingNodes.set(new Set());
    this.rootNodes.set([]); // Clear to avoid stale data

    // 3. Subscribe to ROOT (Back to Lazy Mode)
    this.initRootSubscription();
  }

  /**
   * 批量添加菜单（覆盖父类方法，添加后清理展开状态）
   *
   * @description
   * 在批量添加后清理展开节点的订阅和缓存，避免新旧数据混淆
   *
   * @param total - 要添加的菜单数量
   *
   * @example
   * ```typescript
   * await store.add_many_menu(100);
   * ```
   */
  override async add_many_menu(total: number): Promise<void> {
    // 调用父类方法执行实际添加
    await super.add_many_menu(total);

    // 保存后清理展开节点的订阅和缓存，避免新旧数据混淆
    // 只清理子节点订阅，保留 ROOT 订阅（会自动更新根节点）
    for (const subscription of this.childSubscriptions.values()) {
      subscription.unsubscribe();
    }
    this.childSubscriptions.clear();
    this.expandedMenuIds.set(new Set());
    this.childNodesMap.set(new Map());
    this.loadingNodes.set(new Set());
  }

  /**
   * 重试加载失败节点的子节点
   *
   * @description
   * 清除错误状态，通过折叠然后重新展开节点来尝试重新加载子节点，
   * 这会创建一个新的订阅。
   *
   * @param nodeId - 要重试的节点ID
   *
   * @remarks
   * - 从nodeErrors信号中清除错误
   * - 折叠节点以清理任何部分状态
   * - 重新展开节点以触发新查询
   * - 用于处理瞬时网络错误
   *
   * @example
   * ```typescript
   * // 在模板中
   * <button (click)="store.retryLoadChildren(node.id)">
   *   重试
   * </button>
   * ```
   */
  retryLoadChildren(nodeId: RxDBEntityId): void {
    // Clear error state
    this.nodeErrors.update((map: Map<RxDBEntityId, Error>) => {
      const newMap = new Map(map);
      newMap.delete(nodeId);
      return newMap;
    });

    // Collapse then re-expand to trigger new query
    this.collapseNode(nodeId);
    this.expandNode(nodeId);
  }

  /**
   * 覆盖onDrop以确保拖拽到节点时进行懒加载
   */
  override async onDrop(targetMenu: TreeMenuInstance<C>): Promise<void> {
    const state = this.dragDropState();
    const dropMode = state.dropMode;
    const targetId = targetMenu.id;

    // Call parent implementation first to execute the drop
    await super.onDrop(targetMenu);

    // After drop, if mode was 'into', ensure the target node is expanded
    if (dropMode === 'into') {
      // Don't manually update target node's hasChildren - it will be automatically
      // recalculated by the database when the dragged node's parentId is updated.
      // The subscription will receive the updated target node with correct hasChildren value.

      // If not already subscribed, create subscription to load children
      // This will automatically show the dropped node once the subscription receives data
      if (!this.childSubscriptions.has(targetId)) {
        this.expandNode(targetId);
      }
    }
  }

  /**
   * 初始化根节点订阅（parentId = null）
   */
  private initRootSubscription(): void {
    const rootQuery$ = this.entityClass.findAll({
      where: {
        combinator: 'and',
        rules: [{ field: 'parentId', operator: '=', value: null }]
      },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });

    this.rootSubscription = rootQuery$.subscribe({
      next: (roots: TreeMenuInstance<C>[]) => {
        this.rootNodes.set(roots);
      },
      error: (error: unknown) => {
        console.error('[TreeMenuLazyStore] Root subscription error:', error);
      }
    });
  }

  /**
   * 从加载的数据中获取节点的子节点
   */
  private getChildrenOf(nodeId: RxDBEntityId): TreeMenuInstance<C>[] {
    return this.childNodesMap().get(nodeId) ?? [];
  }

  /**
   * 更新节点的hasChildren属性
   */
  private async updateHasChildren(nodeId: RxDBEntityId, value: boolean): Promise<void> {
    try {
      // Find the node from loaded data
      const allNodes = this.visibleNodes();
      const node = allNodes.find(n => n.id === nodeId);

      if (node) {
        node.hasChildren = value;
        await node.save();
      }
    } catch (error) {
      console.error(`更新节点${nodeId}的hasChildren失败:`, error);
    }
  }
}
