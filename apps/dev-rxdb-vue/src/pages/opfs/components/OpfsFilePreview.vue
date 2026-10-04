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
/**
 * RV-057：预览加载纪元。
 *
 * @remarks
 * `currentEntryPath` 只在 `previewFile()` 返回后被复核过一次；Blob.text() 等更晚的
 * 异步阶段、以及同路径重新打开的场景都不会再比对它——迟到的旧结果能直接盖掉新预览
 * 已经写好的状态。改用单调递增的纪元号：每次真正发起新加载时递增并快照，此后每个
 * 异步阶段结束、写 ref 之前都重新核对快照是否仍等于当前纪元，与 Angular 绑定同一思路。
 */
let loadEpoch = 0;

watch(
  () => props.entry?.path,
  async entryPath => {
    if (entryPath === currentEntryPath) return;
    currentEntryPath = entryPath || null;

    if (!props.entry || props.entry.kind === 'directory') {
      loadEpoch++; // 让任何仍在进行中的加载过期
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
  loadEpoch++;
  cleanupBlobUrl();
});

function cleanupBlobUrl() {
  if (content.value && content.value.startsWith('blob:')) {
    URL.revokeObjectURL(content.value);
  }
}

function handleClose() {
  loadEpoch++; // 关闭也让任何仍在进行中的加载过期
  cleanupBlobUrl();
  content.value = null;
  loading.value = false;
  emit('close');
}

async function loadFileContent(entry: OPFSFileEntry) {
  // RV-057：每次真正发起新加载都获得一个新纪元；同路径重新打开也会拿到
  // 不同的纪元号，不再依赖路径字符串判断「是不是同一次打开」。
  const epoch = ++loadEpoch;
  const isCurrent = () => epoch === loadEpoch;

  loading.value = true;
  cleanupBlobUrl();
  content.value = null;
  textContent.value = '';
  fileType.value = 'unknown';

  try {
    const preview = await opfs.previewFile(entry);
    // 第一个异步阶段结束：纪元已过期，清理刚创建的 blob URL 并放弃
    if (!isCurrent()) {
      if (preview && preview.data instanceof Blob) {
        URL.revokeObjectURL(URL.createObjectURL(preview.data));
      }
      return;
    }

    if (preview) {
      let type = getFileType(entry);

      if (preview.data instanceof Blob) {
        if (type === 'unknown') {
          const file = new File([preview.data], entry.name);
          const isText = await isTextFile(file);
          // 文本探测也是一个异步阶段，结束后同样要复核纪元
          if (!isCurrent()) return;
          if (isText) type = 'text';
        }

        fileType.value = type;

        if (type === 'code' || type === 'text') {
          const text = await preview.data.text();
          // RV-057：Blob.text() 才是真正迟到的那一步——不复核纪元就写入，
          // 会把「新文件已经显示好的内容」覆盖成这份迟到的旧文本。
          if (!isCurrent()) return;
          textContent.value = text;
          if (type === 'code') codeLanguage.value = getCodeLanguage(entry.name);
        } else if (type === 'image' || type === 'audio' || type === 'video') {
          const url = URL.createObjectURL(preview.data);
          if (!isCurrent()) {
            URL.revokeObjectURL(url);
            return;
          }
          content.value = url;
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
    if (!isCurrent()) return;
    /* ignore */
  } finally {
    if (isCurrent()) loading.value = false;
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
            >{{ textContent }}</pre>
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
