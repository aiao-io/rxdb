<script setup lang="ts">
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-vue';
import type { CommitResult } from '@aiao/rxdb-plugin-working-tree';

const tree = useWorkingTree();
const emit = defineEmits<{ saved: [result: CommitResult] }>();
tree.statusState.value = { phase: 'idle' };
tree.switchBranch(42);
</script>

<template>
  <button @click="emit('saved', '不是 CommitResult')">提交</button>
</template>
