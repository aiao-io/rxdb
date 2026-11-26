<script lang="ts" setup>
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { STORAGE_TESTID } from '@aiao/utils';
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

const { t } = useI18n();

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
      <span class="text-sm font-bold">{{ t('file.storageTitle') }}</span>
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
            t(
              opfsAvailable ? 'file.connected'
              : loading ? 'file.loading'
              : 'file.disconnected'
            )
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
        <List :size="12" /> {{ t('file.list') }}
      </button>
      <button
        class="tab gap-1"
        :class="{ 'tab-active': viewMode === 'grid' }"
        @click="emit('update:viewMode', 'grid')"
        role="tab"
      >
        <Grid3X3 :size="12" /> {{ t('file.grid') }}
      </button>
    </div>
  </div>

  <div class="border-base-300 flex flex-wrap items-center gap-2 border-b p-2">
    <button
      class="btn btn-xs btn-ghost"
      @click="emit('navigate', '/')"
      :title="t('file.root')"
    >
      <Home :size="16" />
    </button>
    <button
      class="btn btn-xs btn-ghost"
      @click="emit('refresh')"
      :title="t('file.refresh')"
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
      <Upload :size="16" /> {{ t('file.upload') }}
    </button>
    <button
      class="btn btn-xs btn-primary"
      :data-testid="T.UPLOAD_FOLDER_BTN"
      @click="emit('uploadFolder')"
    >
      <Folder :size="16" /> {{ t('file.uploadFolder') }}
    </button>
    <button
      class="btn btn-xs btn-secondary"
      :data-testid="T.NEW_FOLDER_BTN"
      @click="emit('newFolder')"
    >
      <FolderPlus :size="16" /> {{ t('file.newFolder') }}
    </button>
    <template v-if="selectionSize > 0">
      <div class="divider divider-horizontal m-0" />
      <span class="text-base-content/60 text-xs">{{ t('file.selected', { count: selectionSize }) }}</span>
      <button
        class="btn btn-xs btn-ghost"
        :data-testid="T.CLEAR_SELECTION_BTN"
        @click="emit('clearSelection')"
        :title="t('file.clearSelection')"
      >
        <X :size="14" />
      </button>
      <button
        class="btn btn-xs btn-info"
        :data-testid="T.BATCH_DOWNLOAD_BTN"
        @click="emit('batchDownload')"
        :title="t('file.batchDownload')"
      >
        <Download :size="16" /> {{ t('file.download') }}
      </button>
      <button
        class="btn btn-xs btn-error"
        :data-testid="T.BATCH_DELETE_BTN"
        @click="emit('batchDelete')"
        :title="t('file.batchDelete')"
      >
        <Trash2 :size="16" /> {{ t('file.delete') }}
      </button>
    </template>
    <template v-if="currentPath === '/' && allFilesCount > 0">
      <div class="divider divider-horizontal m-0" />
      <button
        class="btn btn-xs btn-error btn-outline"
        :data-testid="T.CLEAR_BTN"
        @click="emit('clearAll')"
      >
        <Trash2 :size="16" /> {{ t('file.clearAll') }}
      </button>
    </template>
  </div>

  <div class="border-base-300 flex items-center gap-1 overflow-x-auto border-b px-3 py-2 text-sm whitespace-nowrap">
    <button
      class="hover:underline"
      @click="emit('navigate', '/')"
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
        @click="emit('navigate', segment.path)"
      >
        {{ segment.name }}
      </button>
    </div>
  </div>
</template>
