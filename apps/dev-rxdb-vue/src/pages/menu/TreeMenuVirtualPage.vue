<script lang="ts" setup>
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { useFindAll, useRxDB } from '@aiao/rxdb-vue';
import { formatErrorMessage, useToast } from '../../app/composables/useToast';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useObservable } from '@vueuse/rxjs';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  History,
  Pen,
  Plus,
  Redo2,
  Search,
  Trash2,
  TriangleAlert,
  Undo2,
  X
} from '@lucide/vue';
import { computed, ref, toRefs } from 'vue';
import HistorySidebar from '../../app/components/HistorySidebar.vue';
import { useDragDrop } from '../../app/composables/useDragDrop';
import { useTreeMenuVirtualStore } from '../../app/composables/useTreeMenuVirtualStore';
import { generateBatchMenus } from '../../app/utils/menu-utils';
import { pairVirtualRows } from '../../app/utils/virtual-rows';

const rxdb = useRxDB();
const showHistory = ref(true);
const newTitle = ref('');
const loadingActions = ref<Set<string>>(new Set());
const parentRef = ref<HTMLElement | null>(null);

const history = computed(() => rxdb.versionManager.history(MenuLarge));
const histories = useObservable(history.value.histories$, { initialValue: [] });
const undoCount = useObservable(history.value.undoCount$, { initialValue: 0 });
const redoCount = useObservable(history.value.redoCount$, { initialValue: 0 });

// 获取所有菜单数据
const { value: menus } = toRefs(
  useFindAll(MenuLarge, {
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'sortOrder', sort: 'asc' }]
  })
);

const store = useTreeMenuVirtualStore(menus);

const focusMenuTitleInput = () => {
  window.document.getElementById('menu-title-input')?.focus();
};

// Drag and drop
const dragDrop = useDragDrop<MenuLarge>(menus);

// 虚拟滚动配置
const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: store.treeNodes.value.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => 36, // 每行高度
    overscan: 5
  }))
);

const virtualRows = computed(() => pairVirtualRows(store.treeNodes.value, rowVirtualizer.value.getVirtualItems()));
const totalSize = computed(() => rowVirtualizer.value.getTotalSize());

// 批量添加菜单（带随机层级）
const handleAddMany = async (count: number, actionKey: string) => {
  loadingActions.value.add(actionKey);
  try {
    const existingRoots = menus.value
      .filter(m => !m.parentId)
      .sort((a, b) => (a.sortOrder || '').localeCompare(b.sortOrder || ''));

    const newMenus = generateBatchMenus(count, MenuLarge, existingRoots);
    await rxdb.entityManager.saveMany(newMenus);
  } finally {
    loadingActions.value.delete(actionKey);
  }
};

// 删除所有菜单
const handleDeleteAll = async () => {
  const actionKey = 'delete-all';
  loadingActions.value.add(actionKey);
  try {
    await rxdb.entityManager.removeMany(menus.value);
  } finally {
    loadingActions.value.delete(actionKey);
  }
};

// 保存编辑
const handleSave = async (menu: MenuLarge) => {
  await menu.save();
  store.cancelEdit();
};

// 添加菜单
const handleAddMenu = async () => {
  if (!newTitle.value.trim()) return;

  if (store.selectedParentId.value) {
    const parent = menus.value.find(m => m.id === store.selectedParentId.value);
    if (parent) {
      await store.addChild(parent, newTitle.value);
      newTitle.value = '';
    }
  } else {
    await store.addRoot(newTitle.value);
    newTitle.value = '';
  }
};

// 拖拽事件处理
const handleDragStart = (e: DragEvent, menuId: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', menuId);
  }
  dragDrop.onDragStart(menuId);
};

const handleDragOver = (e: DragEvent, menu: MenuLarge) => {
  e.preventDefault();
  const element = e.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  const { isValid } = dragDrop.onDragOver(menu, e.clientY, rect);
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = isValid ? 'move' : 'none';
  }
};

const handleDragLeave = (e: DragEvent) => {
  const target = e.currentTarget as HTMLElement;
  const related = e.relatedTarget as HTMLElement;
  if (!target.contains(related)) {
    dragDrop.onDragLeave();
  }
};

const handleDrop = async (e: DragEvent, menu: MenuLarge) => {
  e.preventDefault();
  e.stopPropagation();
  try {
    await dragDrop.onDrop(menu, menuId => {
      // 展开目标菜单
      if (!store.expandedIds.value.has(menuId)) {
        store.toggleExpand(menuId);
      }
    });
  } catch (error: unknown) {
    useToast().error(formatErrorMessage('拖放操作失败', error));
  }
};

const handleDragEnd = () => {
  dragDrop.onDragEnd();
};
</script>

