import type { HistoryScopeAPI } from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
import { computed, inject, Injectable, InjectionToken, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { FileTreeEntityConstructor, FileTreeInstance, TreeNode } from '../models/file-node.interface';
import { FileDragDropService } from '../services/file-drag-drop.service';
import { FilePathValidatorService } from '../services/file-path-validator.service';
import { FileSearchService } from '../services/file-search.service';
import { getSortComparator } from '../utils/file-sorters';
import { generateBatchFiles } from '../utils/file-utils';
import { TreeFileDragDropStore } from '../utils/tree-file.store';

export const FILE_ENTITY_CLASS = new InjectionToken<unknown>('FILE_ENTITY_CLASS');
export const FILE_HISTORY = new InjectionToken<HistoryScopeAPI>('FILE_HISTORY');

function resolveEntityClass<C extends FileTreeEntityConstructor>(value: unknown): C {
  if (
    typeof value !== 'function' ||
    !('find' in value) ||
    typeof value.find !== 'function' ||
    !('findAll' in value) ||
    typeof value.findAll !== 'function'
  ) {
    throw new TypeError('FILE_ENTITY_CLASS must be an RxDB entity constructor');
  }
  return value as C;
}

@Injectable()
export class TreeFileLazyStore<C extends FileTreeEntityConstructor>
  extends TreeFileDragDropStore<C>
  implements OnDestroy
{
  // Private fields
  private readonly searchService!: FileSearchService;
  private rootSubscription!: Subscription;
  private childSubscriptions = new Map<string, Subscription>();
  private rootNodes = signal<FileTreeInstance<C>[]>([]);
  private childNodesMap = signal<Map<string, FileTreeInstance<C>[]>>(new Map());

  readonly loadingNodes = signal<Set<string>>(new Set());
  readonly nodeErrors = signal<Map<string, Error>>(new Map());
  readonly isFullMode = signal(false);

  override readonly isAllExpanded = computed(() => {
    if (!this.isFullMode()) return false;
    const expandedCount = this.expandedCount();
    if (expandedCount === 0) return false;
    return expandedCount >= this.folderIds().length;
  });

  override readonly treeNodes = computed(() => {
    const roots = this.rootNodes();
    const childMap = this.childNodesMap();
    const expandedIds = this.expandedFileIds();
    const matchedIds = this.searchKeyword() ? this.matchedFileIds() : new Set<string>();
    // P1-1：见 tree-menu.store.ts 中的同名说明 —— hasSearch 必须由关键字决定，
    // 用 `matchedIds.size > 0` 会让"搜不到"退化成"显示全部"。
    const hasSearch = this.searchKeyword().trim().length > 0;
    const nodes: TreeNode<FileTreeInstance<C>>[] = [];
    const sortComparator = getSortComparator(this.sortMode());

    const allLoaded: FileTreeInstance<C>[] = [...roots];
    for (const children of childMap.values()) allLoaded.push(...children);

    // P0-3：`shouldShowFile` / `expandMatchedAncestors` 内部都是 O(n) 全表扫描，
    // 放在逐节点循环里就是 O(n²)。可见集 = matchedIds ∪ ancestors(matchedIds)，整棵树只算一次。
    const ancestorIds = hasSearch ? this.searchService.expandMatchedAncestors(allLoaded, matchedIds) : null;
    const visibleIds = ancestorIds ? new Set([...matchedIds, ...ancestorIds]) : null;

    const buildNodes = (parentNodes: FileTreeInstance<C>[], level: number) => {
      // 手动模式不排序：数组即查询顺序（引擎的默认排序）
      const sorted = sortComparator ? [...parentNodes].sort(sortComparator) : parentNodes;
      sorted.forEach(file => {
        if (visibleIds && !visibleIds.has(file.id)) return;
        // 空白名称的行留在组里参与拖放换算，只是不展示
        if (file.name.trim() === '') return;

        const hasChildren = file.hasChildren ?? false;

        const isExpanded =
          ancestorIds ? ancestorIds.has(file.id) || expandedIds.has(file.id) : expandedIds.has(file.id);

        nodes.push({ node: file, level, isExpanded, hasChildren, isMatched: matchedIds.has(file.id) });

        if (isExpanded) {
          const children = childMap.get(file.id);
          if (children && children.length > 0) buildNodes(children, level + 1);
        }
      });
    };

    buildNodes(roots, 0);
    return nodes;
  });

  readonly visibleNodes = computed(() => {
    const roots = this.rootNodes();
    const childMap = this.childNodesMap();
    const all: FileTreeInstance<C>[] = [...roots];
    for (const children of childMap.values()) all.push(...children);
    return all;
  });

  readonly searchWarning = computed(() => {
    const keyword = this.searchKeyword();
    if (!keyword) return null;

    const loadedCount = this.visibleNodes().length;
    // 检查是否有折叠的文件夹（hasChildren = true 但未展开）
    const hasCollapsed = this.visibleNodes().some(n => n.hasChildren && !this.expandedFileIds().has(n.id));
    if (hasCollapsed) {
      return { message: '搜索仅限于已加载的节点。展开更多文件夹以搜索其子项。', loadedCount };
    }
    return null;
  });

  constructor() {
    const rxdb = inject(RxDB);
    const pathValidator = inject(FilePathValidatorService);
    const searchService = inject(FileSearchService);
    const dragDropService = inject(FileDragDropService);
    const entityClass = resolveEntityClass<C>(inject(FILE_ENTITY_CLASS));
    const history = inject(FILE_HISTORY);

    const dummyResource = { value: computed(() => this.visibleNodes()) };
    super(rxdb, pathValidator, dragDropService, dummyResource, entityClass, history);
    this.searchService = searchService;
    this.initRootSubscription();
  }

  ngOnDestroy(): void {
    this.rootSubscription?.unsubscribe();
    for (const sub of this.childSubscriptions.values()) sub.unsubscribe();
    this.childSubscriptions.clear();
  }

  isExpanded(nodeId: string): boolean {
    return this.expandedFileIds().has(nodeId);
  }

  override toggleExpand(file: FileTreeInstance<C>): void {
    const nodeId = file.id;
    if (file.type !== 'folder') return;
    // 允许展开 hasChildren 为 true 或 undefined 的文件夹
    // undefined 表示尚未加载子节点，应该尝试加载
    const canExpand = file.hasChildren !== false;
    if (!canExpand) return;
    if (this.isExpanded(nodeId)) this.collapseNode(nodeId);
    else this.expandNode(nodeId);
  }

  expandNode(nodeId: string): void {
    if (this.childSubscriptions.has(nodeId)) {
      if (!this.expandedFileIds().has(nodeId)) this.expandedFileIds.update((s: Set<string>) => new Set(s).add(nodeId));
      return;
    }

    if (!this.expandedFileIds().has(nodeId)) this.expandedFileIds.update((s: Set<string>) => new Set(s).add(nodeId));
    this.loadingNodes.update((set: Set<string>) => new Set(set).add(nodeId));

    const childQuery$ = this.entityClass.find({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: nodeId }] }
    });

    const subscription = childQuery$.subscribe({
      next: (children: FileTreeInstance<C>[]) => {
        this.childNodesMap.update((map: Map<string, FileTreeInstance<C>[]>) => {
          const m = new Map(map);
          m.set(nodeId, children);
          return m;
        });

        this.loadingNodes.update((set: Set<string>) => {
          const s = new Set(set);
          s.delete(nodeId);
          return s;
        });

        void this.updateHasChildren(nodeId, children.length > 0);
      },
      error: (error: Error) => {
        this.loadingNodes.update((set: Set<string>) => {
          const s = new Set(set);
          s.delete(nodeId);
          return s;
        });
        this.nodeErrors.update((map: Map<string, Error>) => new Map(map).set(nodeId, error));
      }
    });

    this.childSubscriptions.set(nodeId, subscription);
  }

  collapseNode(nodeId: string): void {
    if (!this.expandedFileIds().has(nodeId)) return;

    // 先获取子节点，再清理 childNodesMap
    const children = this.getChildrenOf(nodeId);

    this.expandedFileIds.update((set: Set<string>) => {
      const s = new Set(set);
      s.delete(nodeId);
      return s;
    });

    const sub = this.childSubscriptions.get(nodeId);
    if (sub) {
      sub.unsubscribe();
      this.childSubscriptions.delete(nodeId);
    }

    // 递归清理子节点（在删除 childNodesMap 之前）
    for (const child of children) {
      this.collapseNode(child.id);
    }

    // 最后删除 childNodesMap
    this.childNodesMap.update((map: Map<string, FileTreeInstance<C>[]>) => {
      const m = new Map(map);
      m.delete(nodeId);
      return m;
    });
  }

  override async addBatch(count: number): Promise<void> {
    // 1. Unsubscribe everything to prevent UI updates during massive insert
    this.rootSubscription?.unsubscribe();
    for (const sub of this.childSubscriptions.values()) {
      sub.unsubscribe();
    }
    this.childSubscriptions.clear();

    // 2. Generate and save files
    const newFiles = generateBatchFiles(count, () => this.createEntity());
    await this.rxdb.entityManager.saveMany<C>(newFiles);

    // 3. Reset state and resubscribe
    this.expandedFileIds.set(new Set());
    this.childNodesMap.set(new Map());
    this.loadingNodes.set(new Set());
    this.rootNodes.set([]);

    if (this.isFullMode()) {
      this.expandAll();
    } else {
      this.initRootSubscription();
    }
  }

  expandAll(): void {
    this.isFullMode.set(true);
    // 1. Unsubscribe everything
    this.rootSubscription?.unsubscribe();
    for (const sub of this.childSubscriptions.values()) {
      sub.unsubscribe();
    }
    this.childSubscriptions.clear();

    // 2. Subscribe to ALL
    const allQuery$ = this.entityClass.findAll({ where: { combinator: 'and', rules: [] } });

    const subscription = allQuery$.subscribe({
      next: (allFiles: FileTreeInstance<C>[]) => {
        const newChildMap = new Map<string, FileTreeInstance<C>[]>();
        const newRoots: FileTreeInstance<C>[] = [];
        const newExpanded = new Set<string>();

        // 各组保留完整成员（含空白名称的行）：拖放从这里取组序列，展示时才过滤
        allFiles.forEach(file => {
          if (file.parentId) {
            if (!newChildMap.has(file.parentId)) {
              newChildMap.set(file.parentId, []);
            }
            newChildMap.get(file.parentId)!.push(file);
          } else {
            newRoots.push(file);
          }

          // Expand if it is a folder
          if (file.type === 'folder') {
            newExpanded.add(file.id);
          }
        });

        // 只分组不排序：数组即查询顺序；`treeNodes` 仅在非手动模式下再按排序模式排序

        this.rootNodes.set(newRoots);
        this.childNodesMap.set(newChildMap);
        this.expandedFileIds.set(newExpanded);
        this.loadingNodes.set(new Set());
      },
      error: (err: unknown) => console.error('[TreeFileLazyStore] ExpandAll error:', err)
    });

    this.rootSubscription = subscription;
  }

  collapseAll(): void {
    this.isFullMode.set(false);
    // 1. Unsubscribe everything
    this.rootSubscription?.unsubscribe();
    for (const sub of this.childSubscriptions.values()) {
      sub.unsubscribe();
    }
    this.childSubscriptions.clear();

    // 2. Reset State
    this.expandedFileIds.set(new Set());
    this.childNodesMap.set(new Map());
    this.loadingNodes.set(new Set());
    this.rootNodes.set([]);

    // 3. Subscribe to ROOT
    this.initRootSubscription();
  }

  override toggleExpandAll(): void {
    if (this.isAllExpanded()) {
      this.collapseAll();
    } else {
      this.expandAll();
    }
  }

  retryLoadChildren(nodeId: string): void {
    this.nodeErrors.update((map: Map<string, Error>) => {
      const m = new Map(map);
      m.delete(nodeId);
      return m;
    });
    this.collapseNode(nodeId);
    this.expandNode(nodeId);
  }

  /**
   * 拖进文件夹成功后展开目标并订阅它的子节点，新节点随订阅回流显示。
   *
   * @remarks
   * 目标的 `hasChildren` 不在这里改：引擎写入后由数据库重算，订阅会收到带正确值的目标节点。
   */
  protected override expandDropTarget(targetId: string): void {
    this.expandNode(targetId);
  }

  private initRootSubscription(): void {
    const rootQuery$ = this.entityClass.findAll({
      where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: null }] }
    });

    this.rootSubscription = rootQuery$.subscribe({
      next: (roots: FileTreeInstance<C>[]) => {
        this.rootNodes.set(roots);
      },
      error: (error: unknown) => {
        console.error('[TreeFileLazyStore] Root subscription error:', error);
      }
    });
  }

  private getChildrenOf(nodeId: string): FileTreeInstance<C>[] {
    return this.childNodesMap().get(nodeId) ?? [];
  }

  private async updateHasChildren(nodeId: string, value: boolean): Promise<void> {
    try {
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
