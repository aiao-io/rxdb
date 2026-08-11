<script lang="ts" setup>
/**
 * OPFS 文件管理页面 - Vue
 */
import { checkOPFSAvailable, OpfsRouteSync } from '@aiao/utils';
import {
  AlertTriangle,
  ChevronRight,
  Edit3,
  Eye,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid3X3,
  Home,
  List,
  RefreshCw,
  Trash2,
  Upload,
  X
} from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import OpfsFileGrid from './components/OpfsFileGrid.vue';
import OpfsFileList from './components/OpfsFileList.vue';
import OpfsFilePreview from './components/OpfsFilePreview.vue';
import { useOpfsService } from './composables/useOpfsService';
import { formatFileSize, type OPFSFileEntry } from './utils/opfs-utils';
import { readDirectoryEntries } from '../../app/utils/read-directory-entries';

type ViewMode = 'list' | 'grid';

const opfs = useOpfsService();
const router = useRouter();
const route = useRoute();

const opfsAvailable = ref(false);
const viewMode = ref<ViewMode>(getStoredViewMode());
const previewEntry = ref<OPFSFileEntry | null>(null);
const newFolderName = ref('');
const showNewFolder = ref(false);
const isDragging = ref(false);
const selectedPaths = ref<Set<string>>(new Set());
const lastSelectedPath = ref<string | null>(null);

const deleteConfirm = ref<{ show: boolean; entry: OPFSFileEntry | null; resolve?: (v: boolean) => void }>({
  show: false,
  entry: null
});
const renameDialog = ref<{ show: boolean; entry: OPFSFileEntry | null; newName: string }>({
  show: false,
  entry: null,
  newName: ''
});
const overwriteConfirm = ref<{
  show: boolean;
  file: File | null;
  existingEntry: OPFSFileEntry | null;
  resolve?: (v: boolean) => void;
}>({ show: false, file: null, existingEntry: null });
const contextMenu = ref<{ show: boolean; x: number; y: number; entry: OPFSFileEntry | null }>({
  show: false,
  x: 0,
  y: 0,
  entry: null
});
const toast = ref<{ show: boolean; message: string; type: 'error' | 'success' | 'info' }>({
  show: false,
  message: '',
  type: 'info'
});
const selectionBox = ref<{
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
} | null>(null);

const fileInputRef = ref<HTMLInputElement | null>(null);
const folderInputRef = ref<HTMLInputElement | null>(null);
const gridContainerRef = ref<HTMLDivElement | null>(null);

const routeSync = new OpfsRouteSync();
const routeSyncReady = ref(false);
let mouseMoveListener: ((e: MouseEvent) => void) | null = null;
let mouseUpListener: (() => void) | null = null;

// Computed
const dirCount = computed(() => opfs.entries.value.filter(e => e.kind === 'directory').length);
const fileCount = computed(() => opfs.entries.value.filter(e => e.kind === 'file').length);
const pathSegments = computed(() => {
  const path = opfs.currentPath.value;
  if (!path || path === '/') return [];
  return path
    .split('/')
    .filter(Boolean)
    .map((segment, index, arr) => ({
      name: segment,
      path: '/' + arr.slice(0, index + 1).join('/') + '/'
    }));
});

// Init
onMounted(async () => {
  const available = await checkOPFSAvailable();
  opfsAvailable.value = available;
});

watch([opfsAvailable, () => route.params.opfsPath], ([available, routeParam]) => {
  const routePath = normalizeRoutePath(routeParam);
  void routeSync
    .sync(available, routePath, () => opfs.currentPath.value, {
      init: opfs.init,
      navigateTo: opfs.navigateTo
    })
    .then(() => {
      routeSyncReady.value = true;
    });
});

watch(
  () => opfs.currentPath.value,
  path => {
    if (!routeSyncReady.value) return;
    const url = buildUrlFromPath(path);
    if (url !== route.fullPath) void router.push(url);
  }
);

// Persist view mode
watch(viewMode, mode => {
  localStorage.setItem('opfs-view-mode', mode);
});

onUnmounted(() => {
  if (mouseMoveListener) window.removeEventListener('mousemove', mouseMoveListener);
  if (mouseUpListener) window.removeEventListener('mouseup', mouseUpListener);
  opfs.reset();
});

