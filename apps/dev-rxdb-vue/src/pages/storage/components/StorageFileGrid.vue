<script lang="ts" setup>
import { injectRxDB } from '@aiao/rxdb-vue';
import { formatFileSize, STORAGE_TESTID } from '@aiao/utils';
import { Download, Eye, FolderOpen, Trash2 } from '@lucide/vue';
import { onUnmounted, ref, watch } from 'vue';
import {
  canPreviewFile,
  getFileIcon,
  getFileIconColor,
  isImageFile,
  type StorageBrowserItem
} from '../utils/storage-utils';

const props = defineProps<{
  entries: StorageBrowserItem[];
  currentPath: string;
  selectedPaths: Set<string>;
}>();

const emit = defineEmits<{
  navigate: [entry: StorageBrowserItem];
  download: [entry: StorageBrowserItem];
  delete: [entry: StorageBrowserItem];
  preview: [entry: StorageBrowserItem];
  contextMenu: [payload: { event: MouseEvent; entry: StorageBrowserItem }];
  entryClick: [payload: { entry: StorageBrowserItem; event: MouseEvent }];
}>();

const rxdb = injectRxDB()!;
const thumbnailUrls = ref<Map<string, string>>(new Map());
const clickTimeout = ref<number | null>(null);
const T = STORAGE_TESTID;
let loadingThumbnails = false;
let lastHash = '';

watch(
  () => props.entries.map(entry => entry.path).join('|'),
  hash => {
    if (!hash) {
      thumbnailUrls.value.forEach(url => rxdb.storage.revokeObjectUrl(url));
      thumbnailUrls.value = new Map();
      lastHash = '';
      return;
    }

    if (hash === lastHash) {
      return;
    }

    lastHash = hash;

    if (!loadingThumbnails) {
      setTimeout(() => {
        void loadThumbnails();
      }, 0);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  if (clickTimeout.value) clearTimeout(clickTimeout.value);
  thumbnailUrls.value.forEach(url => rxdb.storage.revokeObjectUrl(url));
});

async function loadThumbnails() {
  if (loadingThumbnails) return;
  loadingThumbnails = true;

  try {
    const imageEntries = props.entries.filter(entry => entry.kind === 'file' && entry.meta && isImageFile(entry));
    const urls = new Map<string, string>();
    const concurrentLimit = 5;

    for (let index = 0; index < imageEntries.length; index += concurrentLimit) {
      const batch = imageEntries.slice(index, index + concurrentLimit);
      await Promise.all(
        batch.map(async entry => {
          if (!entry.meta) return;

          try {
            const url = await rxdb.storage.createObjectUrl(entry.meta.id);
            urls.set(entry.path, url);
          } catch {
            return;
          }
        })
      );
    }

    thumbnailUrls.value.forEach(url => rxdb.storage.revokeObjectUrl(url));
    thumbnailUrls.value = urls;
  } finally {
    loadingThumbnails = false;
  }
}

function handleEntryClick(entry: StorageBrowserItem, event: MouseEvent) {
  if (clickTimeout.value) clearTimeout(clickTimeout.value);
  clickTimeout.value = window.setTimeout(() => {
    emit('entryClick', { entry, event });
    clickTimeout.value = null;
  }, 250);
}

function handleDoubleClick(entry: StorageBrowserItem) {
  if (clickTimeout.value) {
    clearTimeout(clickTimeout.value);
    clickTimeout.value = null;
  }

  if (entry.kind === 'directory') {
    emit('navigate', entry);
    return;
  }

  emit('preview', entry);
}

function handleContextMenu(event: MouseEvent, entry: StorageBrowserItem) {
  event.preventDefault();
  emit('contextMenu', { event, entry });
}
</script>

<template>
  <div
    class="grid grid-cols-3 gap-3 p-3 select-none sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12"
  >
    <div
      class="group hover:bg-base-300 relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all"
      v-for="entry in entries"
      :class="selectedPaths.has(entry.path) ? 'bg-primary/20 ring-primary ring-2' : ''"
      :data-entry-path="entry.path"
      :data-testid="T.FILE_ROW"
      :key="entry.path"
      @click="handleEntryClick(entry, $event)"
      @contextmenu="handleContextMenu($event, entry)"
      @dblclick="handleDoubleClick(entry)"
      role="button"
      tabindex="0"
    >
      <div class="flex h-16 w-full items-center justify-center">
        <img
          class="h-full w-full rounded object-cover"
          v-if="entry.kind === 'file' && isImageFile(entry) && thumbnailUrls.get(entry.path)"
          :alt="entry.name"
          :src="thumbnailUrls.get(entry.path)"
        />
        <component
          v-else
          :class="getFileIconColor(entry)"
          :is="getFileIcon(entry)"
          :size="24"
        />
      </div>

      <div class="w-full text-center">
        <h2
          class="line-clamp-2 text-xs font-medium"
          :data-testid="T.FILE_NAME"
          :title="entry.name"
        >
          {{ entry.name }}
        </h2>
        <p
          class="text-base-content/60 text-[10px]"
          v-if="entry.kind === 'file'"
          :data-testid="T.FILE_SIZE"
        >
          {{ formatFileSize(entry.size || 0) }}
        </p>
      </div>

      <div class="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <template v-if="entry.kind === 'directory'">
          <button
            class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
            @click.stop="emit('navigate', entry)"
            title="Open"
          >
            <FolderOpen :size="12" />
          </button>
          <button
            class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
            @click.stop="emit('download', entry)"
            title="Download ZIP"
          >
            <Download :size="12" />
          </button>
        </template>
        <template v-else>
          <button
            class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
            v-if="canPreviewFile(entry)"
            :data-testid="T.PREVIEW_BTN"
            @click.stop="emit('preview', entry)"
            title="Preview"
          >
            <Eye :size="12" />
          </button>
          <button
            class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
            :data-testid="T.DOWNLOAD_BTN"
            @click.stop="emit('download', entry)"
            title="Download"
          >
            <Download :size="12" />
          </button>
        </template>
        <button
          class="btn btn-circle btn-ghost btn-xs bg-base-100/80 text-error backdrop-blur"
          :data-testid="entry.kind === 'file' ? T.DELETE_BTN : undefined"
          @click.stop="emit('delete', entry)"
          title="Delete"
        >
          <Trash2 :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>
