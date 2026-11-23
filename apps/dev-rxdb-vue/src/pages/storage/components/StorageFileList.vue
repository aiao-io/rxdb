<script lang="ts" setup>
import { formatFileSize, formatFileDate } from '@modules/demo-i18n/files';
import { STORAGE_TESTID } from '@aiao/utils';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { Download, Eye, FolderOpen, Pen, Trash2 } from '@lucide/vue';
import { ref } from 'vue';
import { canPreviewFile, getFileIcon, getFileIconColor, type StorageBrowserItem } from '../utils/storage-utils';

defineProps<{
  entries: StorageBrowserItem[];
  currentPath: string;
  selectedPaths: Set<string>;
}>();

const emit = defineEmits<{
  navigate: [entry: StorageBrowserItem];
  download: [entry: StorageBrowserItem];
  delete: [entry: StorageBrowserItem];
  preview: [entry: StorageBrowserItem];
  rename: [entry: StorageBrowserItem];
  contextMenu: [payload: { event: MouseEvent; entry: StorageBrowserItem }];
  entryClick: [payload: { entry: StorageBrowserItem; event: MouseEvent }];
}>();

const clickTimeout = ref<number | null>(null);
const T = STORAGE_TESTID;
const { locale, t } = useI18n();

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
  <table
    class="table-zebra table select-none"
    :data-testid="T.FILE_LIST"
  >
    <thead>
      <tr>
        <th>{{ t('file.name') }}</th>
        <th class="w-32">{{ t('file.size') }}</th>
        <th class="hidden w-40 md:table-cell">{{ t('file.modified') }}</th>
        <th class="w-24">{{ t('file.actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr
        class="cursor-pointer"
        v-for="entry in entries"
        :class="selectedPaths.has(entry.path) ? 'bg-primary/10' : 'hover:bg-base-200'"
        :data-entry-path="entry.path"
        :data-testid="T.FILE_ROW"
        :key="entry.path"
        @click="handleEntryClick(entry, $event)"
        @contextmenu="handleContextMenu($event, entry)"
        @dblclick="handleDoubleClick(entry)"
      >
        <td
          class="font-medium"
          :data-testid="T.FILE_NAME"
        >
          <button
            class="flex items-center gap-1.5 hover:underline"
            v-if="entry.kind === 'directory'"
            @click.stop="emit('navigate', entry)"
          >
            <component
              :class="getFileIconColor(entry)"
              :is="getFileIcon(entry)"
              :size="16"
            />
            {{ entry.name }}
          </button>
          <div
            class="flex items-center gap-1.5"
            v-else
          >
            <component
              :class="getFileIconColor(entry)"
              :is="getFileIcon(entry)"
              :size="16"
            />
            <span>{{ entry.name }}</span>
          </div>
        </td>
        <td
          class="text-base-content/60 text-sm"
          :data-testid="entry.kind === 'file' ? T.FILE_SIZE : undefined"
        >
          {{ entry.kind === 'file' ? formatFileSize(entry.size || 0, locale) : '-' }}
        </td>
        <td class="text-base-content/60 hidden text-sm md:table-cell">
          {{ formatFileDate(entry.lastModified, locale) }}
        </td>
        <td>
          <div class="flex items-center gap-1">
            <template v-if="entry.kind === 'directory'">
              <button
                class="btn btn-ghost btn-xs"
                @click.stop="emit('navigate', entry)"
                :title="t('file.open')"
              >
                <FolderOpen :size="14" />
              </button>
              <button
                class="btn btn-ghost btn-xs"
                @click.stop="emit('download', entry)"
                :title="t('file.downloadZip')"
              >
                <Download :size="14" />
              </button>
            </template>
            <template v-else>
              <button
                class="btn btn-ghost btn-xs"
                v-if="canPreviewFile(entry)"
                :data-testid="T.PREVIEW_BTN"
                @click.stop="emit('preview', entry)"
                :title="t('file.preview')"
              >
                <Eye :size="14" />
              </button>
              <button
                class="btn btn-ghost btn-xs"
                :data-testid="T.DOWNLOAD_BTN"
                @click.stop="emit('download', entry)"
                :title="t('file.download')"
              >
                <Download :size="14" />
              </button>
            </template>
            <button
              class="btn btn-ghost btn-xs"
              data-testid="storage-rename-btn"
              @click.stop="emit('rename', entry)"
              :title="t('file.rename')"
            >
              <Pen :size="14" />
            </button>
            <button
              class="btn btn-ghost btn-xs text-error"
              :data-testid="entry.kind === 'file' ? T.DELETE_BTN : undefined"
              @click.stop="emit('delete', entry)"
              :title="t('file.delete')"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
