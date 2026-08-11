import type { HistoryScopeAPI } from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
import { generateKeyBetween } from '@aiao/utils';
import { computed, signal, Signal } from '@angular/core';
import { FileTreeEntityConstructor, FileTreeInstance } from '../models/file-node.interface';
import { DropMode, FileDragDropService } from '../services/file-drag-drop.service';
import { FilePathValidatorService, PathConflict } from '../services/file-path-validator.service';
import { SortMode } from './file-sorters';
import { buildTreeNodes, collectDescendants, compareSortOrder, countDescendants } from './tree-utils';

/**
 * 树形文件管理 Store
 * 负责文件/文件夹的 CRUD 操作和状态管理
 */
export class TreeFileStore<C extends FileTreeEntityConstructor> {
  protected rxdb: RxDB;
  protected pathValidator: FilePathValidatorService;
  protected fileResource: { value: Signal<FileTreeInstance<C>[]> };
  protected entityClass: C;
  protected history?: HistoryScopeAPI;

  // State Signals
  readonly expandedFileIds = signal<Set<string>>(new Set());
  readonly editingFileId = signal<string | null>(null);
  readonly selectedFolderId = signal<string | null>(null);
  readonly fileToDelete = signal<FileTreeInstance<C> | null>(null);
  readonly pathConflictWarning = signal<PathConflict<FileTreeInstance<C>> | null>(null);
  readonly searchKeyword = signal<string>('');
  readonly sortMode = signal<SortMode>(SortMode.Manual);

  // Computed Properties
  readonly matchedFileIds = computed(() => {
    const keyword = this.searchKeyword().toLowerCase();
    if (!keyword) return new Set<string>();

    const allFiles = this.fileResource.value();
    const matched = new Set<string>();

    // 1. Find matches
    allFiles.forEach(file => {
      const fullName = file.extension ? `${file.name}${file.extension}` : file.name;
      if (fullName.toLowerCase().includes(keyword)) {
        matched.add(file.id);
      }
    });

    // 2. Add ancestors (优化: 使用 Map 避免重复查找)
    const fileMap = new Map<string, FileTreeInstance<C>>(allFiles.map(f => [f.id, f]));
    const result = new Set(matched);
    matched.forEach(id => {
      let current = fileMap.get(id);
      while (current?.parentId) {
        const parentId = current.parentId;
        result.add(parentId);
        current = fileMap.get(parentId);
      }
    });

    return result;
  });

  readonly treeNodes = computed(() => {
    const files = this.fileResource.value();
    const expandedIds = this.expandedFileIds();
    const matchedIds = this.searchKeyword() ? this.matchedFileIds() : null;
    const sortMode = this.sortMode();

    return buildTreeNodes(files, expandedIds, matchedIds, null, null, null, null, sortMode);
  });

  readonly deleteImpact = computed(() => {
    const file = this.fileToDelete();
    if (!file) return { childrenCount: 0, descendantsCount: 0 };

    const allFiles = this.fileResource.value();
    const children = allFiles.filter(f => f.parentId === file.id);

    return {
      childrenCount: children.length,
      descendantsCount: countDescendants(file.id, allFiles)
    };
  });

  readonly expandedCount = computed(() => this.expandedFileIds().size);

  // 缓存文件夹 ID 集合，避免重复过滤
  readonly folderIds = computed(() => {
    const files = this.fileResource.value();
    return files.filter(f => f.type === 'folder').map(f => f.id);
  });

  readonly isAllExpanded = computed(() => {
    const expandedCount = this.expandedCount();
    if (expandedCount === 0) return false;
    return expandedCount >= this.folderIds().length;
  });

  constructor(
    rxdb: RxDB,
    pathValidator: FilePathValidatorService,
    fileResource: { value: Signal<FileTreeInstance<C>[]> },
    entityClass: C,
    history?: HistoryScopeAPI
  ) {
    this.rxdb = rxdb;
    this.pathValidator = pathValidator;
    this.fileResource = fileResource;
    this.entityClass = entityClass;
    this.history = history;

    // 恢复排序模式
    const savedMode = localStorage.getItem('file-manager-sort-mode') as SortMode;
    if (savedMode && Object.values(SortMode).includes(savedMode)) {
      this.sortMode.set(savedMode);
    }
  }

