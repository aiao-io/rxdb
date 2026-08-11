<script lang="ts" setup>
import { CodeEditor } from '@aiao/code-editor-vue';
import { injectRxDB } from '@aiao/rxdb-vue';
import { STORAGE_TESTID } from '@aiao/utils';
import { X } from '@lucide/vue';
import { onUnmounted, ref, watch } from 'vue';
import { getCodeLanguage, getFileType, isTextBlob, type StorageBrowserItem } from '../utils/storage-utils';

const props = defineProps<{
  entry: StorageBrowserItem | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const rxdb = injectRxDB()!;
const loading = ref(false);
const loadError = ref('');
const content = ref<string | null>(null);
const textContent = ref('');
const fileType = ref<'image' | 'audio' | 'video' | 'code' | 'text' | 'unknown'>('unknown');
const codeLanguage = ref('javascript');
const T = STORAGE_TESTID;
let currentEntryPath: string | null = null;
let loadingEntryPath: string | null = null;

watch(
  () => props.entry?.path || null,
  async entryPath => {
    if (entryPath === currentEntryPath) return;
    currentEntryPath = entryPath;

    if (!props.entry || props.entry.kind === 'directory' || !props.entry.meta) {
      resetPreviewState();
      loadingEntryPath = null;
      return;
    }

    if (loadingEntryPath === entryPath) {
      return;
    }

    await loadFileContent(props.entry);
  },
  { immediate: true }
);

onUnmounted(() => {
  cleanupContentUrl();
});

function handleClose() {
  resetPreviewState();
  emit('close');
}

async function loadFileContent(entry: StorageBrowserItem) {
  if (!entry.meta) {
    return;
  }

  const entryPath = entry.path;
  loadingEntryPath = entryPath;
  loading.value = true;
  loadError.value = '';
  cleanupContentUrl();
  textContent.value = '';
  fileType.value = 'unknown';

  try {
    const blob = await rxdb.storage.read(entry.meta.id);

    if (currentEntryPath !== entryPath) {
      return;
    }

    let type = getFileType(entry);
    if (type === 'unknown' && (await isTextBlob(blob))) {
      type = 'text';
    }

    fileType.value = type;

    if (type === 'code' || type === 'text') {
      textContent.value = await blob.text();
      if (type === 'code') {
        codeLanguage.value = getCodeLanguage(entry.name);
      }
    } else if (type === 'image' || type === 'audio' || type === 'video') {
      content.value = URL.createObjectURL(blob);
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (loadingEntryPath === entryPath) {
      loading.value = false;
      loadingEntryPath = null;
    }
  }
}

function cleanupContentUrl() {
  if (content.value && content.value.startsWith('blob:')) {
    URL.revokeObjectURL(content.value);
  }
  content.value = null;
}

function resetPreviewState() {
  cleanupContentUrl();
  loading.value = false;
  loadError.value = '';
  textContent.value = '';
  fileType.value = 'unknown';
}
</script>

<template>
  <div
    class="modal modal-open"
    v-if="entry"
    :data-testid="T.PREVIEW_MODAL"
    @click="handleClose"
    @keydown.escape="handleClose"
  >
    <div
      class="modal-box flex h-[80vh] max-w-4xl flex-col"
      @click.stop
    >
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-bold">{{ entry.name }}</h3>
        <button
          class="btn btn-sm btn-circle btn-ghost"
          :data-testid="T.PREVIEW_CLOSE"
          @click="handleClose"
          type="button"
        >
          <X :size="16" />
        </button>
      </div>

      <div class="flex flex-1 flex-col overflow-auto">
        <div
          class="flex h-full items-center justify-center"
          v-if="loading"
        >
          <span class="loading loading-spinner loading-lg" />
        </div>
        <div
          class="text-base-content/40 py-8 text-center"
          v-else-if="loadError"
        >
          {{ loadError }}
        </div>
        <template v-else>
          <div
            class="overflow-auto p-4"
            v-if="fileType === 'image' && content"
          >
            <img
              class="w-full"
              :alt="entry.name"
              :src="content"
            />
          </div>
          <div
            class="flex items-center justify-center p-4"
            v-else-if="fileType === 'audio' && content"
          >
            <audio
              class="w-full max-w-xl"
              :src="content"
              controls
            >
              Audio preview is not supported
            </audio>
          </div>
          <div
            class="flex h-full items-center justify-center p-4"
            v-else-if="fileType === 'video' && content"
          >
            <video
              class="max-h-full max-w-full"
              :src="content"
              controls
            >
              Video preview is not supported
            </video>
          </div>
          <div
            class="h-full overflow-auto"
            v-else-if="fileType === 'code' && textContent"
          >
            <CodeEditor
              class="h-full"
              :language="codeLanguage"
              :line-wrapping="false"
              :readonly="true"
              :value="textContent"
              theme="dark"
            />
          </div>
          <pre
            class="bg-base-200 overflow-auto rounded p-4 text-xs"
            v-else-if="fileType === 'text' && textContent"
            >{{ textContent }}</pre
          >
          <div
            class="text-base-content/40 py-8 text-center"
            v-else
          >
            Unable to preview this file
          </div>
        </template>
      </div>

      <div class="modal-action">
        <button
          class="btn btn-sm"
          @click="handleClose"
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
