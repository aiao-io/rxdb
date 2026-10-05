<script setup lang="ts">
import { useCountAncestors, useFindDescendants } from '@aiao/rxdb-plugin-tree-vue';
import { NumericNode } from './valid.mjs';

const props = defineProps<{ rootId: string }>();
const emit = defineEmits<{ selected: [id: number] }>();
const descendants = useFindDescendants(NumericNode, () => ({ entityId: props.rootId }));
const count = useCountAncestors(NumericNode, { entityId: 1 });
</script>

<template>
  <button
    v-for="node in descendants.value"
    :key="node.id"
    @click="emit('selected', 'wrong-id')"
    >{{ node.missingField }}</button
  >
  <span>{{ count.value.toUpperCase() }}</span>
</template>