  // CRUD Methods

  /**
   * 创建根文件夹
   */
  async createRootFolder(name: string): Promise<void> {
    const allFiles = this.fileResource.value();

    // 检查冲突
    const conflict = this.pathValidator.checkConflict(name, null, null, allFiles);
    if (conflict) {
      this.pathConflictWarning.set(conflict);
      return;
    }

    // 计算 sortOrder
    const rootFolders = allFiles.filter(f => !f.parentId && f.type === 'folder').sort(compareSortOrder);
    const lastRoot = rootFolders[rootFolders.length - 1];
    let newSortOrder: string;
    try {
      newSortOrder = generateKeyBetween(lastRoot?.sortOrder ?? null, null);
    } catch {
      newSortOrder = generateKeyBetween(null, null);
    }

    // 创建文件夹
    const folder = this.createEntity();
    folder.name = name;
    folder.type = 'folder';
    folder.extension = null;
    folder.size = null;
    folder.sortOrder = newSortOrder;
    folder.hasChildren = false;

    await folder.save();

    // 自动展开
    this.expandedFileIds.update(ids => {
      ids.add(folder.id);
      return new Set(ids);
    });
  }

  /**
   * 创建子文件夹
   */
  async createSubFolder(name: string): Promise<void> {
    const parentId = this.selectedFolderId();
    if (!parentId) return;

    const allFiles = this.fileResource.value();

    // 检查冲突
    const conflict = this.pathValidator.checkConflict(name, null, parentId, allFiles);
    if (conflict) {
      this.pathConflictWarning.set(conflict);
      return;
    }

    // 计算 sortOrder
    const siblings = allFiles.filter(f => f.parentId === parentId).sort(compareSortOrder);
    const lastSibling = siblings[siblings.length - 1];
    let newSortOrder: string;
    try {
      newSortOrder = generateKeyBetween(lastSibling?.sortOrder ?? null, null);
    } catch {
      newSortOrder = generateKeyBetween(null, null);
    }

    // 创建文件夹
    const folder = this.createEntity();
    folder.name = name;
    folder.type = 'folder';
    folder.extension = null;
    folder.size = null;
    folder.sortOrder = newSortOrder;
    folder.hasChildren = false;

    // 设置父节点
    const parentFolder = allFiles.find(f => f.id === parentId);
    if (parentFolder) {
      folder.parentId = parentFolder.id;
    }

    await folder.save();
    this.selectedFolderId.set(null);
  }

  /**
   * 创建文件
   */
  async createFile(name: string, extension: string, size: number): Promise<void> {
    const parentId = this.selectedFolderId();
    // 允许在根目录创建文件

    const allFiles = this.fileResource.value();

    // 检查冲突
    const conflict = this.pathValidator.checkConflict(name, extension, parentId, allFiles);
    if (conflict) {
      this.pathConflictWarning.set(conflict);
      return;
    }

    // 计算 sortOrder
    const siblings = allFiles.filter(f => (f.parentId || null) === (parentId || null)).sort(compareSortOrder);
    const lastSibling = siblings[siblings.length - 1];
    let newSortOrder: string;
    try {
      newSortOrder = generateKeyBetween(lastSibling?.sortOrder ?? null, null);
    } catch {
      newSortOrder = generateKeyBetween(null, null);
    }

    // 创建文件
    const file = this.createEntity();
    file.name = name;
    file.type = 'file';
    file.extension = extension ? extension.replace(/^\./, '') : undefined;
    file.size = size;
    file.sortOrder = newSortOrder;

    // 设置父节点（如果有）
    if (parentId) {
      const parentFolder = allFiles.find(f => f.id === parentId);
      if (parentFolder) {
        file.parentId = parentFolder.id;
      }
    }

    await file.save();
    // 不清除 selectedFolderId，保持父文件夹选中状态以便继续添加文件
  }

