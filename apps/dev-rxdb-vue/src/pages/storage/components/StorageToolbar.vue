<script lang="ts" setup>
import { STORAGE_LABELS, STORAGE_TESTID } from '@aiao/utils';
import {
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  Grid3X3,
  Home,
  List,
  RefreshCw,
  Trash2,
  Upload,
  X
} from '@lucide/vue';
import { computed } from 'vue';
import { normalizeDirectoryPath } from '@aiao/rxdb-plugin-storage';

type ViewMode = 'list' | 'grid';

const props = defineProps<{
  viewMode: ViewMode;
  opfsAvailable: boolean;
  loading: boolean;
  currentPath: string;
  selectionSize: number;
  allFilesCount: number;
}>();

const emit = defineEmits<{
  (e: 'update:viewMode', mode: ViewMode): void;
  (e: 'navigate', path: string): void;
  (e: 'refresh'): void;
  (e: 'upload'): void;
  (e: 'uploadFolder'): void;
  (e: 'newFolder'): void;
  (e: 'clearSelection'): void;
  (e: 'batchDownload'): void;
  (e: 'batchDelete'): void;
  (e: 'clearAll'): void;
}>();

const T = STORAGE_TESTID;
const L = STORAGE_LABELS;

const pathSegments = computed(() => {
  if (props.currentPath === '/') return [];
  return props.currentPath
    .split('/')
    .filter(Boolean)
    .map((segment, index, segments) => ({
      name: segment,
      path: normalizeDirectoryPath('/' + segments.slice(0, index + 1).join('/'))
    }));
});
</script>

<template>
  <div class="border-base-300 flex items-center justify-between border-b px-3 py-2">
    <div class="flex items-center gap-3">
      <span class="text-sm font-bold">{{ L.PAGE_TITLE }}</span>
      <div class="flex items-center gap-1.5">
        <div
          class="h-2 w-2 rounded-full"
          :class="
            opfsAvailable ? 'bg-success'
            : loading ? 'bg-warning'
            : 'bg-error'
          "
        />
        <span class="text-base-content/60 text-xs">
          {{
            opfsAvailable ? 'Connected'
            : loading ? 'Checking...'
            : 'Unavailable'
          }}
        </span>
      </div>
    </div>
    <div
      class="tabs tabs-boxed tabs-xs"
      role="tablist"
    >
      <button
        class="tab gap-1"
        :class="{ 'tab-active': viewMode === 'list' }"
        @click="emit('update:viewMode', 'list')"
        role="tab"
      >
        <List :size="12" /> List
      </button>
      <button
        class="tab gap-1"
        :class="{ 'tab-active': viewMode === 'grid' }"
        @click="emit('update:viewMode', 'grid')"
        role="tab"
      >
        <Grid3X3 :size="12" /> Grid
      </button>
    </div>
  </div>

  <div class="border-base-300 flex items-center gap-2 border-b p-2">
    <button
      class="btn btn-xs btn-ghost"
      @click="emit('navigate', '/')"
      title="Root"
    >
      <Home :size="16" />
    </button>
    <button
      class="btn btn-xs btn-ghost"
      @click="emit('refresh')"
      title="Refresh"
    >
      <RefreshCw
        :class="{ 'animate-spin': loading }"
        :size="16"
      />
    </button>
    <div class="divider divider-horizontal m-0" />
    <button
      class="btn btn-xs btn-primary"
      :data-testid="T.UPLOAD_BTN"
      @click="emit('upload')"
    >
      <Upload :size="16" /> {{ L.UPLOAD }}
    </button>
    <button
      class="btn btn-xs btn-primary"
      :data-testid="T.UPLOAD_FOLDER_BTN"
      @click="emit('uploadFolder')"
    >
      <Folder :size="16" /> Upload Folder
    </button>
    <button
      class="btn btn-xs btn-secondary"
      :data-testid="T.NEW_FOLDER_BTN"
      @click="emit('newFolder')"
    >
      <FolderPlus :size="16" /> New Folder
    </button>
    <template v-if="selectionSize > 0">
      <div class="divider divider-horizontal m-0" />
      <span class="text-base-content/60 text-xs">Selected {{ selectionSize }} items</span>
      <button
        class="btn btn-xs btn-ghost"
        :data-testid="T.CLEAR_SELECTION_BTN"
        @click="emit('clearSelection')"
        title="Clear selection"
      >
        <X :size="14" />
      </button>
      <button
        class="btn btn-xs btn-info"
        :data-testid="T.BATCH_DOWNLOAD_BTN"
        @click="emit('batchDownload')"
        title="Batch download"
      >
        <Download :size="16" /> Download
      </button>
      <button
        class="btn btn-xs btn-error"
        :data-testid="T.BATCH_DELETE_BTN"
        @click="emit('batchDelete')"
        title="Batch delete"
      >
        <Trash2 :size="16" /> Delete
      </button>
    </template>
    <template v-if="currentPath === '/' && allFilesCount > 0">
      <div class="divider divider-horizontal m-0" />
      <button
        class="btn btn-xs btn-error btn-outline"
        :data-testid="T.CLEAR_BTN"
        @click="emit('clearAll')"
      >
        <Trash2 :size="16" /> {{ L.CLEAR_ALL }}
      </button>
    </template>
  </div>

  <div class="border-base-300 flex items-center gap-1 border-b px-3 py-2 text-sm">
    <button
      class="hover:underline"
      @click="emit('navigate', '/')"
    >
      Root
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
        @click="emit('navigate', segment.path)"
      >
        {{ segment.name }}
      </button>
    </div>
  </div>
</template>
