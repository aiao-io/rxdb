<script lang="ts" setup>
import {
  orderFileEntries,
  type FileDeleteTarget,
  type FileMessage,
  fileMessage,
  renderFileMessage,
  fileError
} from '@modules/demo-i18n/files';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { normalizeDirectoryPath } from '@aiao/rxdb-plugin-storage';
import { injectRxDB } from '@aiao/rxdb-vue';
import { checkOPFSAvailable, STORAGE_TESTID } from '@aiao/utils';
import { Database, TriangleAlert, Upload } from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStorageBrowser } from './storage/composables/useStorageBrowser';
import { useStorageInitialization } from './storage/composables/useStorageInitialization';
import { useStorageSelection } from './storage/composables/useStorageSelection';
import { traverseDataTransferTree, useStorageTransfer } from './storage/composables/useStorageTransfer';
import StorageConfirmDialog from './storage/components/StorageConfirmDialog.vue';
import StorageContextMenu from './storage/components/StorageContextMenu.vue';
import StorageDeleteDialog from './storage/components/StorageDeleteDialog.vue';
import StorageFileGrid from './storage/components/StorageFileGrid.vue';
import StorageFileList from './storage/components/StorageFileList.vue';
import StorageFilePreview from './storage/components/StorageFilePreview.vue';
import StorageNewFolderDialog from './storage/components/StorageNewFolderDialog.vue';
import StorageOverwriteDialog from './storage/components/StorageOverwriteDialog.vue';
import StorageRenameDialog from './storage/components/StorageRenameDialog.vue';
import StorageToolbar from './storage/components/StorageToolbar.vue';
import type { StorageBrowserItem } from './storage/utils/storage-utils';
import { useToast } from '../app/composables/useToast';

const { t, locale } = useI18n();

type ViewMode = 'list' | 'grid';

const rxdb = injectRxDB()!;
const router = useRouter();
const route = useRoute();
const toast = useToast();
const T = STORAGE_TESTID;

const viewMode = ref<ViewMode>(getStoredViewMode());
const previewEntry = ref<StorageBrowserItem | null>(null);
const isDragging = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const folderInputRef = ref<HTMLInputElement | null>(null);
const gridContainerRef = ref<HTMLDivElement | null>(null);

const overwriteConfirm = ref<{
  show: boolean;
  file: File | null;
  existingEntry: StorageBrowserItem | null;
  resolve?: (value: boolean) => void;
}>({ show: false, file: null, existingEntry: null });
const contextMenu = ref<{ show: boolean; x: number; y: number; entry: StorageBrowserItem | null }>({
  show: false,
  x: 0,
  y: 0,
  entry: null
});
const renameDialog = ref<{ show: boolean; entry: StorageBrowserItem | null }>({ show: false, entry: null });
const deleteConfirm = ref<{
  show: boolean;
  target: FileDeleteTarget<StorageBrowserItem> | null;
  resolve?: (value: boolean) => void;
}>({ show: false, target: null });
const confirmDialog = ref<{ show: boolean; message: string | FileMessage; resolve?: (value: boolean) => void }>({
  show: false,
  message: ''
});
const showNewFolder = ref(false);

const browser = useStorageBrowser(rxdb);
const entries = computed(() => orderFileEntries(browser.entries.value, locale.value));
const initialization = useStorageInitialization({
  checkAvailability: checkOPFSAvailable,
  open: async path => {
    browser.currentPath.value = path;
    await browser.refresh(path);
  }
});
const selection = useStorageSelection(entries);
const transfer = useStorageTransfer({
  rxdb,
  currentPath: () => browser.currentPath.value,
  findExistingFileEntry: browser.findExistingFileEntry,
  refresh: () => browser.refresh(browser.currentPath.value),
  uploadResolver: {
    resolve: (file, existingEntry) =>
      new Promise<boolean>(resolve => {
        overwriteConfirm.value = { show: true, file, existingEntry, resolve };
      })
  }
});

const routePath = computed(() => normalizeRoutePath(route.params.storagePath as string | string[] | undefined));
const dirCount = computed(() => entries.value.filter(entry => entry.kind === 'directory').length);
const fileCount = computed(() => entries.value.filter(entry => entry.kind === 'file').length);
const opfsAvailable = computed(() => initialization.isReady.value);
const storageLoading = computed(() => initialization.status.value === 'checking' || browser.loading.value);
const storageStatusMessage = computed(() => {
  if (initialization.status.value === 'unavailable') return t('file.opfsUnsupported');
  if (initialization.status.value === 'error') {
    return renderFileMessage(t, fileError('file.initFailed', initialization.error.value));
  }
  return null;
});

