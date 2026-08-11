<script lang="ts" setup>
import { FileLarge } from '@aiao/rxdb-test/entities';
import { useRxDB } from '@aiao/rxdb-vue';
import { formatErrorMessage, useToast } from '../../app/composables/useToast';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useObservable } from '@vueuse/rxjs';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  GripVertical,
  History,
  Loader2,
  Pen,
  Plus,
  Redo2,
  Search,
  Trash2,
  TriangleAlert,
  Undo2,
  X
} from '@lucide/vue';
import { computed, ref } from 'vue';
import HistorySidebar from '../../app/components/HistorySidebar.vue';
import { useDragDrop } from '../../app/composables/useDragDrop';
import { useFileManagerLazyStore } from '../../app/composables/useFileManagerLazyStore';
import { getFileIcon } from '../../app/utils/file-icons';
import { pairVirtualRows } from '../../app/utils/virtual-rows';

const rxdb = useRxDB();
const showHistory = ref(true);
const newName = ref('');
const newExtension = ref('txt');
const loadingActions = ref<Set<string>>(new Set());
const isDeleting = ref(false);
const parentRef = ref<HTMLDivElement | null>(null);

const history = computed(() => rxdb.versionManager.history(FileLarge));
const histories = useObservable(history.value.histories$, { initialValue: [] });
const undoCount = useObservable(history.value.undoCount$, { initialValue: 0 });
const redoCount = useObservable(history.value.redoCount$, { initialValue: 0 });

const store = useFileManagerLazyStore(rxdb);

// 拖放验证用 store 已加载节点快照，避免重复订阅全表（lazy 模式 10k 节点会 OOM）。
const dragDrop = useDragDrop<FileLarge>(store.loadedNodes, {
  isFolder: node => node.type === 'folder'
});

// Virtual scroll setup
const virtualizerOptions = computed(() => ({
  count: store.treeNodes.value.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => 36, // 每行高度
  overscan: 10
}));

const virtualizer = useVirtualizer(virtualizerOptions);
const virtualRows = computed(() => pairVirtualRows(store.treeNodes.value, virtualizer.value.getVirtualItems()));

// 扩展名选项
const extensionOptions = [
  { value: 'txt', label: '.txt (文本)' },
  { value: 'md', label: '.md (Markdown)' },
  { value: 'json', label: '.json (JSON)' },
  { value: 'js', label: '.js (JavaScript)' },
  { value: 'ts', label: '.ts (TypeScript)' },
  { value: 'html', label: '.html (HTML)' },
  { value: 'css', label: '.css (CSS)' },
  { value: 'jpg', label: '.jpg (图片)' },
  { value: 'png', label: '.png (图片)' },
  { value: 'pdf', label: '.pdf (PDF)' },
  { value: 'zip', label: '.zip (压缩包)' }
];

const batchAddOptions = [
  { count: 100, label: '100 条' },
  { count: 1000, label: '1000 条' },
  { count: 5000, label: '5000 条' },
  { count: 10000, label: '10000 条' }
];

// 删除所有文件
const handleDeleteAll = async () => {
  isDeleting.value = true;
  try {
    await store.deleteAllFiles();
  } finally {
    isDeleting.value = false;
  }
};

// 批量添加文件
const handleAddMany = async (count: number, actionKey: string) => {
  loadingActions.value.add(actionKey);
  try {
    await store.addManyFiles(count);
  } finally {
    loadingActions.value.delete(actionKey);
  }
};

// 保存编辑
const handleSave = async (file: FileLarge) => {
  await file.save();
  store.cancelEdit();
};

