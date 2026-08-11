<script lang="ts" setup>
/**
 * OPFS 文件列表组件
 */
import { Download, Eye, Trash2 } from '@lucide/vue';
import { ref } from 'vue';
import {
  canPreviewFile,
  formatDate,
  formatFileSize,
  getFileIcon,
  getFileIconColor,
  type OPFSFileEntry
} from '../utils/opfs-utils';

defineProps<{
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

const clickTimeout = ref<number | null>(null);

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
  <table class="table-zebra table select-none">
    <thead>
      <tr>
        <th>名称</th>
        <th class="w-32">大小</th>
        <th class="w-40">修改时间</th>
        <th class="w-24">操作</th>
      </tr>
    </thead>
    <tbody>
      <tr
        class="cursor-pointer"
        v-for="entry in entries"
        :class="selectedPaths.has(entry.path) ? 'bg-primary/10' : 'hover:bg-base-200'"
        :data-entry-path="entry.path"
        :key="entry.path"
        @click="handleEntryClick(entry, $event)"
        @contextmenu="handleContextMenu($event, entry)"
        @dblclick="handleDoubleClick(entry)"
      >
        <td class="font-medium">
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
        <td class="text-base-content/60 text-sm">
          {{ entry.kind === 'file' ? formatFileSize(entry.size || 0) : '-' }}
        </td>
        <td class="text-base-content/60 text-sm">
          {{ formatDate(entry.lastModified) }}
        </td>
        <td>
          <div class="flex items-center gap-1">
            <button
              class="btn btn-ghost btn-xs"
              v-if="entry.kind === 'file' && canPreviewFile(entry)"
              @click.stop="emit('preview', entry)"
              title="预览"
            >
              <Eye :size="14" />
            </button>
            <button
              class="btn btn-ghost btn-xs"
              v-if="entry.kind === 'file'"
              @click.stop="emit('download', entry)"
              title="下载"
            >
              <Download :size="14" />
            </button>
            <button
              class="btn btn-ghost btn-xs text-error"
              @click.stop="emit('delete', entry)"
              title="删除"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