onMounted(async () => {
  window.addEventListener('click', closeContextMenu);
  await initialization.start(routePath.value);
});

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu);
  selection.teardownDrag();
});

watch(routePath, async path => {
  if (!initialization.isReady.value || path === browser.currentPath.value) return;

  browser.currentPath.value = path;
  selection.clearSelection();
  closeContextMenu();
  previewEntry.value = null;
  await browser.refresh(path);
});

watch(
  () => browser.currentPath.value,
  path => {
    if (!initialization.isReady.value) return;
    const url = buildUrlFromPath(path);
    if (router.currentRoute.value.fullPath !== url) {
      void router.replace(url);
    }
  }
);

watch(viewMode, mode => {
  localStorage.setItem('storage-view-mode', mode);
});

function getStoredViewMode(): ViewMode {
  const stored = localStorage.getItem('storage-view-mode');
  return stored === 'grid' || stored === 'list' ? stored : 'list';
}

function normalizeRoutePath(path: string | string[] | undefined): string {
  const value = Array.isArray(path) ? path.join('/') : path;
  if (!value || value === '/') return '/';
  return normalizeDirectoryPath(value.startsWith('/') ? value : `/${value}`);
}

function buildUrlFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/storage';
  return `/storage/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
}

function confirm(message: string | FileMessage): Promise<boolean> {
  return new Promise(resolve => {
    confirmDialog.value = { show: true, message, resolve };
  });
}

async function navigateTo(path: string): Promise<void> {
  selection.clearSelection();
  closeContextMenu();
  previewEntry.value = null;
  await browser.navigateTo(path);
}

async function handleDelete(entry: StorageBrowserItem): Promise<void> {
  const shouldDelete = await new Promise<boolean>(resolve => {
    deleteConfirm.value = { show: true, target: { type: 'single', entry }, resolve };
  });

  if (!shouldDelete) return;

  const result = await browser.deleteEntry(entry);
  if (!result) toast.error(fileMessage('file.deleteFailed', { detail: entry.name }));
}

async function handleCreateFolder(name: string): Promise<void> {
  try {
    await rxdb.storage.createDirectory(name, { path: browser.currentPath.value });
    showNewFolder.value = false;
    toast.success(fileMessage('file.folderCreated'));
    await browser.refresh(browser.currentPath.value);
  } catch (err) {
    toast.error(fileError('file.createFailed', err));
  }
}

async function handleRename(newName: string): Promise<void> {
  const entry = renameDialog.value.entry;
  if (!entry) return;

  try {
    if (entry.kind === 'file' && entry.meta) {
      await rxdb.storage.rename(entry.meta.id, newName);
    } else {
      await rxdb.storage.renameDirectory(entry.path, newName);
    }
    renameDialog.value = { show: false, entry: null };
    toast.success(fileMessage('file.renameSuccess'));
    await browser.refresh(browser.currentPath.value);
  } catch (err) {
    toast.error(fileError('file.renameFailed', err));
  }
}

async function handleBatchDelete(): Promise<void> {
  if (selection.selectedPaths.value.size === 0) return;

  const selectedEntries = browser.entries.value.filter(entry => selection.selectedPaths.value.has(entry.path));
  const shouldDelete = await new Promise<boolean>(resolve => {
    deleteConfirm.value = {
      show: true,
      target: { type: 'batch', count: selectedEntries.length },
      resolve
    };
  });

  if (!shouldDelete) return;

  let failedCount = 0;
  for (const entry of selectedEntries) {
    const ok = await browser.deleteEntry(entry);
    if (!ok) failedCount++;
  }

  if (failedCount > 0) toast.error(fileMessage('file.deleteFailures', { count: failedCount }));
  else toast.success(fileMessage('file.deleted', { count: selectedEntries.length }));

  selection.clearSelection();
}

async function handleBatchDownload(): Promise<void> {
  const selectedEntries = browser.entries.value.filter(entry => selection.selectedPaths.value.has(entry.path));
  await transfer.downloadBatch(selectedEntries);
}

async function onClearAll(): Promise<void> {
  const confirmed = await confirm(fileMessage('file.confirmClear'));
  if (!confirmed) return;

  try {
    await rxdb.storage.clear('/');
    selection.clearSelection();
    previewEntry.value = null;
    toast.success(fileMessage('file.clearSuccess'));
    browser.currentPath.value = '/';
    await browser.refresh('/');
  } catch (err) {
    toast.error(fileError('file.clearFailed', err));
  }
}

function handleContextMenu(payload: { event: MouseEvent; entry: StorageBrowserItem }): void {
  payload.event.preventDefault();
  contextMenu.value = { show: true, x: payload.event.clientX, y: payload.event.clientY, entry: payload.entry };
}

function closeContextMenu(): void {
  contextMenu.value = { show: false, x: 0, y: 0, entry: null };
}

async function handleContextMenuAction(action: 'view' | 'download' | 'rename' | 'delete'): Promise<void> {
  const entry = contextMenu.value.entry;
  closeContextMenu();
  if (!entry) return;

  if (action === 'view') {
    if (entry.kind === 'file') previewEntry.value = entry;
    else await navigateTo(entry.path);
    return;
  }
  if (action === 'download') {
    await transfer.downloadEntry(entry);
    return;
  }
  if (action === 'rename') {
    openRenameDialog(entry);
    return;
  }
  if (action === 'delete') {
    await handleDelete(entry);
  }
}

/** 行内重命名入口：触屏没有右键菜单，列表/网格的 Rename 按钮都走这里。 */
function openRenameDialog(entry: StorageBrowserItem): void {
  renameDialog.value = { show: true, entry };
}

async function handleDrop(event: DragEvent): Promise<void> {
  event.preventDefault();
  isDragging.value = false;
  if (!event.dataTransfer) return;

  if (event.dataTransfer.items) {
    const droppedFiles: File[] = [];
    const promises: Promise<void>[] = [];
    for (let index = 0; index < event.dataTransfer.items.length; index++) {
      const item = event.dataTransfer.items[index];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry) promises.push(traverseDataTransferTree(entry, '', droppedFiles));
      }
    }

    await Promise.all(promises);

    if (droppedFiles.length > 0) {
      const hasFolder = droppedFiles.some(file =>
        (file as File & { webkitRelativePath?: string }).webkitRelativePath?.includes('/')
      );
      if (hasFolder) await transfer.uploadFolder(droppedFiles);
      else await transfer.upload(droppedFiles);
    }
    return;
  }

  if (event.dataTransfer.files) {
    await transfer.upload(Array.from(event.dataTransfer.files));
  }
}

function handleMouseDown(event: MouseEvent): void {
  if (viewMode.value !== 'grid' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const container = gridContainerRef.value;
  if (!container) return;
  selection.startBoxSelection(event, container);
}

function handleFileInputUpload(): void {
  if (fileInputRef.value?.files) {
    transfer.upload(Array.from(fileInputRef.value.files));
    fileInputRef.value.value = '';
  }
}

function handleFolderInputUpload(): void {
  if (folderInputRef.value?.files) {
    transfer.uploadFolder(Array.from(folderInputRef.value.files));
    folderInputRef.value.value = '';
  }
}

function resolveDeleteConfirm(confirmed: boolean): void {
  deleteConfirm.value.resolve?.(confirmed);
  deleteConfirm.value = { show: false, target: null };
}

function resolveOverwrite(confirmed: boolean): void {
  overwriteConfirm.value.resolve?.(confirmed);
  overwriteConfirm.value = { show: false, file: null, existingEntry: null };
}

function resolveConfirmDialog(confirmed: boolean): void {
  confirmDialog.value.resolve?.(confirmed);
  confirmDialog.value = { show: false, message: '' };
}
</script>

<template>
  <div
    class="flex h-full flex-col"
    :data-testid="T.PAGE"
  >
    <StorageToolbar
      :all-files-count="browser.allFiles.value.length"
      :current-path="browser.currentPath.value"
      :loading="storageLoading"
      :opfs-available="opfsAvailable"
      :selection-size="selection.selectedPaths.value.size"
      :view-mode="viewMode"
      @batch-delete="handleBatchDelete"
      @batch-download="handleBatchDownload"
      @clear-all="onClearAll"
      @clear-selection="selection.clearSelection()"
      @navigate="navigateTo"
      @new-folder="showNewFolder = true"
      @refresh="browser.refresh(browser.currentPath.value)"
      @update:view-mode="viewMode = $event"
      @upload="fileInputRef?.click()"
      @upload-folder="folderInputRef?.click()"
    />

    <div
      class="relative flex-1 overflow-auto"
      @dragenter.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @dragover.prevent
      @drop="handleDrop"
      @mousedown="handleMouseDown"
      ref="gridContainerRef"
    >
      <div
        class="flex h-full items-center justify-center"
        v-if="initialization.status.value === 'checking'"
      >
        <span class="loading loading-spinner loading-md" />
      </div>
      <div
        class="flex h-full items-center justify-center"
        v-else-if="storageStatusMessage"
      >
        <div class="max-w-md px-6 text-center">
          <TriangleAlert
            class="text-error mx-auto mb-4"
            :size="48"
          />
          <p class="text-error text-sm">{{ storageStatusMessage }}</p>
        </div>
      </div>
      <div
        class="flex h-full items-center justify-center"
        v-else-if="entries.length === 0"
        :data-testid="T.EMPTY_STATE"
      >
        <div class="text-center">
          <Database
            class="text-base-content/30 mx-auto mb-4"
            :size="48"
          />
          <p class="text-base-content/60 text-sm">
            {{ browser.currentPath.value === '/' ? t('file.emptyStorage') : t('file.emptyFolder') }}
          </p>
        </div>
      </div>
      <StorageFileList
        v-else-if="viewMode === 'list'"
        :current-path="browser.currentPath.value"
        :entries="entries"
        :selected-paths="selection.selectedPaths.value"
        @context-menu="handleContextMenu"
        @delete="handleDelete"
        @download="transfer.downloadEntry"
        @entry-click="payload => selection.handleEntryClick(payload.entry, payload.event)"
        @navigate="navigateTo($event.path)"
        @preview="previewEntry = $event"
        @rename="openRenameDialog"
      />
      <StorageFileGrid
        v-else
        :current-path="browser.currentPath.value"
        :entries="entries"
        :selected-paths="selection.selectedPaths.value"
        @context-menu="handleContextMenu"
        @delete="handleDelete"
        @download="transfer.downloadEntry"
        @entry-click="payload => selection.handleEntryClick(payload.entry, payload.event)"
        @navigate="navigateTo($event.path)"
        @preview="previewEntry = $event"
        @rename="openRenameDialog"
      />

      <div
        class="border-primary bg-primary/10 pointer-events-none absolute border-2"
        v-if="selection.selectionBox.value?.active"
        :style="{
          left: Math.min(selection.selectionBox.value.startX, selection.selectionBox.value.currentX) + 'px',
          top: Math.min(selection.selectionBox.value.startY, selection.selectionBox.value.currentY) + 'px',
          width: Math.abs(selection.selectionBox.value.currentX - selection.selectionBox.value.startX) + 'px',
          height: Math.abs(selection.selectionBox.value.currentY - selection.selectionBox.value.startY) + 'px'
        }"
      />

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

    <div class="border-base-300 text-base-content/60 flex items-center gap-4 border-t px-3 py-1 text-xs">
      <span>{{ t('file.stats', { count: dirCount + fileCount, folders: dirCount, files: fileCount }) }}</span>
    </div>

    <StorageFilePreview
      :entry="previewEntry"
      @close="previewEntry = null"
    />

    <StorageNewFolderDialog
      :show="showNewFolder"
      @cancel="showNewFolder = false"
      @confirm="handleCreateFolder"
    />

    <StorageOverwriteDialog
      :existing-entry="overwriteConfirm.existingEntry"
      :file="overwriteConfirm.file"
      :show="overwriteConfirm.show"
      @respond="resolveOverwrite"
    />

    <StorageContextMenu
      :entry="contextMenu.entry"
      :show="contextMenu.show"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @action="handleContextMenuAction"
    />

    <StorageDeleteDialog
      :target="deleteConfirm.target"
      :show="deleteConfirm.show"
      @respond="resolveDeleteConfirm"
    />

    <StorageRenameDialog
      :entry="renameDialog.entry"
      :show="renameDialog.show"
      @cancel="renameDialog = { show: false, entry: null }"
      @confirm="handleRename"
    />

    <StorageConfirmDialog
      :message="renderFileMessage(t, confirmDialog.message)"
      :show="confirmDialog.show"
      @respond="resolveConfirmDialog"
    />

    <input
      class="hidden"
      :data-testid="T.FILE_INPUT"
      @change="handleFileInputUpload"
      multiple
      ref="fileInputRef"
      type="file"
    />
    <input
      class="hidden"
      :data-testid="T.FOLDER_INPUT"
      @change="handleFolderInputUpload"
      directory
      ref="folderInputRef"
      type="file"
      webkitdirectory
    />
  </div>
</template>
