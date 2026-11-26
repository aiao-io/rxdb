<script lang="ts" setup>
import {
  orderFileEntries,
  formatFileSize,
  type FileDeleteTarget,
  type FileMessage,
  fileMessage,
  renderFileMessage
} from '@modules/demo-i18n/files';
import { useI18n } from '@aiao/rxdb-i18n-vue';
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
import { readDirectoryEntries } from '../../app/utils/read-directory-entries';
import OpfsFileGrid from './components/OpfsFileGrid.vue';
import OpfsFileList from './components/OpfsFileList.vue';
import OpfsFilePreview from './components/OpfsFilePreview.vue';
import { useOpfsService } from './composables/useOpfsService';
import { type OPFSFileEntry } from './utils/opfs-utils';

const { t, locale } = useI18n();

type ViewMode = 'list' | 'grid';

const opfs = useOpfsService();
const orderedEntries = computed(() => orderFileEntries(opfs.entries.value, locale.value));
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

const deleteConfirm = ref<{
  show: boolean;
  target: FileDeleteTarget<OPFSFileEntry> | null;
  resolve?: (v: boolean) => void;
}>({
  show: false,
  target: null
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
const toast = ref<{ show: boolean; message: string | FileMessage; type: 'error' | 'success' | 'info' }>({
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
const dirCount = computed(() => orderedEntries.value.filter(e => e.kind === 'directory').length);
const fileCount = computed(() => orderedEntries.value.filter(e => e.kind === 'file').length);
/**
 * RV-037：URL 对应的目标目录，与 `opfs.currentPath` 分开算。
 *
 * @remarks
 * 目录切换时路由参数先同步更新，`opfs.currentPath` / 内部的 `currentHandle` 要等
 * 异步读取完成才追上；上传、建目录这些写操作如果直接拿 `currentPath`，在目录切换
 * 未完成的窗口期就会静默写进上一个目录。改成显式传这个路由派生值，和 Angular 的
 * `routePath` signal、React 的同名变量同一处理。
 */
const routePath = computed(() => normalizeRoutePath(route.params.opfsPath));
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

function showToastMsg(message: string | FileMessage, type: 'error' | 'success' | 'info' = 'info') {
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
    deleteConfirm.value = { show: true, target: { type: 'single', entry }, resolve };
  });
  if (shouldDelete) {
    const result = await opfs.deleteEntry(entry);
    if (!result) showToastMsg(fileMessage('file.deleteFailed', { detail: entry.name }), 'error');
  }
}

function handleDeleteResponse(confirm: boolean) {
  if (deleteConfirm.value.resolve) deleteConfirm.value.resolve(confirm);
  deleteConfirm.value = { show: false, target: null };
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
    // RV-037：显式传 routePath（URL 的目标目录），不落回 opfs.uploadFile 内部
    // 还没追上的 currentPath —— 目录切换未完成时也只会写进 URL 对应的目录。
    await opfs.uploadFile(file, routePath.value);
  }
  if (fileInputRef.value) fileInputRef.value.value = '';
}

async function handleUploadFolder(files: File[]) {
  if (files.length === 0) return;
  showToastMsg(fileMessage('file.uploadingFolder', { count: files.length }), 'info');

  let successCount = 0;
  let failedCount = 0;
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    // RV-037：同上，folder 上传也必须用 URL 对应的目标目录。
    const success = await opfs.uploadFileWithPath(file, relativePath, routePath.value);
    if (success) successCount++;
    else failedCount++;
  }
  await opfs.refresh();
  if (failedCount > 0)
    showToastMsg(fileMessage('file.uploadFinished', { succeeded: successCount, failed: failedCount }), 'error');
  else showToastMsg(fileMessage('file.uploaded', { count: successCount }), 'success');
}

function handleOverwriteResponse(confirm: boolean) {
  if (overwriteConfirm.value.resolve) overwriteConfirm.value.resolve(confirm);
  overwriteConfirm.value = { show: false, file: null, existingEntry: null };
}

