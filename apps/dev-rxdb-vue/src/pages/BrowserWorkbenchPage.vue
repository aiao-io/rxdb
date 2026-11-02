<script setup lang="ts">
import { BrowserWorkbench } from '@aiao/browser-workbench-vue';
import { createRxDBWorkbenchCatalog } from '@aiao/browser-workbench/rxdb-catalog';
import { useRxDB } from '@aiao/rxdb-vue';

const options = { catalog: createRxDBWorkbenchCatalog(useRxDB()) };
</script>

<template>
  <div
    class="fixed inset-0 z-50"
    data-testid="browser-workbench"
  >
    <BrowserWorkbench :options="options" />
  </div>
</template>
