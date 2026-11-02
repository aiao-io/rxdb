<script setup lang="ts">
import { BrowserWorkbench } from '@aiao/browser-workbench-vue';
import { createRxDBWorkbenchCatalog } from '@aiao/browser-workbench/rxdb-catalog';
import { useRxDB } from '@aiao/rxdb-vue';

const options = { catalog: createRxDBWorkbenchCatalog(useRxDB()) };
</script>

<template>
  <div
    class="h-full min-h-0 w-full"
    data-testid="browser-workbench"
  >
    <BrowserWorkbench :options="options" />
  </div>
</template>