  // Edit Methods

  /**
   * 开始编辑
   */
  startEdit(fileId: string): void {
    this.editingFileId.set(fileId);
  }

  /**
   * 保存编辑
   */
  async saveEdit(newName: string, newExtension?: string | null): Promise<void> {
    const fileId = this.editingFileId();
    if (!fileId) return;

    const allFiles = this.fileResource.value();
    const file = allFiles.find(f => f.id === fileId);
    if (!file) return;

    // 检查冲突（排除自己）
    const extension = newExtension !== undefined ? newExtension : (file.extension ?? null);
    const parentId = file.parentId ?? null;
    const conflict = this.pathValidator.checkConflict(newName, extension, parentId, allFiles, fileId);

    if (conflict) {
      this.pathConflictWarning.set(conflict);
      return;
    }

    // 更新名称
    file.name = newName;
    if (newExtension !== undefined) {
      file.extension = newExtension;
    }

    await file.save();
    this.editingFileId.set(null);
  }

  /**
   * 取消编辑
   */
  cancelEdit(): void {
    this.editingFileId.set(null);
  }

  // Delete Methods

  /**
   * 删除文件/文件夹
   */
  async deleteFile(file: FileTreeInstance<C>): Promise<void> {
    const allFiles = this.fileResource.value();
    const hasChildren = allFiles.some(f => f.parentId === file.id);

    if (!hasChildren) {
      // 直接删除
      await file.remove();
    } else {
      // 显示确认对话框
      this.fileToDelete.set(file);
    }
  }

  /**
   * 取消删除
   */
  cancelDelete(): void {
    this.fileToDelete.set(null);
  }

  /**
   * 级联删除（删除节点及其所有后代）
   */
  async executeCascadeDelete(): Promise<void> {
    const file = this.fileToDelete();
    if (!file) return;

    const allFiles = this.fileResource.value();
    const descendantIds = collectDescendants(file.id, allFiles);

    // 删除所有后代
    for (const descendantId of descendantIds) {
      const descendant = allFiles.find(f => f.id === descendantId);
      if (descendant) {
        await descendant.remove();
      }
    }

    // 删除自己
    await file.remove();
    this.fileToDelete.set(null);
  }

  // Expand Methods

  /**
   * 切换展开/折叠
   */
  toggleExpand(file: FileTreeInstance<C>): void {
    // 使用 View Transition API 实现平滑过渡
    if ('startViewTransition' in document) {
      document.startViewTransition(() => {
        this.expandedFileIds.update(expanded => {
          const newExpanded = new Set(expanded);
          if (newExpanded.has(file.id)) {
            newExpanded.delete(file.id);
          } else {
            newExpanded.add(file.id);
          }
          return newExpanded;
        });
      });
    } else {
      this.expandedFileIds.update(expanded => {
        const newExpanded = new Set(expanded);
        if (newExpanded.has(file.id)) {
          newExpanded.delete(file.id);
        } else {
          newExpanded.add(file.id);
        }
        return newExpanded;
      });
    }
  }

  // Select Methods

  /**
   * 选中文件夹（用于"添加到此文件夹"）
   * 如果点击的是已选中的文件夹，则取消选中
   */
  selectFolder(folderId: string): void {
    const currentSelected = this.selectedFolderId();

    // 切换逻辑：如果点击的是已选中的文件夹，则取消选中
    if (currentSelected === folderId) {
      this.selectedFolderId.set(null);
      return;
    }

    this.selectedFolderId.set(folderId);
    // 自动展开选中的文件夹
    this.expandedFileIds.update(expanded => {
      const newExpanded = new Set(expanded);
      newExpanded.add(folderId);
      return newExpanded;
    });
  }

  /**
   * 取消文件夹选择
   */
  cancelSelectFolder(): void {
    this.selectedFolderId.set(null);
  }

  // Conflict Methods