function getStoredViewMode(): ViewMode {
  const stored = localStorage.getItem('opfs-view-mode');
  return stored === 'grid' || stored === 'list' ? stored : 'list';
}

function normalizeRoutePath(path: string | string[] | undefined): string {
  const p = Array.isArray(path) ? path.join('/') : path;
  if (!p || p === '/') return '/';
  const withLeading = p.startsWith('/') ? p : `/${p}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function buildUrlFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/opfs';
  const pathStr = segments.map(s => encodeURIComponent(s)).join('/');
  return `/opfs/${pathStr}`;
}

function showToastMsg(message: string, type: 'error' | 'success' | 'info' = 'info') {
  toast.value = { show: true, message, type };
  setTimeout(() => {
    toast.value = { show: false, message: '', type: 'info' };
  }, 3000);
}

// Handlers
function handleNavigate(entry: OPFSFileEntry) {
  if (entry.kind === 'directory') opfs.navigateTo(entry.path);
}

async function handleDownload(entry: OPFSFileEntry) {
  if (entry.kind === 'file') await opfs.downloadFile(entry);
}

async function handleDelete(entry: OPFSFileEntry) {
  const shouldDelete = await new Promise<boolean>(resolve => {
    deleteConfirm.value = { show: true, entry, resolve };
  });
  if (shouldDelete) {
    const result = await opfs.deleteEntry(entry);
    if (!result) showToastMsg(`删除失败: ${entry.name}`, 'error');
  }
}

function handleDeleteResponse(confirm: boolean) {
  if (deleteConfirm.value.resolve) deleteConfirm.value.resolve(confirm);
  deleteConfirm.value = { show: false, entry: null };
}

async function handleUpload(files?: File[]) {
  const filesToUpload = files || (fileInputRef.value?.files ? Array.from(fileInputRef.value.files) : null);
  if (!filesToUpload || filesToUpload.length === 0) return;

  for (const file of filesToUpload) {
    const existingFile = opfs.entries.value.find(e => e.kind === 'file' && e.name === file.name);
    if (existingFile) {
      const shouldOverwrite = await new Promise<boolean>(resolve => {
        overwriteConfirm.value = { show: true, file, existingEntry: existingFile, resolve };
      });
      if (!shouldOverwrite) continue;
    }
    await opfs.uploadFile(file);
  }
  if (fileInputRef.value) fileInputRef.value.value = '';
}

async function handleUploadFolder(files: File[]) {
  if (files.length === 0) return;
  showToastMsg(`正在上传文件夹，共 ${files.length} 个文件...`, 'info');

  let successCount = 0;
  let failedCount = 0;
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    const success = await opfs.uploadFileWithPath(file, relativePath);
    if (success) successCount++;
    else failedCount++;
  }
  await opfs.refresh();
  if (failedCount > 0) showToastMsg(`上传完成：${successCount} 成功，${failedCount} 失败`, 'error');
  else showToastMsg(`成功上传 ${successCount} 个文件`, 'success');
}

function handleOverwriteResponse(confirm: boolean) {
  if (overwriteConfirm.value.resolve) overwriteConfirm.value.resolve(confirm);
  overwriteConfirm.value = { show: false, file: null, existingEntry: null };
}

async function handleCreateFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  const success = await opfs.createDirectory(name);
  if (success) {
    showNewFolder.value = false;
    newFolderName.value = '';
  }
}

async function handleRename() {
  if (!renameDialog.value.entry || !renameDialog.value.newName.trim()) return;
  const success = await opfs.renameEntry(renameDialog.value.entry, renameDialog.value.newName.trim());
  if (success) renameDialog.value = { show: false, entry: null, newName: '' };
}

async function handleBatchDelete() {
  if (selectedPaths.value.size === 0) return;
  const entriesToDelete = opfs.entries.value.filter(e => selectedPaths.value.has(e.path));
  const shouldDelete = await new Promise<boolean>(resolve => {
    const virtualEntry: OPFSFileEntry = {
      name: `${selectedPaths.value.size} 个项目`,
      kind: 'file',
      handle: {} as FileSystemFileHandle,
      path: ''
    };
    deleteConfirm.value = { show: true, entry: virtualEntry, resolve };
  });

  if (shouldDelete) {
    let failedCount = 0;
    for (const entry of entriesToDelete) {
      const result = await opfs.deleteEntry(entry);
      if (!result) failedCount++;
    }
    if (failedCount > 0) showToastMsg(`${failedCount} 个项目删除失败`, 'error');
    else showToastMsg(`成功删除 ${entriesToDelete.length} 个项目`, 'success');
    selectedPaths.value = new Set();
    lastSelectedPath.value = null;
  }
}

function handleEntryClick(payload: { entry: OPFSFileEntry; event: MouseEvent }) {
  const { entry, event } = payload;
  if (event.ctrlKey || event.metaKey) {
    const next = new Set(selectedPaths.value);
    if (next.has(entry.path)) next.delete(entry.path);
    else next.add(entry.path);
    selectedPaths.value = next;
    lastSelectedPath.value = entry.path;
  } else if (event.shiftKey && lastSelectedPath.value) {
    const entries = opfs.entries.value;
    const startIndex = entries.findIndex(e => e.path === lastSelectedPath.value);
    const endIndex = entries.findIndex(e => e.path === entry.path);
    if (startIndex !== -1 && endIndex !== -1) {
      const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
      const next = new Set(selectedPaths.value);
      for (let i = start; i <= end; i++) next.add(entries[i].path);
      selectedPaths.value = next;
    }
  } else {
    selectedPaths.value = new Set([entry.path]);
    lastSelectedPath.value = entry.path;
  }
}

function handleContextMenu(payload: { event: MouseEvent; entry: OPFSFileEntry }) {
  payload.event.preventDefault();
  contextMenu.value = { show: true, x: payload.event.clientX, y: payload.event.clientY, entry: payload.entry };
}

function closeContextMenu() {
  contextMenu.value = { show: false, x: 0, y: 0, entry: null };
}

async function handleContextMenuAction(action: 'view' | 'rename' | 'delete') {
  const entry = contextMenu.value.entry;
  closeContextMenu();
  if (!entry) return;

  switch (action) {
    case 'view':
      if (entry.kind === 'file') previewEntry.value = entry;
      else handleNavigate(entry);
      break;
    case 'rename':
      renameDialog.value = { show: true, entry, newName: entry.name };
      break;
    case 'delete':
      await handleDelete(entry);
      break;
  }
}

async function handleDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;
  if (!event.dataTransfer) return;

  const items = event.dataTransfer.items;
  if (items) {
    const entries: File[] = [];
    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry) promises.push(traverseFileTree(entry, '', entries));
      }
    }
    await Promise.all(promises);
    if (entries.length > 0) {
      const hasFolder = entries.some(f => f.webkitRelativePath?.includes('/'));
      if (hasFolder) await handleUploadFolder(entries);
      else await handleUpload(entries);
    }
  } else if (event.dataTransfer.files) {
    await handleUpload(Array.from(event.dataTransfer.files));
  }
}

function handleMouseDown(event: MouseEvent) {
  if (viewMode.value !== 'grid' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target as HTMLElement;
  if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) return;

  const container = gridContainerRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const startX = event.clientX - rect.left;
  const startY = event.clientY - rect.top;
  selectionBox.value = { active: true, startX, startY, currentX: startX, currentY: startY };

  mouseMoveListener = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    selectionBox.value = { active: true, startX, startY, currentX, currentY };

    const boxLeft = Math.min(startX, currentX) + rect.left;
    const boxTop = Math.min(startY, currentY) + rect.top;
    const boxRight = Math.max(startX, currentX) + rect.left;
    const boxBottom = Math.max(startY, currentY) + rect.top;

    const selected = new Set<string>();
    container.querySelectorAll('[data-entry-path]').forEach(item => {
      const itemRect = item.getBoundingClientRect();
      const intersects = !(
        itemRect.right < boxLeft ||
        itemRect.left > boxRight ||
        itemRect.bottom < boxTop ||
        itemRect.top > boxBottom
      );
      if (intersects) {
        const path = item.getAttribute('data-entry-path');
        if (path) selected.add(path);
      }
    });
    selectedPaths.value = selected;
  };

  mouseUpListener = () => {
    selectionBox.value = null;
    if (mouseMoveListener) {
      window.removeEventListener('mousemove', mouseMoveListener);
      mouseMoveListener = null;
    }
    if (mouseUpListener) {
      window.removeEventListener('mouseup', mouseUpListener);
      mouseUpListener = null;
    }
  };

  window.addEventListener('mousemove', mouseMoveListener);
  window.addEventListener('mouseup', mouseUpListener);
}

async function traverseFileTree(item: FileSystemEntry, path: string, files: File[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (item.isFile) {
      (item as FileSystemFileEntry).file((file: File) => {
        Object.defineProperty(file, 'webkitRelativePath', { value: path + file.name, writable: false });
        files.push(file);
        resolve();
      }, reject);
    } else if (item.isDirectory) {
      const dirReader = (item as FileSystemDirectoryEntry).createReader();
      void readDirectoryEntries(dirReader)
        .then(async entries => {
          await Promise.all(entries.map(entry => traverseFileTree(entry, path + item.name + '/', files)));
          resolve();
        })
        .catch(reject);
    } else {
      resolve();
    }
  });
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="border-base-300 flex items-center justify-between border-b px-3 py-2">
      <div class="flex items-center gap-3">
        <span class="text-sm font-bold">OPFS 文件管理</span>
        <div class="flex items-center gap-1.5">
          <div
            class="h-2 w-2 rounded-full"
            :class="opfsAvailable ? 'bg-success' : 'bg-error'"
          />
          <span class="text-base-content/60 text-xs">{{ opfsAvailable ? '已连接' : '未连接' }}</span>
        </div>
      </div>
      <div
        class="tabs tabs-boxed tabs-xs"
        role="tablist"
      >
        <button
          class="tab gap-1"
          :class="{ 'tab-active': viewMode === 'list' }"
          @click="viewMode = 'list'"
          role="tab"
        >
          <List :size="12" /> List
        </button>
        <button
          class="tab gap-1"
          :class="{ 'tab-active': viewMode === 'grid' }"
          @click="viewMode = 'grid'"
          role="tab"
        >
          <Grid3X3 :size="12" /> Grid
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="border-base-300 flex items-center gap-2 border-b p-2">
      <button
        class="btn btn-xs btn-ghost"
        @click="opfs.navigateTo('/')"
        title="根目录"
      >
        <Home :size="16" />
      </button>
      <button
        class="btn btn-xs btn-ghost"
        @click="opfs.refresh()"
        title="刷新"
      >
        <RefreshCw
          :class="{ 'animate-spin': opfs.loading.value }"
          :size="16"
        />
      </button>
      <div class="divider divider-horizontal m-0" />
      <button
        class="btn btn-xs btn-primary"
        @click="fileInputRef?.click()"
      >
        <Upload :size="16" /> 上传文件
      </button>
      <button
        class="btn btn-xs btn-primary"
        @click="folderInputRef?.click()"
      >
        <Folder :size="16" /> 上传文件夹
      </button>
      <button
        class="btn btn-xs btn-secondary"
        @click="showNewFolder = true"
      >
        <FolderPlus :size="16" /> 新建文件夹
      </button>
      <template v-if="selectedPaths.size > 0">
        <div class="divider divider-horizontal m-0" />
        <span class="text-base-content/60 text-xs">已选择 {{ selectedPaths.size }} 项</span>
        <button
          class="btn btn-xs btn-ghost"
          @click="
            selectedPaths = new Set();
            lastSelectedPath = null;
          "
          title="取消选择"
        >
          <X :size="14" />
        </button>
        <button
          class="btn btn-xs btn-error"
          @click="handleBatchDelete"
          title="批量删除"
        >
          <Trash2 :size="16" /> 删除
        </button>
      </template>
    </div>

    <!-- Breadcrumb -->
    <div class="border-base-300 flex items-center gap-1 border-b px-3 py-2 text-sm">
      <button
        class="hover:underline"
        @click="opfs.navigateTo('/')"
      >
        根目录
      </button>
      <div
        class="flex items-center gap-1"
        v-for="segment in pathSegments"
        :key="segment.path"
      >
        <ChevronRight
          class="text-base-content/40"
          :size="14"
        />
        <button
          class="hover:underline"
          @click="opfs.navigateTo(segment.path)"
        >
          {{ segment.name }}
        </button>
      </div>
    </div>

    <!-- File list/grid -->
    <div
      class="relative flex-1 overflow-auto"
      @dragenter.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @dragover.prevent
      @drop="handleDrop"
      @mousedown="handleMouseDown"
      ref="gridContainerRef"
    >
      <OpfsFileList
        v-if="viewMode === 'list'"
        :current-path="opfs.currentPath.value"
        :entries="opfs.entries.value"
        :selected-paths="selectedPaths"
        @context-menu="handleContextMenu"
        @delete="handleDelete"
        @download="handleDownload"
        @entry-click="handleEntryClick"
        @navigate="handleNavigate"
        @preview="previewEntry = $event"
      />
      <OpfsFileGrid
        v-else
        :current-path="opfs.currentPath.value"
        :entries="opfs.entries.value"
        :selected-paths="selectedPaths"
        @context-menu="handleContextMenu"
        @delete="handleDelete"
        @download="handleDownload"
        @entry-click="handleEntryClick"
        @navigate="handleNavigate"
        @preview="previewEntry = $event"
      />

      <!-- Selection box -->
      <div
        class="border-primary bg-primary/10 pointer-events-none absolute border-2"
        v-if="selectionBox?.active"
        :style="{
          left: Math.min(selectionBox.startX, selectionBox.currentX) + 'px',
          top: Math.min(selectionBox.startY, selectionBox.currentY) + 'px',
          width: Math.abs(selectionBox.currentX - selectionBox.startX) + 'px',
          height: Math.abs(selectionBox.currentY - selectionBox.startY) + 'px'
        }"
      />

      <!-- Drag overlay -->
      <div
        class="bg-primary/10 border-primary pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed"
        v-if="isDragging"
      >
        <div class="bg-base-100 rounded-lg p-8 shadow-lg">
          <Upload
            class="text-primary mx-auto mb-2"
            :size="48"
          />
          <p class="text-primary text-lg font-semibold">拖放文件到这里上传</p>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="border-base-300 text-base-content/60 flex items-center gap-4 border-t px-3 py-1 text-xs">
      <span>{{ opfs.entries.value.length }} 项 ({{ dirCount }} 个文件夹, {{ fileCount }} 个文件)</span>
    </div>

    <!-- Preview -->
    <OpfsFilePreview
      :entry="previewEntry"
      @close="previewEntry = null"
    />

    <!-- New folder dialog -->
    <div
      class="modal modal-open"
      v-if="showNewFolder"
      @click="showNewFolder = false"
    >
      <div
        class="modal-box"
        @click.stop
      >
        <h3 class="mb-4 text-base font-bold">新建文件夹</h3>
        <input
          class="input input-bordered w-full"
          v-model="newFolderName"
          @keydown.enter="handleCreateFolder"
          placeholder="文件夹名称"
          type="text"
        />
        <div class="modal-action">
          <button
            class="btn btn-sm"
            @click="showNewFolder = false"
          >
            取消
          </button>
          <button
            class="btn btn-sm btn-primary"
            @click="handleCreateFolder"
          >
            创建
          </button>
        </div>
      </div>
    </div>

    <!-- Overwrite confirm -->
    <div
      class="modal modal-open"
      v-if="overwriteConfirm.show && overwriteConfirm.file && overwriteConfirm.existingEntry"
      @click="handleOverwriteResponse(false)"
    >
      <div
        class="modal-box"
        @click.stop
      >
        <h3 class="mb-4 flex items-center gap-2 text-base font-bold">
          <AlertTriangle
            class="text-warning"
            :size="18"
          />
          文件已存在
        </h3>
        <p class="mb-4">
          文件 <span class="font-semibold">{{ overwriteConfirm.file.name }}</span> 已存在，是否覆盖？
        </p>
        <div class="bg-base-200 mb-4 space-y-2 rounded-lg p-3">
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">现有文件:</span>
            <span class="font-mono">{{ formatFileSize(overwriteConfirm.existingEntry.size || 0) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">新文件:</span>
            <span class="font-mono">{{ formatFileSize(overwriteConfirm.file.size) }}</span>
          </div>
        </div>
        <div class="modal-action">
          <button
            class="btn btn-sm"
            @click="handleOverwriteResponse(false)"
          >
            取消
          </button>
          <button
            class="btn btn-sm btn-warning"
            @click="handleOverwriteResponse(true)"
          >
            覆盖
          </button>
        </div>
      </div>
    </div>

    <!-- Context menu -->
    <div
      class="menu border-base-content/10 bg-base-300/95 fixed z-50 w-40 rounded-lg border p-1.5 text-sm shadow-2xl"
      v-if="contextMenu.show && contextMenu.entry"
      :style="{
        left: contextMenu.x + 'px',
        top: contextMenu.y + 'px',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)'
      }"
      @click.stop
    >
      <li>
        <a
          class="gap-2 px-2 py-1.5"
          @click="handleContextMenuAction('view')"
        >
          <Eye
            v-if="contextMenu.entry.kind === 'file'"
            :size="14"
          />
          <FolderOpen
            v-else
            :size="14"
          />
          <span>{{ contextMenu.entry.kind === 'file' ? '查看' : '打开' }}</span>
        </a>
      </li>
      <li>
        <a
          class="gap-2 px-2 py-1.5"
          @click="handleContextMenuAction('rename')"
        >
          <Edit3 :size="14" />
          <span>重命名</span>
        </a>
      </li>
      <li>
        <a
          class="text-error gap-2 px-2 py-1.5"
          @click="handleContextMenuAction('delete')"
        >
          <Trash2 :size="14" />
          <span>删除</span>
        </a>
      </li>
    </div>

    <!-- Delete confirm -->
    <div
      class="modal modal-open"
      v-if="deleteConfirm.show && deleteConfirm.entry"
      @click="handleDeleteResponse(false)"
    >
      <div
        class="modal-box"
        @click.stop
      >
        <h3 class="mb-4 flex items-center gap-2 text-base font-bold">
          <Trash2
            class="text-error"
            :size="18"
          />
          确认删除
        </h3>
        <p class="mb-4">
          确定要删除
          <span class="font-semibold">{{ deleteConfirm.entry.kind === 'file' ? '文件' : '文件夹' }}</span>
          <span class="text-error font-semibold">{{ deleteConfirm.entry.name }}</span>
          吗？
        </p>
        <p
          class="text-warning mb-4 flex items-center gap-1 text-sm"
          v-if="deleteConfirm.entry.kind === 'directory'"
        >
          <AlertTriangle :size="16" /> 此操作将删除文件夹及其所有内容
        </p>
        <div class="modal-action">
          <button
            class="btn btn-sm"
            @click="handleDeleteResponse(false)"
          >
            取消
          </button>
          <button
            class="btn btn-sm btn-error"
            @click="handleDeleteResponse(true)"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- Rename dialog -->
    <div
      class="modal modal-open"
      v-if="renameDialog.show && renameDialog.entry"
      @click="renameDialog = { show: false, entry: null, newName: '' }"
    >
      <div
        class="modal-box"
        @click.stop
      >
        <h3 class="mb-4 text-base font-bold">重命名{{ renameDialog.entry.kind === 'file' ? '文件' : '文件夹' }}</h3>
        <input
          class="input input-bordered w-full"
          v-model="renameDialog.newName"
          :placeholder="renameDialog.entry.kind === 'file' ? '文件名' : '文件夹名'"
          @keydown.enter="handleRename"
          type="text"
        />
        <div class="modal-action">
          <button
            class="btn btn-sm"
            @click="renameDialog = { show: false, entry: null, newName: '' }"
          >
            取消
          </button>
          <button
            class="btn btn-sm btn-primary"
            @click="handleRename"
          >
            确定
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div
      class="toast toast-top toast-end"
      v-if="toast.show"
    >
      <div
        class="alert"
        :class="{
          'alert-error': toast.type === 'error',
          'alert-success': toast.type === 'success',
          'alert-info': toast.type === 'info'
        }"
      >
        <span>{{ toast.message }}</span>
        <button
          class="btn btn-sm btn-ghost"
          @click="toast = { show: false, message: '', type: 'info' }"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- Hidden inputs -->
    <input
      class="hidden"
      @change="fileInputRef?.files && handleUpload(Array.from(fileInputRef.files))"
      multiple
      ref="fileInputRef"
      type="file"
    />
    <input
      class="hidden"
      @change="folderInputRef?.files && handleUploadFolder(Array.from(folderInputRef.files))"
      directory
      ref="folderInputRef"
      type="file"
      webkitdirectory
    />
  </div>
</template>
