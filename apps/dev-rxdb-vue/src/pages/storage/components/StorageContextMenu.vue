<script lang="ts" setup>
import { STORAGE_TESTID } from '@aiao/utils';
import { Download, Edit3, Eye, FolderOpen, Trash2 } from '@lucide/vue';
import type { StorageBrowserItem } from '../utils/storage-utils';

defineProps<{
  show: boolean;
  x: number;
  y: number;
  entry: StorageBrowserItem | null;
}>();

const emit = defineEmits<{
  (e: 'action', action: 'view' | 'download' | 'rename' | 'delete'): void;
}>();

const T = STORAGE_TESTID;
</script>

<template>
  <div
    class="menu border-base-content/10 bg-base-300/95 fixed z-50 w-40 rounded-lg border p-1.5 text-sm shadow-2xl"
    v-if="show && entry"
    :data-testid="T.CONTEXT_MENU"
    :style="{
      left: x + 'px',
      top: y + 'px',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)'
    }"
    @click.stop
  >
    <li>
      <button
        class="w-full gap-2 px-2 py-1.5 text-left"
        :data-testid="T.CONTEXT_VIEW"
        @click="emit('action', 'view')"
        type="button"
      >
        <Eye
          v-if="entry.kind === 'file'"
          :size="14"
        />
        <FolderOpen
          v-else
          :size="14"
        />
        <span>{{ entry.kind === 'file' ? 'View' : 'Open' }}</span>
      </button>
    </li>
    <li>
      <button
        class="w-full gap-2 px-2 py-1.5 text-left"
        :data-testid="T.CONTEXT_DOWNLOAD"
        @click="emit('action', 'download')"
        type="button"
      >
        <Download :size="14" />
        <span>{{ entry.kind === 'file' ? 'Download' : 'Download ZIP' }}</span>
      </button>
    </li>
    <li>
      <button
        class="w-full gap-2 px-2 py-1.5 text-left"
        :data-testid="T.CONTEXT_RENAME"
        @click="emit('action', 'rename')"
        type="button"
      >
        <Edit3 :size="14" />
        <span>Rename</span>
      </button>
    </li>
    <li>
      <button
        class="text-error w-full gap-2 px-2 py-1.5 text-left"
        :data-testid="T.CONTEXT_DELETE"
        @click="emit('action', 'delete')"
        type="button"
      >
        <Trash2 :size="14" />
        <span>Delete</span>
      </button>
    </li>
  </div>
</template>