  /**
   * 清除路径冲突警告
   */
  clearPathConflict(): void {
    this.pathConflictWarning.set(null);
  }

  /**
   * 设置搜索关键字
   */
  setSearchKeyword(keyword: string): void {
    this.searchKeyword.set(keyword);
  }

  /**
   * 设置排序模式
   */
  setSortMode(mode: SortMode): void {
    this.sortMode.set(mode);
    // 保存到 localStorage
    localStorage.setItem('file-manager-sort-mode', mode);
  }

  /**
   * 切换全部展开/折叠
   */
  toggleExpandAll(): void {
    if (this.isAllExpanded()) {
      // 全部折叠
      this.expandedFileIds.set(new Set());
    } else {
      // 全部展开
      const allFiles = this.fileResource.value();
      const allFolderIds = allFiles.filter(f => f.type === 'folder').map(f => f.id);
      this.expandedFileIds.set(new Set(allFolderIds));
    }
  }

  /**
   * 删除所有文件和文件夹
   */
  async deleteAllFiles(): Promise<void> {
    const allFiles = this.fileResource.value();
    await this.rxdb.entityManager.removeMany<C>(allFiles);
  }

  /**
   * 批量添加文件
   */
  async addBatch(count: number): Promise<void> {
    const files: FileTreeInstance<C>[] = [];
    const rootId = this.selectedFolderId();
    const timestamp = Date.now();
    const availableParentIds: (string | null)[] = [rootId || null];

    // 1. Create file instances
    for (let i = 0; i < count; i++) {
      const isFolder = Math.random() > 0.8;
      const type = isFolder ? 'folder' : 'file';
      const name = isFolder ? `Folder ${timestamp}-${i}` : `File ${timestamp}-${i}`;
      const parentId = availableParentIds[Math.floor(Math.random() * availableParentIds.length)];

      const file = this.createEntity();
      file.name = name;
      file.type = type;
      file.parentId = parentId;
      file.sortOrder = '';
      file.extension = type === 'file' ? 'txt' : undefined;
      file.size = type === 'file' ? Math.floor(Math.random() * 10000) : undefined;

      files.push(file);

      if (isFolder) {
        availableParentIds.push(file.id);
      }
    }

    // 2. Group by parentId
    const filesByParent = new Map<string | null, FileTreeInstance<C>[]>();
    for (const file of files) {
      const pid = file.parentId || null;
      if (!filesByParent.has(pid)) {
        filesByParent.set(pid, []);
      }
      filesByParent.get(pid)!.push(file);
    }

    // 3. Assign sortOrder
    const allExistingFiles = this.fileResource.value();

    for (const [parentId, children] of filesByParent.entries()) {
      // Find last sortOrder from existing files
      let lastSortOrder: string | null = null;

      const existingSiblings = allExistingFiles.filter(f => (f.parentId || null) === parentId);
      if (existingSiblings.length > 0) {
        existingSiblings.sort(compareSortOrder);
        lastSortOrder = existingSiblings[existingSiblings.length - 1].sortOrder ?? null;
      }

      // Generate keys for new children
      for (const child of children) {
        let newSortOrder: string;
        try {
          newSortOrder = generateKeyBetween(lastSortOrder, null);
        } catch {
          newSortOrder = generateKeyBetween(null, null);
        }
        child.sortOrder = newSortOrder;
        lastSortOrder = newSortOrder;
      }
    }

    // 4. Save (batch in single transaction for single undo)
    await this.rxdb.entityManager.saveMany<C>(files);
  }

  protected createEntity(): FileTreeInstance<C> {
    return new this.entityClass() as FileTreeInstance<C>;
  }
}

/**
 * 带拖拽功能的树形文件管理 Store
 * 扩展 TreeFileStore 添加拖拽状态管理和操作
 */
export class TreeFileDragDropStore<C extends FileTreeEntityConstructor> extends TreeFileStore<C> {
  protected dragDropService: FileDragDropService;
  protected autoExpandTimer: ReturnType<typeof setTimeout> | null = null;
  protected autoExpandTargetId: string | null = null;

