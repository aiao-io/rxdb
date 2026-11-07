<script setup lang="ts">
import { useAdminStore } from '@aiao/rxdb-admin-vue';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useSearch } from '@aiao/rxdb-plugin-search-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { computed } from 'vue';
import { entityDisplayName, fieldDisplayName } from '../entities/entity-labels';
import { visibleEntityEntries } from '../entities/entity-registry';
import { SEARCH_PAGE_SIZE_KEY, workbenchShell } from '../shell/workbench-shell';
const db = useRxDB();
const { t } = useI18n();
const entries = visibleEntityEntries(db.config.entities);
const preferences = useAdminStore(workbenchShell.preferences);
const options = computed(() => ({
  debounce: 300,
  pageSize: preferences.value.extension[SEARCH_PAGE_SIZE_KEY] as number,
  snippetLength: 64
}));
const { query, results, state, error, hasMore, loadMore } = useSearch(db, options);
function resultLabel(entity: string, field: string): string {
  const entry = entries.find(candidate => candidate.name === entity);
  return entry ? `${entityDisplayName(entry, t)} · ${fieldDisplayName(entry, field, t)}` : `${entity} · ${field}`;
}
</script>
<template>
  <div
    class="page-host gap-3 overflow-auto p-6"
    data-testid="search-page"
  >
    <h2 class="text-base font-semibold">{{ t('search.title') }}</h2>
    <input
      v-model="query"
      class="input w-full max-w-md"
      :placeholder="t('search.placeholder')"
      :aria-label="t('search.title')"
      data-testid="search-input"
    />
    <div
      class="flex flex-col gap-2"
      data-testid="search-results"
    >
      <span
        v-if="state === 'loading'"
        class="text-base-content/60 text-sm"
        >{{ t('search.loading') }}</span
      >
      <span
        v-if="state === 'error'"
        class="text-error text-sm"
        role="alert"
        >{{ t('search.failed', { message: error?.message ?? '' }) }}</span
      >
      <span
        v-if="state === 'empty' && query.trim() !== ''"
        class="text-base-content/60 text-sm"
        >{{ t('search.empty') }}</span
      >
      <div
        v-for="result in results"
        :key="`${result.collection}:${result.id}`"
        class="bg-base-200 rounded-box flex flex-col gap-1 p-3"
        data-testid="search-result"
      >
        <span class="text-sm font-medium">{{ resultLabel(result.entity, result.matchedField) }}</span
        ><span class="text-base-content/70 text-sm">{{ result.snippet }}</span>
      </div>
    </div>
    <button
      v-if="hasMore"
      class="btn btn-outline w-fit"
      type="button"
      :disabled="state !== 'success'"
      @click="loadMore()"
      >{{ t(state === 'loading' ? 'search.loadingMore' : 'search.loadMore') }}</button
    >
  </div>
</template>
