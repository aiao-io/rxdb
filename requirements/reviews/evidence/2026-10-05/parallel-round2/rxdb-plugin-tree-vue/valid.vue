<script setup lang="ts">
import { computed, readonly, ref } from 'vue';
import {
  useCountAncestors,
  useCountDescendants,
  useFindAncestors,
  useFindDescendants
} from '@aiao/rxdb-plugin-tree-vue';
import { NumericNode } from './valid.mjs';

const props = defineProps<{ rootId: number }>();
const emit = defineEmits<{ selected: [id: number] }>();
const options = computed(() => ({ entityId: props.rootId, level: 2 }));
const fixed = readonly(ref({ entityId: 1, level: 1 }));
const descendants = useFindDescendants(NumericNode, options);
const descendantCount = useCountDescendants(NumericNode, () => ({ entityId: props.rootId }));
const ancestors = useFindAncestors(NumericNode, fixed);
const ancestorCount = useCountAncestors(NumericNode, options);
</script>

<template>
  <p
    v-if="descendants.error"
    role="alert"
    >{{ descendants.error.message }}</p
  >
  <section :aria-busy="descendants.isLoading">
    <button
      v-for="node in descendants.value"
      :key="node.id"
      @click="emit('selected', node.id)"
      >{{ node.name }}</button
    >
    <span>{{ descendantCount.value }} / {{ ancestorCount.value }} / {{ ancestors.value.length }}</span>
  </section>
</template>