  // Drag State Signals
  readonly dragDropState = signal<{
    draggedItemId: string | null;
    targetItemId: string | null;
    dropMode: DropMode | null;
    isValidTarget: boolean;
    dragStartTime?: number;
  }>({
    draggedItemId: null,
    targetItemId: null,
    dropMode: null,
    isValidTarget: false
  });

  // Computed: 无效的拖放目标
  readonly invalidTargets = computed(() => {
    const draggedId = this.dragDropState().draggedItemId;
    if (!draggedId) return new Set<string>();

    const allFiles = this.fileResource.value();
    return this.dragDropService.getInvalidTargets(draggedId, allFiles);
  });

  // Computed: 高亮的目标节点（拖入文件夹时高亮其所有子节点）
  readonly highlightedFileIds = computed(() => {
    const state = this.dragDropState();
    if (!state.targetItemId || !state.isValidTarget || state.dropMode !== 'into') {
      return new Set<string>();
    }

    const allFiles = this.fileResource.value();
    const targetFile = allFiles.find(f => f.id === state.targetItemId);
    if (!targetFile) return new Set<string>();

    return collectDescendants(targetFile.id, allFiles);
  });

  constructor(
    rxdb: RxDB,
    pathValidator: FilePathValidatorService,
    dragDropService: FileDragDropService,
    fileResource: { value: Signal<FileTreeInstance<C>[]> },
    entityClass: C,
    history: HistoryScopeAPI
  ) {
    super(rxdb, pathValidator, fileResource, entityClass, history);
    this.dragDropService = dragDropService;
  }

  // Drag & Drop Logic

  /**
   * 开始拖拽
   */
  onDragStart(fileId: string): void {
    // 取消文件夹选中状态
    this.selectedFolderId.set(null);

    this.dragDropState.update(state => ({
      ...state,
      draggedItemId: fileId,
      dragStartTime: Date.now()
    }));
  }

  /**
   * 拖拽悬停
   */
  onDragOver(
    targetFile: FileTreeInstance<C>,
    clientY: number,
    rect: DOMRect
  ): { dropMode: DropMode | null; isValid: boolean } {
    const draggedId = this.dragDropState().draggedItemId;
    if (!draggedId) return { dropMode: null, isValid: false };

    const draggedFile = this.fileResource.value().find(f => f.id === draggedId);
    if (!draggedFile) return { dropMode: null, isValid: false };

    const isManualSort = this.sortMode() === SortMode.Manual;
    const isRootLevel = !targetFile.parentId;
    const dropMode = this.dragDropService.calculateDropMode(clientY, rect, isManualSort, isRootLevel);
    const isValid = this.dragDropService.isValidDrop(
      draggedId,
      targetFile.id,
      dropMode,
      this.fileResource.value(),
      isManualSort
    );

    const prevTargetId = this.dragDropState().targetItemId;
    if (prevTargetId !== targetFile.id) {
      this.clearAutoExpandTimer();
      this.autoExpandTargetId = null;
    }

    this.dragDropState.update(state => ({
      ...state,
      targetItemId: targetFile.id,
      dropMode,
      isValidTarget: isValid
    }));

    // 自动展开文件夹
    if (
      dropMode === 'into' &&
      isValid &&
      targetFile.type === 'folder' &&
      !this.expandedFileIds().has(targetFile.id) &&
      this.autoExpandTargetId !== targetFile.id
    ) {
      const hasChildren = this.fileResource.value().some(f => f.parentId === targetFile.id);

      if (hasChildren) {
        this.autoExpandTargetId = targetFile.id;
        this.autoExpandTimer = setTimeout(() => {
          this.expandedFileIds.update(ids => {
            const newIds = new Set(ids);
            newIds.add(targetFile.id);
            return newIds;
          });
          this.autoExpandTargetId = null;
        }, 800);
      }
    }

    return { dropMode, isValid };
  }

