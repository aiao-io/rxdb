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
  untracked,
  viewChild
} from '@angular/core';
import { listen } from '../../../shared/event-listener';
import { formatTreeWriteError, TreeWriteOperation } from '../../../shared/tree-write-error';
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

  /** 写入失败的页内提示文案；`null` 表示没有错误。含拖放。 */
  readonly writeError = signal<string | null>(null);

  readonly add_1 = useAction(async (count?: number) => {
    // 模拟网络延迟，确保 loading 状态可见
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.addMany(count ?? 100);
  });
  readonly add_2 = useAction((count?: number) => this.addMany(count ?? 1000));
  readonly add_3 = useAction(async (count?: number) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.addMany(count ?? 5000);
  });
  readonly add_4 = useAction((count?: number) => this.addMany(count ?? 10000));
  readonly delete_all = useAction(async () => {
    await this.runWrite('删除全部', () => this.store.deleteAllMenus());
  });

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
    // 监听菜单标题变化，清除路径冲突警告。
    // 只追踪标题：重名时输入保留，追踪警告会让它一出现就被这里清掉
    effect(() => {
      const value = this.$new_menu_title();
      if (value && value.trim() && untracked(this.store.pathConflictWarning)) {
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

    // 只在新建成功后清空：重名或写入失败时保留用户输入
    await this.runWrite('新建', async () => {
      if (await this.store.addRootMenu(title)) this.$new_menu_title.set('');
    });
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

    await this.runWrite('新建', async () => {
      if (await this.store.addChildMenu(title)) this.$new_menu_title.set('');
    });
  }

  /**
   * 表单提交入口：按**实时**的 `selectedParentId` 分流。
   *
   * 模板里的 `@let parentId` 是变更检测时的快照。zoneless 下选中父节点后，
   * 若在下一次变更检测落地前就提交（点"添加子菜单"后立刻键入并回车），
   * 快照仍是 null，子菜单会被静默创建成根菜单。分流必须读 signal。
   */
  onFormSubmit(event: Event): Promise<void> {
    return this.selectedParentId() === null ? this.addRootMenu(event) : this.addChildMenu(event);
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

    await this.runWrite('重命名', () => this.store.saveEdit(title));
  }

  cancelEdit(): void {
    this.store.cancelEdit();
    this.$edit_menu_title.set('');
  }

  async deleteMenu(event: Event, menu: TreeMenuInstance<C>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.runWrite('删除', () => this.store.deleteMenu(menu));
  }

  cancelDelete(): void {
    this.store.cancelDelete();
  }

  async executeCascadeDelete(): Promise<void> {
    const done = await this.runWrite('级联删除', () => this.store.executeCascadeDelete());
    // 失败时关掉对话框，页内提示才不被模态层挡住
    if (!done) this.store.cancelDelete();
  }

  async executePromoteChildrenDelete(): Promise<void> {
    const done = await this.runWrite('删除并提升子节点', () => this.store.executePromoteChildrenDelete());
    if (!done) this.store.cancelDelete();
  }

  /** 关闭写入失败的页内提示。 */
  clearWriteError(): void {
    this.writeError.set(null);
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

  /**
   * 执行一次写入：开始前清掉上一次的错误，失败时把文案写进 {@link writeError}。
   * 失败后页面状态即库里已提交的状态，下一次操作照常可用。
   *
   * @returns 写入是否成功
   */
  protected async runWrite(operation: TreeWriteOperation, write: () => Promise<unknown>): Promise<boolean> {
    this.writeError.set(null);
    try {
      await write();
      return true;
    } catch (error) {
      this.writeError.set(formatTreeWriteError(operation, error));
      return false;
    }
  }

  /** 批量添加；失败写页内提示而不是经 `useAction` 抛成未处理的拒绝。 */
  private async addMany(count: number): Promise<void> {
    await this.runWrite('批量添加', () => this.store.add_many_menu(count));
  }
}