async function handleCreateFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  // RV-037：建目录同样要落在 URL 对应的目标目录，不是 opfs.currentPath。
  const success = await opfs.createDirectory(name, routePath.value);
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
    deleteConfirm.value = { show: true, target: { type: 'batch', count: entriesToDelete.length }, resolve };
  });

  if (shouldDelete) {
    let failedCount = 0;
    for (const entry of entriesToDelete) {
      const result = await opfs.deleteEntry(entry);
      if (!result) failedCount++;
    }
    if (failedCount > 0) showToastMsg(fileMessage('file.deleteFailures', { count: failedCount }), 'error');
    else showToastMsg(fileMessage('file.deleted', { count: entriesToDelete.length }), 'success');
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
    const entries = orderedEntries.value;
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
      openRenameDialog(entry);
      break;
    case 'delete':
      await handleDelete(entry);
      break;
  }
}

/** 行内重命名入口：触屏没有右键菜单，列表/网格的 Rename 按钮都走这里。 */
function openRenameDialog(entry: OPFSFileEntry): void {
  renameDialog.value = { show: true, entry, newName: entry.name };
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
        <span class="text-sm font-bold">{{ t('file.opfsTitle') }}</span>
        <div class="flex items-center gap-1.5">
          <div
            class="h-2 w-2 rounded-full"
            :class="opfsAvailable ? 'bg-success' : 'bg-error'"
          />
          <span class="text-base-content/60 text-xs">{{
            opfsAvailable ? t('file.connected') : t('file.disconnected')
          }}</span>
        </div>
        <span
          class="text-error text-xs"
          v-if="opfs.error.value"
          data-testid="opfs-error"
        >
          {{ renderFileMessage(t, opfs.error.value) }}
        </span>
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
          <List :size="12" /> {{ t('file.list') }}
        </button>
        <button
          class="tab gap-1"
          :class="{ 'tab-active': viewMode === 'grid' }"
          @click="viewMode = 'grid'"
          role="tab"
        >
          <Grid3X3 :size="12" /> {{ t('file.grid') }}
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="border-base-300 flex flex-wrap items-center gap-2 border-b p-2">
      <button
        class="btn btn-xs btn-ghost"
        @click="opfs.navigateTo('/')"
        :title="t('file.root')"
      >
        <Home :size="16" />
      </button>
      <button
        class="btn btn-xs btn-ghost"
        @click="opfs.refresh()"
        :title="t('file.refresh')"
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
        <Upload :size="16" /> {{ t('file.upload') }}
      </button>
      <button
        class="btn btn-xs btn-primary"
        @click="folderInputRef?.click()"
      >
        <Folder :size="16" /> {{ t('file.uploadFolder') }}
      </button>
      <button
        class="btn btn-xs btn-secondary"
        @click="showNewFolder = true"
      >
        <FolderPlus :size="16" /> {{ t('file.newFolder') }}
      </button>
      <template v-if="selectedPaths.size > 0">
        <div class="divider divider-horizontal m-0" />
        <span class="text-base-content/60 text-xs">{{ t('file.selected', { count: selectedPaths.size }) }}</span>
        <button
          class="btn btn-xs btn-ghost"
          @click="
            selectedPaths = new Set();
            lastSelectedPath = null;
          "
          :title="t('file.clearSelection')"
        >
          <X :size="14" />
        </button>
        <button
          class="btn btn-xs btn-error"
          @click="handleBatchDelete"
          :title="t('file.batchDelete')"
        >
          <Trash2 :size="16" /> {{ t('file.delete') }}
        </button>
      </template>
    </div>

    <!-- Breadcrumb -->
    <div class="border-base-300 flex items-center gap-1 overflow-x-auto border-b px-3 py-2 text-sm whitespace-nowrap">
      <button
        class="hover:underline"
        @click="opfs.navigateTo('/')"
      >
        {{ t('file.root') }}
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
        :entries="orderedEntries"
        :selected-paths="selectedPaths"
        @context-menu="handleContextMenu"
        @delete="handleDelete"
        @download="handleDownload"
        @entry-click="handleEntryClick"
        @navigate="handleNavigate"
        @preview="previewEntry = $event"
        @rename="openRenameDialog"
      />
      <OpfsFileGrid
        v-else
        :current-path="opfs.currentPath.value"
        :entries="orderedEntries"
        :selected-paths="selectedPaths"
        @context-menu="handleContextMenu"
        @delete="handleDelete"
        @download="handleDownload"
        @entry-click="handleEntryClick"
        @navigate="handleNavigate"
        @preview="previewEntry = $event"
        @rename="openRenameDialog"
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
          <p class="text-primary text-lg font-semibold">{{ t('file.drop') }}</p>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="border-base-300 text-base-content/60 flex items-center gap-4 border-t px-3 py-1 text-xs">
      <span>{{ t('file.stats', { count: dirCount + fileCount, folders: dirCount, files: fileCount }) }}</span>
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
        <h3 class="mb-4 text-base font-bold">{{ t('file.newFolder') }}</h3>
        <input
          class="input input-bordered w-full"
          v-model="newFolderName"
          @keydown.enter="handleCreateFolder"
          :placeholder="t('file.folderName')"
          type="text"
        />
        <div class="modal-action">
          <button
            class="btn btn-sm"
            @click="showNewFolder = false"
          >
            {{ t('file.cancel') }}
          </button>
          <button
            class="btn btn-sm btn-primary"
            @click="handleCreateFolder"
          >
            {{ t('file.create') }}
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
          {{ t('file.fileExists') }}
        </h3>
        <p class="mb-4">
          {{ t('file.overwriteQuestion', { name: overwriteConfirm.file.name }) }}
        </p>
        <div class="bg-base-200 mb-4 space-y-2 rounded-lg p-3">
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">{{ t('file.existingFile') }}</span>
            <span class="font-mono">{{ formatFileSize(overwriteConfirm.existingEntry.size || 0, locale) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">{{ t('file.newFile') }}</span>
            <span class="font-mono">{{ formatFileSize(overwriteConfirm.file.size, locale) }}</span>
          </div>
        </div>
        <div class="modal-action">
          <button
            class="btn btn-sm"
            @click="handleOverwriteResponse(false)"
          >
            {{ t('file.cancel') }}
          </button>
          <button
            class="btn btn-sm btn-warning"
            @click="handleOverwriteResponse(true)"
          >
            {{ t('file.overwrite') }}
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
          <span>{{ contextMenu.entry.kind === 'file' ? t('file.view') : t('file.open') }}</span>
        </a>
      </li>
      <li>
        <a
          class="gap-2 px-2 py-1.5"
          @click="handleContextMenuAction('rename')"
        >
          <Edit3 :size="14" />
          <span>{{ t('file.rename') }}</span>
        </a>
      </li>
      <li>
        <a
          class="text-error gap-2 px-2 py-1.5"
          @click="handleContextMenuAction('delete')"
        >
          <Trash2 :size="14" />
          <span>{{ t('file.delete') }}</span>
        </a>
      </li>
    </div>

    <!-- Delete confirm -->
    <div
      class="modal modal-open"
      v-if="deleteConfirm.show && deleteConfirm.target"
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
          {{ t('file.confirmDelete') }}
        </h3>
        <p class="mb-4">
          {{
            deleteConfirm.target.type === 'batch' ?
              t('file.deleteMany', { count: deleteConfirm.target.count })
            : t('file.deleteOne', { kind: deleteConfirm.target.entry.kind, name: deleteConfirm.target.entry.name })
          }}
        </p>
        <p
          class="text-warning mb-4 flex items-center gap-1 text-sm"
          v-if="deleteConfirm.target.type === 'single' && deleteConfirm.target.entry.kind === 'directory'"
        >
          <AlertTriangle :size="16" /> {{ t('file.deleteContents') }}
        </p>
        <div class="modal-action">
          <button
            class="btn btn-sm"
            @click="handleDeleteResponse(false)"
          >
            {{ t('file.cancel') }}
          </button>
          <button
            class="btn btn-sm btn-error"
            @click="handleDeleteResponse(true)"
          >
            {{ t('file.delete') }}
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
        <h3 class="mb-4 text-base font-bold">{{ t('file.renameEntry', { kind: renameDialog.entry.kind }) }}</h3>
        <input
          class="input input-bordered w-full"
          v-model="renameDialog.newName"
          :placeholder="t(renameDialog.entry.kind === 'file' ? 'file.fileName' : 'file.folderName')"
          @keydown.enter="handleRename"
          type="text"
        />
        <div class="modal-action">
          <button
            class="btn btn-sm"
            @click="renameDialog = { show: false, entry: null, newName: '' }"
          >
            {{ t('file.cancel') }}
          </button>
          <button
            class="btn btn-sm btn-primary"
            @click="handleRename"
          >
            {{ t('file.confirm') }}
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
        <span>{{ renderFileMessage(t, toast.message) }}</span>
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
      data-testid="opfs-file-input"
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
