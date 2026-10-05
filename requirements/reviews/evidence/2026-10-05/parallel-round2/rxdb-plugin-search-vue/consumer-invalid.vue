<script setup lang="ts">
import { useSearch, type SearchResult, type SearchSourceLike } from '@aiao/rxdb-plugin-search-vue';

const props = defineProps<{ source: SearchSourceLike; pageSize: number }>();
const emit = defineEmits<{ change: [query: string]; select: [result: SearchResult] }>();
const { query, results, state } = useSearch(() => props.source, { pageSize: props.pageSize });
</script>

<template>
  <input v-model="query" @input="emit('change', 42)" />
  <output>{{ state.missingField }}</output>
  <button v-for="result in results" :key="result.id" @click="emit('select', 'not a result')">{{ result.missingField }}</button>
</template>
