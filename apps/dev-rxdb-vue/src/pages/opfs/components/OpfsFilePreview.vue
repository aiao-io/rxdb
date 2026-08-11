<script lang="ts" setup>
/**
 * OPFS 文件预览组件
 */
import { CodeEditor } from '@aiao/code-editor-vue';
import { X } from '@lucide/vue';
import { onUnmounted, ref, watch } from 'vue';
import { useOpfsService } from '../composables/useOpfsService';
import { getCodeLanguage, getFileType, isTextFile, type OPFSFileEntry } from '../utils/opfs-utils';

const props = defineProps<{
  entry: OPFSFileEntry | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const opfs = useOpfsService();
const loading = ref(false);
const content = ref<string | null>(null);
const textContent = ref('');
const fileType = ref<'image' | 'audio' | 'video' | 'code' | 'text' | 'unknown'>('unknown');
const codeLanguage = ref('javascript');
let currentEntryPath: string | null = null;

watch(
  () => props.entry?.path,
  async entryPath => {
    if (entryPath === currentEntryPath) return;
    currentEntryPath = entryPath || null;

    if (!props.entry || props.entry.kind === 'directory') {
      cleanupBlobUrl();
      content.value = null;
      textContent.value = '';
      loading.value = false;
      return;
    }

    await loadFileContent(props.entry);
  },
  { immediate: true }
);

onUnmounted(() => {
  cleanupBlobUrl();
});

function cleanupBlobUrl() {
  if (content.value && content.value.startsWith('blob:')) {
    URL.revokeObjectURL(content.value);
  }
}

function handleClose() {
  cleanupBlobUrl();
  content.value = null;
  loading.value = false;
  emit('close');
}

async function loadFileContent(entry: OPFSFileEntry) {
  loading.value = true;
  cleanupBlobUrl();
  content.value = null;
  textContent.value = '';
  fileType.value = 'unknown';

  try {
    const preview = await opfs.previewFile(entry);
    if (currentEntryPath !== entry.path) return;

    if (preview) {
      let type = getFileType(entry);

      if (preview.data instanceof Blob) {
        if (type === 'unknown') {
          const file = new File([preview.data], entry.name);
          const isText = await isTextFile(file);
          if (isText) type = 'text';
        }

        fileType.value = type;

        if (type === 'code' || type === 'text') {
          textContent.value = await preview.data.text();
          if (type === 'code') codeLanguage.value = getCodeLanguage(entry.name);
        } else if (type === 'image' || type === 'audio' || type === 'video') {
          content.value = URL.createObjectURL(preview.data);
        }
      } else if (typeof preview.data === 'string') {
        fileType.value = type;
        if (type === 'code' || type === 'text') {
          textContent.value = preview.data;
          if (type === 'code') codeLanguage.value = getCodeLanguage(entry.name);
        } else {
          content.value = preview.data;
        }
      }
    }
  } catch {
    /* ignore */
  } finally {
    if (currentEntryPath === entry.path) loading.value = false;
  }
}
</script>

<template>
  <div
    class="modal modal-open"
    v-if="entry"
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
              您的浏览器不支持音频播放
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
              您的浏览器不支持视频播放
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
            无法预览此文件
          </div>
        </template>
      </div>

      <div class="modal-action">
        <button
          class="btn btn-sm"
          @click="handleClose"
          type="button"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>
