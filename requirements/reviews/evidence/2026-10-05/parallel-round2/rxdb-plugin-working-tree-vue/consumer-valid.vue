<script setup lang="ts">
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-vue';
import type { CommitOptions, CommitResult } from '@aiao/rxdb-plugin-working-tree';

const props = defineProps<{ message: string; options: CommitOptions }>();
const emit = defineEmits<{ saved: [result: CommitResult] }>();
const tree = useWorkingTree();
const { statusState } = tree;
const save = async (): Promise<void> => {
  emit('saved', await tree.commit(props.message, props.options));
};
</script>

<template>
  <span v-if="statusState.phase === 'success'">{{ statusState.value.entryCount }}</span>
  <span v-else-if="statusState.phase === 'empty'">没有未提交改动</span>
  <button :disabled="tree.commitState.value.phase === 'loading'" @click="save">提交</button>
</template>
