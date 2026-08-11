<script lang="ts" setup>
/**
 * OPFS 文件网格组件
 */
import { Download, Eye, Trash2 } from '@lucide/vue';
import { onUnmounted, ref, watch } from 'vue';
import { useOpfsService } from '../composables/useOpfsService';
import {
  canPreviewFile,
  formatFileSize,
  getFileIcon,
  getFileIconColor,
  isImageFile,
  type OPFSFileEntry
} from '../utils/opfs-utils';

const props = defineProps<{
  entries: OPFSFileEntry[];
  currentPath: string;
  selectedPaths: Set<string>;
}>();

const emit = defineEmits<{
  navigate: [entry: OPFSFileEntry];
  download: [entry: OPFSFileEntry];
  delete: [entry: OPFSFileEntry];
  preview: [entry: OPFSFileEntry];
  contextMenu: [payload: { event: MouseEvent; entry: OPFSFileEntry }];
  entryClick: [payload: { entry: OPFSFileEntry; event: MouseEvent }];
}>();

const opfs = useOpfsService();
const thumbnailUrls = ref<Map<string, string>>(new Map());
const clickTimeout = ref<number | null>(null);
let loadingThumbnails = false;
let lastHash = '';

watch(
  () => props.entries,
  async entries => {
    if (!entries || entries.length === 0) {
      thumbnailUrls.value = new Map();
      return;
    }

    const hash = entries.map(e => e.path).join('|');
    if (hash === lastHash) return;
    lastHash = hash;

    if (!loadingThumbnails) {
      setTimeout(() => loadThumbnails(), 0);
    }
  },
  { immediate: true }
);

async function loadThumbnails() {
  if (loadingThumbnails) return;
  loadingThumbnails = true;

  try {
    const imageEntries = props.entries.filter(e => isImageFile(e));
    const urls = new Map<string, string>();
    const CONCURRENT_LIMIT = 5;

    for (let i = 0; i < imageEntries.length; i += CONCURRENT_LIMIT) {
      const batch = imageEntries.slice(i, i + CONCURRENT_LIMIT);
      await Promise.all(
        batch.map(async entry => {
          try {
            const preview = await opfs.previewFile(entry);
            if (preview?.data instanceof Blob) {
              urls.set(entry.path, URL.createObjectURL(preview.data));
            }
          } catch {
            /* silent */
          }
        })
      );
    }

    thumbnailUrls.value.forEach(url => URL.revokeObjectURL(url));
    thumbnailUrls.value = urls;
  } finally {
    loadingThumbnails = false;
  }
}

onUnmounted(() => {
  if (clickTimeout.value) clearTimeout(clickTimeout.value);
  thumbnailUrls.value.forEach(url => URL.revokeObjectURL(url));
});

function handleEntryClick(entry: OPFSFileEntry, event: MouseEvent) {
  if (clickTimeout.value) clearTimeout(clickTimeout.value);
  clickTimeout.value = window.setTimeout(() => {
    emit('entryClick', { entry, event });
    clickTimeout.value = null;
  }, 250);
}

function handleDoubleClick(entry: OPFSFileEntry) {
  if (clickTimeout.value) {
    clearTimeout(clickTimeout.value);
    clickTimeout.value = null;
  }
  if (entry.kind === 'directory') emit('navigate', entry);
  else emit('preview', entry);
}

function handleContextMenu(event: MouseEvent, entry: OPFSFileEntry) {
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
      :class="{ 'bg-primary/20 ring-primary ring-2': selectedPaths.has(entry.path) }"
      :data-entry-path="entry.path"
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
          :title="entry.name"
        >
          {{ entry.name }}
        </h2>
        <p
          class="text-base-content/60 text-[10px]"
          v-if="entry.kind === 'file'"
        >
          {{ formatFileSize(entry.size || 0) }}
        </p>
      </div>

      <div class="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
          v-if="entry.kind === 'file' && canPreviewFile(entry)"
          @click.stop="emit('preview', entry)"
          title="预览"
        >
          <Eye :size="12" />
        </button>
        <button
          class="btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur"
          v-if="entry.kind === 'file'"
          @click.stop="emit('download', entry)"
          title="下载"
        >
          <Download :size="12" />
        </button>
        <button
          class="btn btn-circle btn-ghost btn-xs bg-base-100/80 text-error backdrop-blur"
          @click.stop="emit('delete', entry)"
          title="删除"
        >
          <Trash2 :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>
