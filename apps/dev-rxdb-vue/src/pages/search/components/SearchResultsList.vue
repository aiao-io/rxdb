<script lang="ts" setup>
import type { SearchResult, SearchState } from '@aiao/rxdb-plugin-search';
import { collectionBadgeClass, localizeCollection, localizeField } from '../types';

defineProps<{
  results: readonly SearchResult[];
  displayState: SearchState | 'error';
  displayError: string | null;
  resultAnnouncement: string;
  query: string;
  hasMore: boolean;
  mutationBusy: boolean;
}>();

const emit = defineEmits<{
  (e: 'load-more'): void;
  (e: 'retry'): void;
  (e: 'update-result', result: SearchResult): void;
  (e: 'remove-result', result: SearchResult): void;
}>();
</script>

<template>
  <section
    class="flex flex-col gap-2"
    aria-live="polite"
    data-testid="search-results"
  >
    <div
      :class="`rounded-box border-base-300 bg-base-100 flex items-center gap-2 border px-3 py-2 text-sm${
        displayState === 'loading' ? 'border-primary'
        : displayState === 'error' ? 'border-warning'
          : ''
      }`"
    >
      <span
        v-if="displayState === 'loading'"
        class="loading loading-spinner loading-xs text-primary"
      />
      <span
        v-else-if="displayState === 'error'"
        class="text-warning"
      >⚠</span>
      <span
        v-else-if="displayState === 'empty'"
        class="text-base-content/50"
      >∅</span>
      <span
        v-else-if="displayState === 'success'"
        class="text-success"
      >✓</span>
      <span
        v-else
        class="text-base-content/50"
      >⌕</span>
      <span
        class="text-base-content/80"
        data-testid="search-results-count"
        role="status"
      >
        {{ resultAnnouncement }}
      </span>
      <span class="text-base-content/50 text-xs">·</span>
      <span
        class="text-base-content/60 text-xs"
        data-testid="search-state"
      >{{ displayState }}</span>
      <span
        v-if="displayError"
        class="text-warning text-xs"
      >— {{ displayError }}</span>
    </div>

    <p
      v-if="displayState === 'empty' && query.trim()"
      class="text-sm italic"
      data-testid="search-empty"
    >
      未找到 "{{ query }}" 相关结果
    </p>

    <ul class="flex flex-col gap-2">
      <li
        v-for="r in results"
        :key="`${r.collection}:${r.id}`"
        class="group card bg-base-200 hover:bg-base-300 relative p-3 transition-colors"
        :data-collection="r.collection"
        :data-id="r.id"
        :data-rank="r.rank"
        data-testid="search-result"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
              <span :class="`badge badge-sm ${collectionBadgeClass(r.collection)}`">
                {{ localizeCollection(r.collection) }}
              </span>
              <span class="text-base-content/80 font-mono">#{{ r.id }}</span>
              <span class="text-base-content/30">·</span>
              <span class="text-base-content/60">
                匹配：<span class="text-base-content/90 font-medium">{{ localizeField(r.matchedField) }}</span>
              </span>
              <span class="text-base-content/30">·</span>
              <span class="badge badge-outline badge-sm font-mono">相关度 {{ (-r.rank).toFixed(4) }}</span>
            </div>
            <p class="mt-1.5 text-sm leading-relaxed break-words">{{ r.snippet }}</p>
          </div>
          <div
            v-if="r.collection === 'article' || r.collection === 'comment'"
            class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          >
            <button
              class="btn btn-xs btn-ghost"
              :data-testid="`search-result-update-${r.collection}`"
              :disabled="mutationBusy"
              aria-label="更新"
              title="更新"
              type="button"
              @click="emit('update-result', r)"
            >
              <svg
                fill="none"
                height="12"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                width="12"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </button>
            <button
              class="btn btn-xs btn-ghost text-error"
              :data-testid="`search-result-delete-${r.collection}`"
              :disabled="mutationBusy"
              aria-label="删除"
              title="删除"
              type="button"
              @click="emit('remove-result', r)"
            >
              <svg
                fill="none"
                height="12"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                width="12"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </li>
    </ul>

    <button
      v-if="hasMore"
      class="btn btn-sm"
      data-testid="search-load-more"
      type="button"
      @click="emit('load-more')"
    >
      加载更多
    </button>

    <button
      v-if="displayState === 'error'"
      class="btn btn-sm btn-warning"
      data-testid="search-retry"
      type="button"
      @click="emit('retry')"
    >
      重试
    </button>
  </section>
</template>
