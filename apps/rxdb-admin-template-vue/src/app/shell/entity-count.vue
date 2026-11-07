<script setup lang="ts">
import { useRxDB } from '@aiao/rxdb-vue';
import { onScopeDispose, ref } from 'vue';
import type { WorkbenchEntityEntry } from '../entities/entity-registry';
import CountValue from './count-value.vue';
defineProps<{ entry: WorkbenchEntityEntry }>();
const connected = ref(false);
const subscription = useRxDB()
  .adapterConnected$('sqlite-wasm')
  .subscribe(value => (connected.value = value));
onScopeDispose(() => subscription.unsubscribe());
</script>
<template>
  <CountValue
    v-if="connected"
    :entry="entry"
  />
</template>
