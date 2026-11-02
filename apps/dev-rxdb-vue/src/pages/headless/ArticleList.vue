<script lang="ts" setup>
import type { OrderBy } from '@aiao/rxdb';
import type { EntityListController, EntityListSnapshot } from '@aiao/rxdb-model/headless';
import { computed } from 'vue';
import { errorMessage, type ArticleRecord } from './article-model';

/** 可排序列：表头按钮循环 无序 → 升序 → 降序。 */
const COLUMNS = [
  { field: 'title', label: '标题' },
  { field: 'category', label: '分类' },
  { field: 'viewCount', label: '浏览量' }
] as const;

const props = defineProps<{
  controller: EntityListController<ArticleRecord>;
  snapshot: EntityListSnapshot<ArticleRecord>;
}>();
const emit = defineEmits<{ edit: [record: ArticleRecord] }>();

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
    <h2 id="hl-list-title">文章列表</h2>
    <div class="hl-actions">
      <button
        type="button"
        @click="controller.refresh().catch(swallow)"
        >刷新</button
      >
      <button
        type="button"
        :disabled="snapshot.selectedIds.length === 0 || !canDelete"
        @click="controller.remove(snapshot.selectedIds).catch(swallow)"
      >
        删除所选 ({{ snapshot.selectedIds.length }})
      </button>
    </div>
    <table
      class="hl-table"
      aria-label="文章"
      :aria-busy="snapshot.loading"
    >
      <thead>
        <tr>
          <th scope="col"><span class="hl-sr">选择</span></th>
          <th
            v-for="column in COLUMNS"
            :key="column.field"
            scope="col"
            :aria-sort="sortOf(column.field)"
          >
            <button
              type="button"
              @click="toggleSort(column.field)"
              >{{ column.label }}</button
            >
          </th>
          <th scope="col">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="snapshot.records.length === 0 && !snapshot.loading">
          <td
            :colspan="COLUMNS.length + 2"
            data-testid="list-empty"
            >暂无数据</td
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
              :aria-label="`选择 ${record.title}`"
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
              :aria-label="`编辑 ${record.title}`"
              @click="emit('edit', record)"
            >
              编辑
            </button>
            <button
              type="button"
              :disabled="!canDelete"
              :aria-label="`删除 ${record.title}`"
              @click="controller.remove([record.id]).catch(swallow)"
            >
              删除
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
        >上一页</button
      >
      <span
        role="status"
        data-testid="list-page-info"
      >
        第 {{ snapshot.page + 1 }} / {{ pages ?? '?' }} 页，共 {{ snapshot.total ?? '?' }} 条{{
          snapshot.loading ? '（加载中）' : ''
        }}
      </span>
      <button
        type="button"
        :disabled="snapshot.hasNext !== true"
        @click="controller.setPage(snapshot.page + 1)"
      >
        下一页
      </button>
    </div>
  </section>
</template>