// 添加文件/文件夹
const handleAdd = async () => {
  if (newName.value.trim()) {
    if (store.isAddingFile.value) {
      // 添加文件
      const parentId = store.selectedFolderId.value;
      if (parentId) {
        const parent = store.loadedNodes.value.find(file => file.id === parentId);
        if (parent) {
          await store.addChild(parent, newName.value, 'file', newExtension.value);
        }
      } else {
        await store.addRoot(newName.value, 'file', newExtension.value);
      }
    } else {
      // 添加文件夹
      if (store.selectedFolderId.value) {
        const parent = store.loadedNodes.value.find(file => file.id === store.selectedFolderId.value);
        if (parent) {
          await store.addChild(parent, newName.value, 'folder');
        }
      } else {
        await store.addRoot(newName.value, 'folder');
      }
    }
    newName.value = '';
  }
};

// 拖拽事件处理
const handleDragStart = (e: DragEvent, fileId: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', fileId);
  }
  dragDrop.onDragStart(fileId);
};

const handleDragOver = (e: DragEvent, file: FileLarge) => {
  e.preventDefault();
  const element = e.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  const { isValid } = dragDrop.onDragOver(file, e.clientY, rect);
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

const handleDrop = async (e: DragEvent, file: FileLarge) => {
  e.preventDefault();
  e.stopPropagation();
  try {
    await dragDrop.onDrop(file, folderId => {
      // 展开目标文件夹
      if (!store.expandedIds.value.has(folderId)) {
        store.toggleExpand(folderId);
      }
    });
  } catch (error: unknown) {
    useToast().error(formatErrorMessage('拖放操作失败', error));
  }
};

const handleDragEnd = () => {
  dragDrop.onDragEnd();
};

// 获取图标组件
const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'file-text':
      return FileText;
    case 'file-code':
      return FileCode;
    case 'file-image':
      return FileImage;
    case 'file-video':
      return FileVideo;
    case 'file-audio':
      return FileAudio;
    case 'file-archive':
      return FileArchive;
    default:
      return File;
  }
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

    <main class="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <!-- Header -->
      <div class="border-base-300 bg-base-100 flex-none border-b p-4">
        <div class="mx-auto flex max-w-4xl flex-col gap-3">
          <!-- Title Bar -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold">File Manager - Lazy Load</h1>
              <div
                class="badge badge-warning badge-sm"
                v-if="store.searchKeyword.value"
              >
                搜索: {{ store.matchedFileIds.value.size }} 项
              </div>
              <div
                class="badge badge-primary"
                v-else
                data-testid="file-count"
              >
                {{ store.treeNodes.value.length }} 项 (Visible)
              </div>

              <!-- 批量添加 -->
              <div class="dropdown dropdown-end">
                <button
                  class="btn btn-sm btn-circle"
                  aria-label="批量添加"
                  data-testid="file-batch-add"
                  type="button"
                >
                  <Plus :size="16" />
                </button>
                <ul
                  class="dropdown-content menu bg-base-100 rounded-box z-[1] w-52 p-2 shadow"
                  tabindex="0"
                >
                  <li
                    v-for="option in batchAddOptions"
                    :key="option.count"
                  >
                    <button
                      :data-testid="`file-batch-option-${option.count}`"
                      :disabled="loadingActions.has('add_many')"
                      @click="handleAddMany(option.count, 'add_many')"
                    >
                      <span
                        class="loading loading-spinner loading-xs"
                        v-if="loadingActions.has('add_many')"
                      />
                      添加 {{ option.label }}
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
                  data-testid="file-undo"
                >
                  <Undo2 :size="16" />
                  <span
                    class="badge badge-xs"
                    v-if="undoCount > 0"
                    data-testid="file-undo-count"
                  >
                    {{ undoCount }}
                  </span>
                </button>
                <button
                  class="btn btn-sm join-item"
                  :disabled="redoCount === 0"
                  @click="history.redo()"
                  aria-label="重做"
                  data-testid="file-redo"
                >
                  <Redo2 :size="16" />
                  <span
                    class="badge badge-xs"
                    v-if="redoCount > 0"
                    data-testid="file-redo-count"
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
                data-testid="file-history"
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

            <div class="flex items-center gap-2">
              <button
                class="btn btn-sm btn-error btn-outline"
                :disabled="isDeleting"
                @click="handleDeleteAll"
              >
                <span
                  class="loading loading-spinner loading-xs"
                  v-if="isDeleting"
                />
                <Trash2
                  v-else
                  :size="16"
                />
                删除所有数据
              </button>
            </div>
          </div>

          <!-- 搜索框和排序 -->
          <div class="flex gap-2">
            <div class="relative flex-1">
              <Search
                class="text-base-content/50 absolute top-1/2 left-3 -translate-y-1/2"
                :size="16"
              />
              <input
                class="input input-bordered input-sm w-full pl-10"
                v-model="store.searchKeyword.value"
                data-testid="file-search-input"
                placeholder="搜索文件..."
                type="text"
              />
              <button
                class="btn btn-ghost btn-xs absolute top-1/2 right-2 -translate-y-1/2"
                v-if="store.searchKeyword.value"
                @click="store.clearSearch"
                aria-label="清除搜索"
              >
                <X :size="14" />
              </button>
            </div>

            <!-- 排序下拉框 -->
            <select
              class="select select-bordered select-sm w-32"
              v-model="store.sortMode.value"
            >
              <option value="manual">自由排序</option>
              <option value="name-asc">名称 A→Z</option>
              <option value="name-desc">名称 Z→A</option>
              <option value="type-asc">文件夹优先</option>
              <option value="type-desc">文件优先</option>
              <option value="ext-asc">扩展名 A→Z</option>
              <option value="ext-desc">扩展名 Z→A</option>
              <option value="size-asc">大小 ↑</option>
              <option value="size-desc">大小 ↓</option>
            </select>
          </div>

          <!-- 添加文件/文件夹表单 -->
          <div class="flex flex-col gap-2">
            <!-- 父文件夹选择提示 -->
            <div
              class="bg-info/10 flex items-center gap-2 rounded px-3 py-1 text-sm"
              v-if="store.selectedFolderId.value"
            >
              <Folder
                class="text-info"
                :size="14"
              />
              <span class="flex-1">
                将添加到:
                <span class="font-semibold">{{ store.getSelectedFolderName() }}</span>
              </span>
              <button
                class="btn btn-ghost btn-xs"
                @click="store.cancelSelectFolder"
                aria-label="取消选择"
              >
                <X :size="14" />
              </button>
            </div>

            <form
              class="flex gap-2"
              @submit.prevent="handleAdd"
            >
              <!-- 文件/文件夹模式切换 -->
              <button
                class="btn btn-sm"
                :class="store.isAddingFile.value ? 'btn-info' : 'btn-warning'"
                @click="store.toggleAddingMode"
                aria-label="切换模式"
                data-testid="file-mode-toggle"
                type="button"
              >
                <File
                  v-if="store.isAddingFile.value"
                  :size="16"
                />
                <Folder
                  v-else
                  :size="16"
                />
                {{ store.isAddingFile.value ? '文件' : '文件夹' }}
              </button>

              <!-- 扩展名选择器 (仅文件模式) -->
              <select
                class="select select-bordered select-sm w-24"
                v-if="store.isAddingFile.value"
                v-model="newExtension"
              >
                <option
                  v-for="opt in extensionOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>

              <input
                class="input input-bordered input-sm flex-1"
                v-model="newName"
                :placeholder="
                  store.isAddingFile.value ?
                    '添加文件' + (store.selectedFolderId.value ? '' : ' (根目录)') + '...'
                  : '添加文件夹' + (store.selectedFolderId.value ? '' : ' (根目录)') + '...'
                "
                data-testid="file-name-input"
                type="text"
              />

              <button
                class="btn btn-neutral btn-sm"
                :disabled="!newName.trim() || (store.isAddingFile.value && !newExtension)"
                data-testid="file-submit"
                type="submit"
              >
                <Plus :size="16" />
                添加
              </button>
            </form>
          </div>
        </div>
      </div>

      <!-- Tree List (Virtual) -->
      <div
        class="flex-1 overflow-auto p-4"
        ref="parentRef"
      >
        <div class="mx-auto max-w-4xl">
          <div
            class="hero min-h-40"
            v-if="store.treeNodes.value.length === 0"
          >
            <div class="hero-content text-center">
              <h1 class="text-sm font-bold">暂无文件数据</h1>
            </div>
          </div>
          <div
            class="relative w-full"
            v-else
            :style="{ height: `${virtualizer.getTotalSize()}px` }"
          >
            <div
              class="absolute top-0 left-0 w-full"
              v-for="{ item: node, virtualItem: virtualRow } in virtualRows"
              :key="node.file.id"
              :style="{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }"
            >
              <div
                class="group flex h-full items-center gap-2 rounded px-2 py-1 transition-colors"
                :class="[
                  dragDrop.dragDropState.value.draggedItemId !== node.file.id && 'hover:bg-base-200',
                  dragDrop.dragDropState.value.draggedItemId === node.file.id && 'cursor-move opacity-50',
                  dragDrop.dragDropState.value.targetItemId === node.file.id &&
                    !dragDrop.dragDropState.value.isValidTarget &&
                    'ring-error ring-2',
                  dragDrop.dragDropState.value.targetItemId === node.file.id &&
                    dragDrop.dragDropState.value.isValidTarget &&
                    dragDrop.dragDropState.value.dropMode === 'before' &&
                    'border-t-primary border-t-2',
                  dragDrop.dragDropState.value.targetItemId === node.file.id &&
                    dragDrop.dragDropState.value.isValidTarget &&
                    dragDrop.dragDropState.value.dropMode === 'after' &&
                    'border-b-primary border-b-2',
                  dragDrop.dragDropState.value.targetItemId === node.file.id &&
                    dragDrop.dragDropState.value.isValidTarget &&
                    dragDrop.dragDropState.value.dropMode === 'into' &&
                    'bg-primary/10 ring-primary ring-2',
                  store.selectedFolderId.value === node.file.id && 'outline-primary outline outline-2'
                ]"
                :data-file-id="node.file.id"
                :data-level="node.level"
                :data-parent-id="node.file.parentId"
                :style="{ paddingLeft: `${node.level * 20 + 8}px` }"
                @dragend="handleDragEnd"
                @dragleave="handleDragLeave"
                @dragover="handleDragOver($event, node.file)"
                @dragstart="handleDragStart($event, node.file.id)"
                @drop="handleDrop($event, node.file)"
                data-testid="file-row"
                draggable="true"
              >
                <!-- Drag Handle -->
                <button
                  class="btn btn-ghost btn-xs cursor-grab p-0 opacity-0 group-hover:opacity-100"
                  @mousedown.stop
                  title="拖拽排序"
                >
                  <GripVertical :size="14" />
                </button>

                <!-- Expand/Collapse -->
                <button
                  class="btn btn-ghost btn-xs p-0"
                  :disabled="node.file.type !== 'folder' || !node.hasChildren"
                  @click="store.toggleExpand(node.file.id)"
                  data-testid="file-node-toggle"
                >
                  <template v-if="node.isLoading">
                    <Loader2
                      class="animate-spin"
                      :size="16"
                    />
                  </template>
                  <template v-else-if="node.file.type === 'folder' && node.hasChildren">
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

                <!-- Icon -->
                <span class="text-base-content/70">
                  <template v-if="node.file.type === 'folder'">
                    <FolderOpen
                      class="text-warning"
                      v-if="node.isExpanded"
                      :size="18"
                    />
                    <Folder
                      class="text-warning"
                      v-else
                      :size="18"
                    />
                  </template>
                  <template v-else>
                    <component
                      :class="{
                        'text-info': getFileIcon('file', node.file.extension) === 'file-text',
                        'text-success': getFileIcon('file', node.file.extension) === 'file-code',
                        'text-secondary': getFileIcon('file', node.file.extension) === 'file-image',
                        'text-error': getFileIcon('file', node.file.extension) === 'file-video',
                        'text-accent': getFileIcon('file', node.file.extension) === 'file-audio',
                        'text-warning': getFileIcon('file', node.file.extension) === 'file-archive',
                        'text-base-content/50': getFileIcon('file', node.file.extension) === 'file'
                      }"
                      :is="getIconComponent(getFileIcon('file', node.file.extension))"
                      :size="18"
                    />
                  </template>
                </span>

                <!-- Name (editable) -->
                <input
                  class="input input-bordered input-sm flex-1"
                  v-if="store.editingId.value === node.file.id"
                  v-model="node.file.name"
                  @blur="handleSave(node.file)"
                  @keydown.enter="handleSave(node.file)"
                  @keydown.escape="store.cancelEdit()"
                  autoFocus
                  data-testid="file-edit-input"
                />
                <span
                  class="flex-1 truncate"
                  v-else
                  :class="[
                    node.isMatched && 'rounded bg-yellow-200 px-1',
                    node.file.type === 'folder' && 'cursor-pointer',
                    store.selectedFolderId.value === node.file.id && 'text-primary font-semibold'
                  ]"
                  @click="node.file.type === 'folder' ? store.selectFolder(node.file.id) : undefined"
                >
                  {{ node.file.name }}
                  <template v-if="node.file.type === 'file' && node.file.extension">
                    .{{ node.file.extension }}
                  </template>
                  <span
                    class="text-base-content/50 ml-2 text-xs"
                    v-if="node.file.type === 'file' && node.file.size"
                  >
                    ({{ ((node.file.size ?? 0) / 1024).toFixed(1) }} KB)
                  </span>
                </span>

                <!-- Actions -->
                <div class="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    class="btn btn-ghost btn-xs"
                    v-if="node.file.type === 'folder'"
                    @click="store.selectFolder(node.file.id)"
                    aria-label="添加子项"
                    data-testid="file-select-parent"
                    title="选择为父文件夹"
                  >
                    <Plus :size="14" />
                  </button>
                  <button
                    class="btn btn-ghost btn-xs text-primary"
                    @click="store.startEdit(node.file.id)"
                    aria-label="编辑"
                    data-testid="file-edit"
                  >
                    <Pen :size="14" />
                  </button>
                  <button
                    class="btn btn-ghost btn-xs text-error"
                    @click="store.showDeleteDialog(node.file)"
                    aria-label="删除"
                    data-testid="file-delete"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 删除确认对话框 -->
    <dialog
      class="modal modal-open"
      v-if="store.fileToDelete.value"
    >
      <div class="modal-box">
        <h3 class="text-lg font-bold">确认删除</h3>

        <div class="py-4">
          <p class="mb-3">
            确定要删除
            <span class="text-primary font-semibold">
              "{{ store.fileToDelete.value.name
              }}{{ store.fileToDelete.value.extension ? '.' + store.fileToDelete.value.extension : '' }}"
            </span>
            吗？
          </p>

          <div
            class="alert alert-warning"
            v-if="store.deleteImpact.value.childrenCount > 0"
          >
            <TriangleAlert :size="20" />
            <div class="flex flex-col gap-1 text-sm">
              <p class="font-medium">此操作将级联删除：</p>
              <ul class="ml-4 list-disc">
                <li>{{ store.deleteImpact.value.childrenCount }} 个直接子项</li>
                <li v-if="store.deleteImpact.value.descendantsCount > store.deleteImpact.value.childrenCount">
                  共 {{ store.deleteImpact.value.descendantsCount }} 个所有后代节点
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="modal-action">
          <button
            class="btn btn-ghost"
            @click="store.cancelDelete"
            type="button"
          >
            取消
          </button>
          <button
            class="btn btn-error"
            @click="store.executeCascadeDelete"
            type="button"
          >
            <Trash2 :size="16" />
            {{ store.deleteImpact.value.childrenCount > 0 ? '级联删除' : '确认删除' }}
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
