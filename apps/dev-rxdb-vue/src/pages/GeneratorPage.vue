<script lang="ts" setup>
import { CodeEditor } from '@aiao/code-editor-vue';
import { EntityMetadataOptions, PropertyType } from '@aiao/rxdb';
import { zipSync } from 'fflate';
import { computed, ref, watch } from 'vue';
import { useTheme } from '../app/composables/useTheme';
import { generateSourceState } from './generator-state';

const { currentThemeLightDark: editorTheme } = useTheme();

const demos: EntityMetadataOptions[] = [
  {
    name: 'Todo',
    displayName: 'Todo',
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'completed', type: PropertyType.boolean, default: false }
    ]
  },
  {
    name: 'Menu',
    displayName: 'Menu',
    repository: 'TreeRepository',
    extends: ['TreeAdjacencyListEntityBase', 'EntityBase'],
    properties: [
      {
        name: 'title',
        type: PropertyType.string
      }
    ]
  }
];

const selectedDemoIndex = ref(0);
const json = ref(JSON.stringify(demos[0], null, 2));
const selectedSourceIndex = ref(0);

// Auto set json when demo changes
watch(selectedDemoIndex, index => {
  json.value = JSON.stringify(demos[index], null, 2);
});

const generationState = computed(() => generateSourceState(json.value));
const sources = computed(() => generationState.value.sources);
const generationError = computed(() => generationState.value.error);

// Reset selected source index if out of bounds
watch(sources, newSources => {
  if (selectedSourceIndex.value >= newSources.length) {
    selectedSourceIndex.value = 0;
  }
});

function downloadFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function download() {
  if (generationError.value || sources.value.length === 0) return;

  const data: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();
  sources.value.forEach(source => {
    data[source.getFilePath()] = encoder.encode(source.getText());
  });

  const zipped = zipSync(data);
  const bytes = new Uint8Array(zipped.length);
  bytes.set(zipped);
  const blob = new Blob([bytes.buffer], { type: 'application/zip' });
  downloadFile('rxdb-client.zip', blob);
}
</script>

<template>
  <div class="flex h-full w-full overflow-hidden">
    <!-- Left Panel: JSON Editor -->
    <div class="border-base-300 flex w-2/5 flex-col border-r">
      <div
        class="tabs tabs-border bg-base-100"
        role="tablist"
      >
        <a
          class="tab"
          v-for="(demo, index) in demos"
          :class="{ 'tab-active': selectedDemoIndex === index }"
          :key="index"
          @click="selectedDemoIndex = index"
          role="tab"
        >
          {{ demo.name }}
        </a>
      </div>
      <div class="flex-1 overflow-hidden">
        <CodeEditor
          v-model:value="json"
          :theme="editorTheme"
          data-testid="generator-input-editor"
          language="JSON"
        />
      </div>
    </div>

    <!-- Right Panel: Generated Code -->
    <div class="bg-base-100 relative flex w-3/5 flex-col">
      <button
        class="btn btn-sm btn-primary absolute top-2 right-2 z-10"
        :disabled="generationError !== null || sources.length === 0"
        @click="download"
        data-testid="generator-download"
      >
        生成并下载
      </button>

      <div
        class="tabs tabs-lifted w-full overflow-x-auto pt-2 pr-32 pl-2"
        role="tablist"
      >
        <a
          class="tab whitespace-nowrap"
          v-for="(source, index) in sources"
          :class="{ 'tab-active': selectedSourceIndex === index }"
          :key="index"
          :title="source.getFilePath()"
          @click="selectedSourceIndex = index"
          role="tab"
        >
          {{ source.getFilePath().split('/').pop() }}
        </a>
      </div>

      <div class="bg-base-100 border-base-300 flex-1 overflow-hidden border-t">
        <div
          class="alert alert-error m-4"
          v-if="generationError"
          role="alert"
        >
          {{ generationError.message }}
        </div>
        <CodeEditor
          v-else-if="sources.length > 0"
          :language="sources[selectedSourceIndex]?.getFilePath().endsWith('.ts') ? 'TypeScript' : 'JavaScript'"
          :theme="editorTheme"
          :value="sources[selectedSourceIndex]?.getText() || ''"
          data-testid="generator-output-editor"
          readonly
        />
      </div>
    </div>
  </div>
</template>