<template>
  <div class="flex h-full w-full overflow-hidden">
    <!-- 历史侧边栏 -->
    <HistorySidebar
      :histories="histories"
      :scope-type="history.type"
      :show="showHistory"
      @close="showHistory = false"
      border-side="right"
    />

    <main
      class="flex h-full min-w-0 flex-1 flex-col overflow-auto"
      ref="parentRef"
    >
      <!-- Header -->
      <div class="border-base-300 bg-base-100 flex-none border-b p-4">
        <div class="mx-auto flex max-w-4xl flex-col gap-3">
          <!-- Title Bar -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold">Tree Menu - Virtual Scroll</h1>
              <div
                class="badge badge-primary"
                data-testid="menu-count"
                >{{ menus.length }} 项</div
              >

              <!-- 批量添加 -->
              <div class="dropdown dropdown-end">
                <button
                  class="btn btn-circle btn-sm"
                  aria-label="批量添加"
                  data-testid="menu-batch-add"
                >
                  <Plus :size="16" />
                </button>
                <ul class="dropdown-content menu rounded-box bg-base-100 z-10 w-52 p-2 shadow">
                  <li
                    v-for="{ count, label } in [
                      { count: 100, label: '添加 100 条' },
                      { count: 1000, label: '添加 1000 条' },
                      { count: 5000, label: '添加 5000 条' },
                      { count: 10000, label: '添加 10000 条' }
                    ]"
                    :key="count"
                  >
                    <button
                      :data-testid="`menu-batch-option-${count}`"
                      :disabled="loadingActions.has(`add-${count}`)"
                      @click="handleAddMany(count, `add-${count}`)"
                    >
                      <span
                        class="loading loading-spinner loading-xs"
                        v-if="loadingActions.has(`add-${count}`)"
                      />
                      {{ label }}
                    </button>
                  </li>
                </ul>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <!-- Undo/Redo -->
              <div class="join">
                <button
                  class="btn btn-sm join-item"
                  :disabled="undoCount === 0"
                  @click="history.undo()"
                  aria-label="撤销"
                >
                  <Undo2 :size="16" />
                  <span
                    class="badge badge-xs"
                    v-if="undoCount > 0"
                  >
                    {{ undoCount }}
                  </span>
                </button>
                <button
                  class="btn btn-sm join-item"
                  :disabled="redoCount === 0"
                  @click="history.redo()"
                  aria-label="重做"
                >
                  <Redo2 :size="16" />
                  <span
                    class="badge badge-xs"
                    v-if="redoCount > 0"
                  >
                    {{ redoCount }}
                  </span>
                </button>
              </div>

              <!-- History Toggle -->
              <button
                class="btn btn-sm"
                :class="{ 'btn-primary': showHistory }"
                @click="showHistory = !showHistory"
                aria-label="历史记录"
              >
                <History :size="16" />
              </button>
            </div>
          </div>

          <!-- 统计信息 & 操作栏 -->
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <div class="bg-base-100 border-base-200 flex items-center gap-2 rounded-lg border px-3 py-1 shadow-sm">
                <span class="text-xs opacity-70">已展开</span>
                <span class="font-mono text-lg font-bold">{{ store.expandedCount.value }}</span>
              </div>
              <button
                class="btn btn-sm btn-ghost btn-square"
                :title="store.isAllExpanded.value ? '折叠全部' : '展开全部'"
                @click="store.isAllExpanded.value ? store.collapseAll() : store.expandAll()"
              >
                <ChevronsUp
                  v-if="store.isAllExpanded.value"
                  :size="20"
                />
                <ChevronsDown
                  v-else
                  :size="20"
                />
              </button>
            </div>

            <button
              class="btn btn-sm btn-error btn-outline"
              :disabled="loadingActions.has('delete-all')"
              @click="handleDeleteAll"
            >
              <span
                class="loading loading-spinner loading-xs"
                v-if="loadingActions.has('delete-all')"
              />
              <Trash2
                v-else
                :size="16"
              />
              删除所有数据
            </button>
          </div>

          <!-- 添加菜单 (根/子) -->
          <form
            class="flex gap-2"
            @submit.prevent="handleAddMenu"
          >
            <div class="join flex-1">
              <div
                class="join-item bg-base-200 border-base-300 flex items-center border border-r-0 px-3 text-sm"
                v-if="store.selectedParentId.value"
              >
                <span class="mr-1 opacity-70">父节点:</span>
                <span class="max-w-[8rem] truncate font-medium">
                  {{ menus.find(m => m.id === store.selectedParentId.value)?.title }}
                </span>
                <button
                  class="btn btn-ghost btn-xs btn-circle ml-1 h-5 min-h-0 w-5"
                  @click="
                    store.setSelectedParentId(null);
                    newTitle = '';
                  "
                  title="取消选择父节点"
                  type="button"
                >
                  <X :size="14" />
                </button>
              </div>
              <input
                class="input input-bordered input-sm join-item min-w-0 flex-1"
                id="menu-title-input"
                v-model="newTitle"
                :placeholder="store.selectedParentId.value ? '输入子菜单标题...' : '输入根菜单标题...'"
                data-testid="menu-title-input"
                type="text"
              />
            </div>
            <button
              class="btn btn-primary btn-sm"
              :data-testid="store.selectedParentId.value ? 'menu-submit-child' : 'menu-add-root'"
              :disabled="!newTitle.trim()"
              type="submit"
            >
              <Plus :size="16" />
              {{ store.selectedParentId.value ? '添加子菜单' : '添加根菜单' }}
            </button>
          </form>

          <!-- Search Bar -->
          <div class="flex gap-2">
            <div class="relative flex-1">
              <Search
                class="text-base-content/40 absolute top-1/2 left-3 -translate-y-1/2"
                :size="16"
              />
              <input
                class="input input-bordered input-sm w-full pl-10"
                v-model="store.searchKeyword.value"
                data-testid="menu-search-input"
                placeholder="搜索菜单..."
                type="text"
              />
            </div>
            <button
              class="btn btn-ghost btn-sm"
              v-if="store.searchKeyword.value"
              @click="store.setSearchKeyword('')"
              type="button"
            >
              <X :size="16" />
              清除
            </button>
          </div>
        </div>
      </div>

      <!-- Tree List (Virtual) -->
      <div class="flex-1 p-4">
        <div
          class="relative mx-auto max-w-4xl"
          :style="{ height: `${totalSize}px` }"
        >
          <div
            class="hero absolute min-h-40 w-full"
            v-if="store.treeNodes.value.length === 0"
          >
            <div class="hero-content text-center">
              <h1 class="text-sm font-bold">暂无菜单数据</h1>
            </div>
          </div>
          <template v-else>
            <div
              class="group absolute top-0 left-0 flex w-full items-center gap-2 rounded px-2 py-1 transition-colors"
              v-for="{ item: node, virtualItem: virtualRow } in virtualRows"
              :class="[
                dragDrop.dragDropState.value.draggedItemId !== node.menu.id && 'hover:bg-base-200',
                dragDrop.dragDropState.value.draggedItemId === node.menu.id && 'cursor-move opacity-50',
                dragDrop.dragDropState.value.targetItemId === node.menu.id &&
                  !dragDrop.dragDropState.value.isValidTarget &&
                  'ring-error ring-2',
                dragDrop.dragDropState.value.targetItemId === node.menu.id &&
                  dragDrop.dragDropState.value.isValidTarget &&
                  dragDrop.dragDropState.value.dropMode === 'before' &&
                  'border-t-primary border-t-2',
                dragDrop.dragDropState.value.targetItemId === node.menu.id &&
                  dragDrop.dragDropState.value.isValidTarget &&
                  dragDrop.dragDropState.value.dropMode === 'after' &&
                  'border-b-primary border-b-2',
                dragDrop.dragDropState.value.targetItemId === node.menu.id &&
                  dragDrop.dragDropState.value.isValidTarget &&
                  dragDrop.dragDropState.value.dropMode === 'into' &&
                  'bg-primary/10 ring-primary ring-2',
                dragDrop.highlightedMenuIds.value.has(node.menu.id) && 'bg-warning/20'
              ]"
              :data-dragging="dragDrop.dragDropState.value.draggedItemId === node.menu.id ? 'true' : 'false'"
              :data-drop-mode="
                dragDrop.dragDropState.value.targetItemId === node.menu.id ? dragDrop.dragDropState.value.dropMode : ''
              "
              :data-drop-target="dragDrop.dragDropState.value.targetItemId === node.menu.id ? 'true' : 'false'"
              :data-drop-valid="
                dragDrop.dragDropState.value.targetItemId === node.menu.id ?
                  String(dragDrop.dragDropState.value.isValidTarget)
                : ''
              "
              :data-level="node.level"
              :data-menu-id="node.menu.id"
              :data-parent-id="node.menu.parentId"
              :key="node.menu.id"
              :style="{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                paddingLeft: `${node.level * 20 + 8}px`
              }"
              @dragend="handleDragEnd"
              @dragleave="handleDragLeave"
              @dragover="handleDragOver($event, node.menu)"
              @dragstart="handleDragStart($event, node.menu.id)"
              @drop="handleDrop($event, node.menu)"
              data-testid="menu-row"
              draggable="true"
            >
              <!-- Drag Handle -->
              <button
                class="btn btn-ghost btn-xs cursor-grab p-0 opacity-0 group-hover:opacity-100"
                @mousedown.stop
                data-testid="menu-drag-handle"
                title="拖拽排序"
              >
                <GripVertical :size="14" />
              </button>

              <!-- Expand/Collapse -->
              <button
                class="btn btn-ghost btn-xs p-0"
                :disabled="!node.hasChildren"
                @click="store.toggleExpand(node.menu.id)"
                data-testid="menu-node-toggle"
              >
                <template v-if="node.hasChildren">
                  <ChevronDown
                    v-if="node.isExpanded"
                    :size="16"
                  />
                  <ChevronRight
                    v-else
                    :size="16"
                  />
                </template>
                <span
                  class="w-4"
                  v-else
                />
              </button>

              <!-- Title (editable) -->
              <input
                class="input input-sm flex-1"
                v-if="store.editingId.value === node.menu.id"
                v-model="node.menu.title"
                @blur="handleSave(node.menu)"
                @keydown.enter="handleSave(node.menu)"
                @keydown.escape="
                  node.menu.reset();
                  store.cancelEdit();
                "
                autoFocus
                data-testid="menu-edit-input"
              />
              <span
                class="flex-1 cursor-pointer truncate text-sm"
                v-else
                :class="{
                  'bg-yellow-200 font-semibold':
                    store.searchKeyword.value &&
                    node.menu.title.toLowerCase().includes(store.searchKeyword.value.toLowerCase())
                }"
                @dblclick="store.startEdit(node.menu.id)"
              >
                {{ node.menu.title }}
              </span>

              <!-- Actions -->
              <div class="flex gap-1 opacity-0 group-hover:opacity-100">
                <button
                  class="btn btn-ghost btn-xs"
                  @click="
                    store.setSelectedParentId(node.menu.id);
                    $nextTick(focusMenuTitleInput);
                  "
                  aria-label="添加子菜单"
                  data-testid="menu-add-child"
                >
                  <Plus :size="14" />
                </button>
                <button
                  class="btn btn-ghost btn-xs text-primary"
                  @click="store.startEdit(node.menu.id)"
                  aria-label="编辑"
                  data-testid="menu-edit"
                >
                  <Pen :size="14" />
                </button>
                <button
                  class="btn btn-ghost btn-xs text-error"
                  @click="store.deleteMenu(node.menu)"
                  aria-label="删除"
                  data-testid="menu-delete"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </main>

    <!-- 删除确认对话框 -->
    <dialog
      class="modal modal-open"
      v-if="store.menuToDelete.value"
    >
      <div class="modal-box">
        <h3 class="text-lg font-bold">确认删除</h3>

        <div class="py-4">
          <p class="mb-3">
            确定要删除菜单
            <span class="text-primary font-semibold">"{{ store.menuToDelete.value.title }}"</span>
            吗？
          </p>

          <div
            class="alert alert-warning"
            v-if="store.deleteImpact.value && store.deleteImpact.value.childrenCount > 0"
          >
            <TriangleAlert :size="20" />
            <div class="flex flex-col gap-1 text-sm">
              <p class="font-medium">此操作将级联删除：</p>
              <ul class="ml-4 list-disc">
                <li>{{ store.deleteImpact.value.childrenCount }} 个直接子节点</li>
                <li v-if="store.deleteImpact.value.descendantsCount > store.deleteImpact.value.childrenCount">
                  共 {{ store.deleteImpact.value.descendantsCount }} 个所有后代节点
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="modal-action flex-col gap-2 sm:flex-row">
          <button
            class="btn btn-ghost"
            @click="store.cancelDelete"
            type="button"
          >
            取消
          </button>

          <template v-if="store.deleteImpact.value && store.deleteImpact.value.childrenCount > 0">
            <button
              class="btn btn-warning"
              @click="store.executePromoteChildrenDelete"
              type="button"
            >
              <Trash2 :size="16" />
              删除父节点 (子节点提升)
            </button>
            <button
              class="btn btn-error"
              @click="store.executeCascadeDelete"
              type="button"
            >
              <Trash2 :size="16" />
              级联删除 (删除所有)
            </button>
          </template>
          <button
            class="btn btn-error"
            v-else
            @click="store.executeCascadeDelete"
            type="button"
          >
            <Trash2 :size="16" />
            确认删除
          </button>
        </div>
      </div>
      <form
        class="modal-backdrop"
        @click="store.cancelDelete"
        method="dialog"
      >
        <button
          aria-label="关闭对话框"
          type="button"
        >
          close
        </button>
      </form>
    </dialog>
  </div>
</template>
