<script setup lang="ts">
import { useCountDescendants, useFindDescendants } from '@aiao/rxdb-plugin-tree-vue';
import { NumericNode } from './models.js';
const props = defineProps<{ rootId: number }>();
const emit = defineEmits<{ selected: [id: number] }>();
const descendants = useFindDescendants(NumericNode, () => ({ entityId: props.rootId }));
const count = useCountDescendants(NumericNode, () => ({ entityId: props.rootId }));
</script>

<template>
  <button @click="emit('selected', 'wrong')">bad emit</button>
  <p v-for="node in descendants.value" :key="node.id">{{ node.missingField }}</p>
  <p>{{ count.value.toUpperCase() }}</p>
</template>
