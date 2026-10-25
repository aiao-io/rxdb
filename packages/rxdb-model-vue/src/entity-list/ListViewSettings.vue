<script setup lang="ts">
import { moveListViewItem, type ListViewField, type ListViewState } from '@aiao/rxdb-model';
import { computed } from 'vue';

const props = defineProps<{ fields: ListViewField[]; value: ListViewState }>();
const emit = defineEmits<{ change: [value: ListViewState] }>();
const panel =
  'dropdown-content border-base-300 bg-base-100 fixed inset-x-2 top-28 z-[1000] mt-2 max-h-[60dvh] w-auto sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:w-80 max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border p-3 shadow-xl';
const visibleCount = computed(
  () => props.fields.filter(field => !props.value.hiddenFields.includes(field.field)).length
);
const available = computed(() =>
  props.fields.filter(field => field.sortable && !props.value.sorts.some(sort => sort.field === field.field))
);
const sortable = computed(() => props.fields.filter(field => field.sortable));
const change = (patch: Partial<ListViewState>) => emit('change', { ...props.value, ...patch });
const titleOf = (field: string) => props.fields.find(item => item.field === field)?.title ?? field;
const toggleField = (field: string, event: Event) =>
  change({
    hiddenFields:
      (event.target as HTMLInputElement).checked ?
        props.value.hiddenFields.filter(name => name !== field)
      : [...props.value.hiddenFields, field]
  });
const moveField = (index: number, direction: -1 | 1) =>
  change({
    fieldOrder: moveListViewItem(
      props.fields.map(field => field.field),
      index,
      direction
    )
  });
const sortDirection = (field: string, event: Event) =>
  change({
    sorts: props.value.sorts.map(sort =>
      sort.field === field ? { ...sort, sort: (event.target as HTMLSelectElement).value as 'asc' | 'desc' } : sort
    )
  });
const moveSort = (index: number, direction: -1 | 1) =>
  change({ sorts: moveListViewItem(props.value.sorts, index, direction) });
const removeSort = (field: string) => change({ sorts: props.value.sorts.filter(sort => sort.field !== field) });
const addSort = (event: Event) => {
  const select = event.target as HTMLSelectElement;
  if (select.value) change({ sorts: [...props.value.sorts, { field: select.value, sort: 'asc' }] });
  select.value = '';
};
const group = (event: Event) => change({ groupBy: (event.target as HTMLSelectElement).value || null });
</script>

<template>
  <div
    class="flex shrink-0 items-center gap-1"
    aria-label="列表视图配置"
  >
    <details
      class="dropdown"
      name="rxdb-list-view-settings"
    >
      <summary class="btn btn-ghost btn-sm">字段配置</summary>
      <div :class="panel">
        <p class="mb-2 text-xs opacity-60">调整字段显隐与顺序，至少保留一个字段</p>
        <div
          v-for="(field, index) in fields"
          :key="field.field"
          class="flex items-center gap-2 py-1"
        >
          <label class="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="checkbox checkbox-xs"
              :aria-label="`显示${field.title}`"
              :checked="!value.hiddenFields.includes(field.field)"
              :disabled="visibleCount === 1 && !value.hiddenFields.includes(field.field)"
              @change="toggleField(field.field, $event)"
            />
            <span class="truncate">{{ field.title }}</span>
          </label>
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :aria-label="`上移${field.title}`"
            :disabled="index === 0"
            @click="moveField(index, -1)"
            >↑</button
          >
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :aria-label="`下移${field.title}`"
            :disabled="index === fields.length - 1"
            @click="moveField(index, 1)"
            >↓</button
          >
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm mt-2"
          @click="change({ fieldOrder: [], hiddenFields: [] })"
          >重置字段</button
        >
      </div>
    </details>
    <details
      class="dropdown"
      name="rxdb-list-view-settings"
    >
      <summary
        class="btn btn-ghost btn-sm"
        :class="{ 'btn-active': value.sorts.length }"
        >排序{{ value.sorts.length ? ` ${value.sorts.length}` : '' }}</summary
      >
      <div :class="panel">
        <p class="mb-2 text-xs opacity-60">按规则顺序排序，作用于全部查询结果</p>
        <div
          v-for="(sort, index) in value.sorts"
          :key="sort.field"
          class="mb-2 flex items-center gap-1"
        >
          <span class="min-w-0 flex-1 truncate text-sm">{{ index + 1 }}. {{ titleOf(sort.field) }}</span>
          <select
            class="select select-xs w-20"
            :aria-label="`${titleOf(sort.field)}排序方向`"
            :value="sort.sort"
            @change="sortDirection(sort.field, $event)"
          >
            <option value="asc">升序</option
            ><option value="desc">降序</option>
          </select>
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :aria-label="`提高${titleOf(sort.field)}排序优先级`"
            :disabled="index === 0"
            @click="moveSort(index, -1)"
            >↑</button
          >
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :aria-label="`降低${titleOf(sort.field)}排序优先级`"
            :disabled="index === value.sorts.length - 1"
            @click="moveSort(index, 1)"
            >↓</button
          >
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :aria-label="`移除${titleOf(sort.field)}排序`"
            @click="removeSort(sort.field)"
            >×</button
          >
        </div>
        <select
          class="select select-sm w-full"
          aria-label="添加排序字段"
          value=""
          :disabled="!available.length"
          @change="addSort"
        >
          <option value="">添加排序字段</option
          ><option
            v-for="field in available"
            :key="field.field"
            :value="field.field"
            >{{ field.title }}</option
          >
        </select>
        <button
          type="button"
          class="btn btn-ghost btn-sm mt-2"
          :disabled="!value.sorts.length"
          @click="change({ sorts: [] })"
          >清除排序</button
        >
      </div>
    </details>
    <details
      class="dropdown"
      name="rxdb-list-view-settings"
    >
      <summary
        class="btn btn-ghost btn-sm"
        :class="{ 'btn-active': value.groupBy }"
        >分组{{ value.groupBy ? ' 1' : '' }}</summary
      >
      <div :class="panel">
        <label class="mb-2 block text-sm"
          >分组字段
          <select
            class="select select-sm mt-2 w-full"
            aria-label="分组字段"
            :value="value.groupBy ?? ''"
            @change="group"
          >
            <option value="">不分组</option
            ><option
              v-for="field in sortable"
              :key="field.field"
              :value="field.field"
              >{{ field.title }}</option
            >
          </select>
        </label>
        <p class="text-xs opacity-60">点击组标题可折叠。组内数量仅统计已加载记录。</p>
      </div>
    </details>
  </div>
</template>
