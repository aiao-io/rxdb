<script lang="ts" setup>
import type { OrderBy } from '@aiao/rxdb';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import type { EntityListController, EntityListSnapshot } from '@aiao/rxdb-model/headless';
import { computed } from 'vue';
import { errorMessage, type ArticleRecord } from './article-model';

/** 可排序列：表头按钮循环 无序 → 升序 → 降序；label 存目录键，渲染时经 t() 翻译。 */
const COLUMNS = [
  { field: 'title', label: 'page.headless.titleColumn' },
  { field: 'category', label: 'page.headless.categoryColumn' },
  { field: 'viewCount', label: 'page.headless.viewCountColumn' }
] as const;

const props = defineProps<{
  controller: EntityListController<ArticleRecord>;
  snapshot: EntityListSnapshot<ArticleRecord>;
}>();
const emit = defineEmits<{ edit: [record: ArticleRecord] }>();

const { t } = useI18n();

const sortOf = (field: string): 'ascending' | 'descending' | 'none' => {
  const sort = props.snapshot.sorts.find((item: OrderBy) => item.field === field)?.sort;
  if (sort === undefined) return 'none';
  return sort === 'asc' ? 'ascending' : 'descending';
};

const toggleSort = (field: string): void => {
  const current = sortOf(field);
  if (current === 'none') props.controller.setSorts([{ field, sort: 'asc' }]);
  else if (current === 'ascending') props.controller.setSorts([{ field, sort: 'desc' }]);
  else props.controller.setSorts([]);
};

const pages = computed(() =>
  props.snapshot.total === undefined ?
    undefined
  : Math.max(1, Math.ceil(props.snapshot.total / props.snapshot.pageSize))
);
const canEdit = computed(() => props.snapshot.capabilities?.canEdit !== false);
const canDelete = computed(() => props.snapshot.capabilities?.canDelete !== false);
const swallow = (): undefined => undefined;
</script>

<template>
  <section
    class="hl-section"
    aria-labelledby="hl-list-title"
    data-testid="headless-list"
  >
    <h2 id="hl-list-title">{{ t('page.headless.listTitle') }}</h2>
    <div class="hl-actions">
      <button
        type="button"
        @click="controller.refresh().catch(swallow)"
        >{{ t('page.headless.refresh') }}</button
      >
      <button
        type="button"
        :disabled="snapshot.selectedIds.length === 0 || !canDelete"
        @click="controller.remove(snapshot.selectedIds).catch(swallow)"
      >
        {{ t('page.headless.deleteSelected', { count: snapshot.selectedIds.length }) }}
      </button>
    </div>
    <table
      class="hl-table"
      :aria-label="t('page.headless.articleTable')"
      :aria-busy="snapshot.loading"
    >
      <thead>
        <tr>
          <th scope="col"><span class="hl-sr">{{ t('page.headless.selectColumn') }}</span></th>
          <th
            v-for="column in COLUMNS"
            :key="column.field"
            scope="col"
            :aria-sort="sortOf(column.field)"
          >
            <button
              type="button"
              @click="toggleSort(column.field)"
              >{{ t(column.label) }}</button
            >
          </th>
          <th scope="col">{{ t('page.headless.actionsColumn') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="snapshot.records.length === 0 && !snapshot.loading">
          <td
            :colspan="COLUMNS.length + 2"
            data-testid="list-empty"
            >{{ t('common.noData') }}</td
          >
        </tr>
        <tr
          v-for="record in snapshot.records"
          :key="record.id"
          data-testid="list-row"
          :data-id="record.id"
        >
          <td>
            <input
              type="checkbox"
              :aria-label="t('page.headless.selectRow', { title: record.title })"
              :checked="snapshot.selectedIds.includes(record.id)"
              @change="controller.toggleSelection(record.id)"
            />
          </td>
          <td>{{ record.title }}</td>
          <td>{{ record.category }}</td>
          <td>{{ record.viewCount ?? '' }}</td>
          <td>
            <button
              type="button"
              :disabled="!canEdit"
              :aria-label="t('page.headless.editRow', { title: record.title })"
              @click="emit('edit', record)"
            >
              {{ t('common.edit') }}
            </button>
            <button
              type="button"
              :disabled="!canDelete"
              :aria-label="t('page.headless.deleteRow', { title: record.title })"
              @click="controller.remove([record.id]).catch(swallow)"
            >
              {{ t('common.delete') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p
      v-if="snapshot.error !== null"
      class="hl-error"
      role="alert"
      data-testid="list-error"
    >
      {{ errorMessage(snapshot.error) }}
    </p>
    <div class="hl-pager">
      <button
        type="button"
        :disabled="snapshot.page === 0"
        @click="controller.setPage(snapshot.page - 1)"
        >{{ t('page.headless.previousPage') }}</button
      >
      <span
        role="status"
        data-testid="list-page-info"
      >
        {{ t('page.headless.pageInfo', { page: snapshot.page + 1, pages: pages ?? '?', total: snapshot.total ?? '?' }) }}{{
          snapshot.loading ? t('page.headless.loadingSuffix') : ''
        }}
      </span>
      <button
        type="button"
        :disabled="snapshot.hasNext !== true"
        @click="controller.setPage(snapshot.page + 1)"
      >
        {{ t('page.headless.nextPage') }}
      </button>
    </div>
  </section>
</template>
