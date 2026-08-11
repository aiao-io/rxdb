/* eslint-disable @angular-eslint/prefer-inject */
import type { HistoryScopeAPI } from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
import { useAction } from '@aiao/rxdb-angular';
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  computed,
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
import { FileTreeEntityConstructor, FileTreeInstance, TreeNode } from '../models/file-node.interface';
import { getFileIcon } from '../models/file-types';
import { SortMode } from './file-sorters';
import { TreeFileStore } from './tree-file.store';

@Directive()
export abstract class TreeFileBase<C extends FileTreeEntityConstructor> implements OnInit, AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly rxdb: RxDB = inject(RxDB);
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly store: TreeFileStore<C>;
  readonly fileResource: { value: Signal<FileTreeInstance<C>[]> };
  readonly entityClass: C;
  readonly history: HistoryScopeAPI;

  fullHeaderRef = viewChild<ElementRef<HTMLElement>>('fullHeader');
  mainContainerRef = viewChild<ElementRef<HTMLElement>>('mainContainer');

  readonly $show_history = signal<boolean>(true);
  readonly $show_sticky_header = signal<boolean>(false);
  readonly $is_adding_file = signal<boolean>(false);

  readonly $search_keyword = signal<string>('');
  readonly $new_file_name = signal<string>('');
  readonly $new_file_extension = signal<string>('');
  readonly $edit_file_name = signal<string>('');

  readonly add_many = useAction((count?: number) => this.store.addBatch(count ?? 100));
  readonly delete_all = useAction(() => this.store.deleteAllFiles());

  readonly batchAddOptions = [
    { count: 100, label: '100 条' },
    { count: 1000, label: '1000 条' },
    { count: 5000, label: '5000 条' },
    { count: 10000, label: '10000 条' }
  ];

  // Computed Properties
  readonly isSubmitDisabled = computed(() => {
    const isAddingFile = this.$is_adding_file();
    const fileName = this.$new_file_name().trim();
    const extension = this.$new_file_extension().trim();

    if (isAddingFile) {
      // 文件模式: 需要文件名、扩展名（父文件夹可选，允许根目录文件）
      return !fileName || !extension;
    } else {
      // 文件夹模式: 只需要文件夹名
      return !fileName;
    }
  });

  // Delegate Properties
  get expandedFileIds() {
    return this.store.expandedFileIds;
  }
  get editingFileId() {
    return this.store.editingFileId;
  }
  get selectedFolderId() {
    return this.store.selectedFolderId;
  }
  get fileToDelete() {
    return this.store.fileToDelete;
  }
  get pathConflictWarning() {
    return this.store.pathConflictWarning;
  }
  get searchKeyword() {
    return this.store.searchKeyword;
  }
  get matchedFileIds() {
    return this.store.matchedFileIds;
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
  get deleteImpact() {
    return this.store.deleteImpact;
  }

  constructor(
    store: TreeFileStore<C>,
    fileResource: { value: Signal<FileTreeInstance<C>[]> },
    entityClass: C,
    history: HistoryScopeAPI
  ) {
    this.store = store;
    this.fileResource = fileResource;
    this.entityClass = entityClass;
    this.history = history;

    // 监听文件名变化，清除路径冲突警告
    effect(() => {
      const value = this.$new_file_name();
      if (value && value.trim() && this.store.pathConflictWarning()) {
        this.store.clearPathConflict();
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

  toggleExpand(file: FileTreeInstance<C>): void {
    this.store.toggleExpand(file);
  }

  async addRootFolder(event: Event): Promise<void> {
    event.preventDefault();
    const title = this.$new_file_name().trim();
    if (!title) return;

    try {
      await this.store.createRootFolder(title);
      this.$new_file_name.set('');
    } catch (error) {
      console.error('Error adding root folder:', error);
      alert('添加根文件夹失败');
    }
  }

  selectFolder(folderId: string): void {
    this.store.selectFolder(folderId);
  }

  cancelSelectFolder(): void {
    this.store.cancelSelectFolder();
    this.$new_file_name.set('');
  }

  async addSubFolder(event: Event): Promise<void> {
    event.preventDefault();
    const title = this.$new_file_name().trim();
    if (!title) return;

    try {
      await this.store.createSubFolder(title);
      this.$new_file_name.set('');
    } catch (error) {
      console.error('Error adding sub folder:', error);
      alert('添加子文件夹失败');
    }
  }

  async addFile(event: Event): Promise<void> {
    event.preventDefault();
    const name = this.$new_file_name().trim();
    const extension = this.$new_file_extension().trim();
    if (!name || !extension) return;

    try {
      await this.store.createFile(name, extension, 0);
      this.$new_file_name.set('');
      // 保持扩展名和文件模式，方便连续添加同类型文件
    } catch (error) {
      console.error('Error adding file:', error);
      alert('添加文件失败');
    }
  }

  toggleAddingMode(): void {
    this.$is_adding_file.update(v => !v);
    if (this.$is_adding_file()) {
      // 切换到文件模式时,清空文件名并设置默认扩展名
      this.$new_file_name.set('');
      this.$new_file_extension.set('.txt');
    }
  }

  startEdit(event: Event, file: FileTreeInstance<C>): void {
    event.preventDefault();
    event.stopPropagation();
    this.store.startEdit(file.id);
    this.$edit_file_name.set(file.name);
  }

  async saveEdit(event: Event): Promise<void> {
    event.preventDefault();
    const title = this.$edit_file_name().trim();
    if (!title) return;

    try {
      await this.store.saveEdit(title);
    } catch (error) {
      console.error('Error updating file/folder:', error);
      alert('更新失败');
    }
  }

  cancelEdit(): void {
    this.store.cancelEdit();
    this.$edit_file_name.set('');
  }

  async deleteFile(event: Event, file: FileTreeInstance<C>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    try {
      await this.store.deleteFile(file);
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('删除失败');
    }
  }

  cancelDelete(): void {
    this.store.cancelDelete();
  }

  async executeCascadeDelete(): Promise<void> {
    try {
      await this.store.executeCascadeDelete();
    } catch (error) {
      console.error('Error cascading delete:', error);
      alert('删除失败');
    }
  }

  clearPathWarning(): void {
    this.store.clearPathConflict();
  }

  getSelectedFolderTitle(): string {
    const folderId = this.store.selectedFolderId();
    if (!folderId) return '';
    const folder = this.fileResource.value().find(f => f.id === folderId);
    return folder?.name ?? '';
  }

  clearSearch(): void {
    this.$search_keyword.set('');
    this.store.setSearchKeyword('');
  }

  isFileMatched(fileId: string): boolean {
    return this.store.matchedFileIds().has(fileId);
  }

  trackByFileId(_index: number, item: TreeNode<FileTreeInstance<C>>): string {
    return item.node.id;
  }

  getFileIconName(node: FileTreeInstance<C>): string {
    return getFileIcon(node.type, node.extension);
  }

  undo(): void {
    this.history?.undo();
  }

  redo(): void {
    this.history?.redo();
  }

  toggle_history(): void {
    this.$show_history.update(show => !show);
  }

  scroll_to_top(): void {
    const mainContainer = this.mainContainerRef();
    if (!mainContainer) return;
    mainContainer.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Sort Methods

  sortMode(): string {
    return this.store.sortMode();
  }

  setSortMode(mode: SortMode): void {
    this.store.setSortMode(mode);
  }

  /**
   * 处理排序模式变更事件（类型安全）
   * 替代模板中的 $any($event.target).value
   */
  onSortModeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const mode = Object.values(SortMode).find(value => value === target.value);
    if (mode) this.setSortMode(mode);
  }

  /**
   * 处理表单提交（根据状态路由到不同的添加方法）
   * 替代模板中的复杂三元表达式
   */
  onFormSubmit(event: Event): void {
    const isAddingFile = this.$is_adding_file();
    if (isAddingFile) {
      this.addFile(event);
    } else if (this.selectedFolderId()) {
      this.addSubFolder(event);
    } else {
      this.addRootFolder(event);
    }
  }
}