  /**
   * 离开拖拽目标
   */
  onDragLeave(): void {
    this.clearAutoExpandTimer();
    this.dragDropState.update(state => ({
      ...state,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    }));
  }

  /**
   * 完成拖拽
   */
  async onDrop(targetFile: FileTreeInstance<C>): Promise<void> {
    const state = this.dragDropState();
    if (!state.draggedItemId || !state.isValidTarget || !state.dropMode) {
      this.resetDragState();
      return;
    }

    const draggedFile = this.fileResource.value().find(f => f.id === state.draggedItemId);
    if (!draggedFile) {
      this.resetDragState();
      return;
    }

    // 检查是否是冗余拖放（拖到原位置）
    if (this.isDropRedundant(draggedFile, targetFile, state.dropMode, this.fileResource.value())) {
      this.resetDragState();
      return;
    }

    try {
      // 提取核心拖放逻辑
      const dropLogic = async () => {
        const result = await this.dragDropService.executeDrop(
          state.draggedItemId!,
          targetFile.id,
          state.dropMode!,
          this.fileResource.value()
        );

        if (!result.success) {
          console.error('Drop failed:', result.error);
          return;
        }

        // 如果拖入文件夹,展开该文件夹
        if (state.dropMode === 'into' && result.newParentId) {
          this.expandedFileIds.update(ids => {
            const newIds = new Set(ids);
            newIds.add(result.newParentId!);
            return newIds;
          });
        }
      };

      // 使用 View Transition API 实现平滑过渡
      if ('startViewTransition' in document) {
        await document.startViewTransition(dropLogic).finished;
      } else {
        // 降级处理：不支持 View Transition API
        await dropLogic();
      }
    } finally {
      this.resetDragState();
    }
  }

  /**
   * 结束拖拽
   */
  onDragEnd(): void {
    this.clearAutoExpandTimer();
    this.resetDragState();
  }

  /**
   * 清除自动展开计时器
   */
  protected clearAutoExpandTimer(): void {
    if (this.autoExpandTimer) {
      clearTimeout(this.autoExpandTimer);
      this.autoExpandTimer = null;
    }
    this.autoExpandTargetId = null;
  }

  /**
   * 检查拖放是否冗余（拖到原位置）
   */
  protected isDropRedundant(
    draggedFile: FileTreeInstance<C>,
    targetFile: FileTreeInstance<C>,
    dropMode: DropMode,
    allFiles: FileTreeInstance<C>[]
  ): boolean {
    // 确定新的父节点
    let newParentId: string | null;
    if (dropMode === 'into') {
      newParentId = targetFile.id;
    } else {
      newParentId = targetFile.parentId || null;
    }

    // 检查父节点是否改变
    const currentParentId = draggedFile.parentId || null;
    if (newParentId !== currentParentId) {
      return false; // 父节点改变，不是冗余
    }

    // 获取同级节点并排序
    const siblings = allFiles.filter(f => (f.parentId || null) === currentParentId).sort(compareSortOrder);

    const currentIndex = siblings.findIndex(f => f.id === draggedFile.id);
    if (currentIndex === -1) return false;

    // into 模式：如果拖到最后一个同级节点的 into，则是冗余
    if (dropMode === 'into') {
      return currentIndex === siblings.length - 1;
    }

    const targetIndex = siblings.findIndex(f => f.id === targetFile.id);
    if (targetIndex === -1) return false;

    // before 模式：如果当前位置就在目标前面（或就是目标），则是冗余
    if (dropMode === 'before') {
      return currentIndex === targetIndex || currentIndex === targetIndex - 1;
    }

    // after 模式：如果当前位置就在目标后面（或就是目标），则是冗余
    if (dropMode === 'after') {
      return currentIndex === targetIndex || currentIndex === targetIndex + 1;
    }

    return false;
  }

  /**
   * 重置拖拽状态
   */
  protected resetDragState(): void {
    this.dragDropState.set({
      draggedItemId: null,
      targetItemId: null,
      dropMode: null,
      isValidTarget: false
    });
  }
}
