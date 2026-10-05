<script setup lang="ts">
import { useSearch, type SearchOptions, type SearchResult, type SearchSourceLike } from '@aiao/rxdb-plugin-search-vue';
import { readonly, ref } from 'vue';

const props = defineProps<{ source: SearchSourceLike; label?: string }>();
const emit = defineEmits<{ change: [query: string]; select: [result: SearchResult] }>();
const options = ref<SearchOptions>({ pageSize: 2, debounce: 0 });
const { query, results, state, error, hasMore, loadMore, clear, retry } = useSearch(() => props.source, readonly(options));
</script>

<template>
  <input v-model="query" :aria-label="props.label" @input="emit('change', query)" />
  <output>{{ state }}</output>
  <p v-if="error">{{ error.message }}</p>
  <button v-for="result in results" :key="result.id" @click="emit('select', result)">{{ result.snippet }}</button>
  <button :disabled="!hasMore" @click="loadMore">下一页</button>
  <button @click="clear">清空</button>
  <button @click="retry">重试</button>
</template>
