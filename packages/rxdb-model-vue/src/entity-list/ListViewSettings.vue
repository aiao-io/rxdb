<script setup lang="ts">
import { ListViewSettingsController, moveListViewItem, type ListViewField, type ListViewState } from '@aiao/rxdb-model';
import { computed, onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue';

const props = defineProps<{ fields: ListViewField[]; value: ListViewState }>();
const emit = defineEmits<{ change: [value: ListViewState] }>();
const panel =
  'border-base-300 bg-base-100 m-0 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg border p-3 shadow-xl';
const uid = `rxdb-list-settings-${useId()}`;
const settings = useTemplateRef<HTMLElement>('settings');
let controller: ListViewSettingsController | undefined;
onMounted(() => {
  controller = new ListViewSettingsController(settings.value!, {
    fields: () => props.fields.map(field => field.field),
    onReorder: fieldOrder => change({ fieldOrder })
  });
});
onBeforeUnmount(() => controller?.dispose());
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
    ref="settings"
    class="flex shrink-0 items-center gap-1"
    aria-label="列表视图配置"
  >
    <div>
      <button
        type="button"
        :popovertarget="`${uid}-fields`"
        class="btn btn-ghost btn-sm"
        >字段配置</button
      >
      <div
        :id="`${uid}-fields`"
        :class="panel"
        popover="auto"
        data-list-view-popover
        role="group"
        aria-label="字段配置选项"
      >
        <p class="mb-2 text-xs opacity-60">拖动调整顺序，使用开关控制显隐；至少保留一个字段</p>
        <div data-list-view-fields>
          <div
            v-for="field in fields"
            :key="field.field"
            class="border-base-300 data-[drop-target=true]:border-primary flex h-10 items-center gap-2 border-b-2 border-transparent data-[dragging]:opacity-40"
            data-list-view-field
          >
            <button
              type="button"
              class="btn btn-ghost btn-xs cursor-grab touch-none active:cursor-grabbing"
              :data-list-view-drag="field.field"
              :aria-label="`拖动${field.title}排序`"
              title="拖动排序，也可使用上下方向键"
              ><span aria-hidden="true">⠿</span></button
            >
            <label class="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm">
              <span class="truncate">{{ field.title }}</span>
              <input
                type="checkbox"
                role="switch"
                class="toggle toggle-xs shrink-0"
                :aria-label="`显示${field.title}`"
                :checked="!value.hiddenFields.includes(field.field)"
                :disabled="visibleCount === 1 && !value.hiddenFields.includes(field.field)"
                @change="toggleField(field.field, $event)"
              />
            </label>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm mt-2"
          @click="change({ fieldOrder: [], hiddenFields: [] })"
          >重置字段</button
        >
      </div>
    </div>
    <div>
      <button
        type="button"
        :popovertarget="`${uid}-sorts`"
        class="btn btn-ghost btn-sm"
        :class="{ 'btn-active': value.sorts.length }"
        >排序{{ value.sorts.length ? ` ${value.sorts.length}` : '' }}</button
      >
      <div
        :id="`${uid}-sorts`"
        :class="panel"
        popover="auto"
        data-list-view-popover
        role="group"
        aria-label="排序选项"
      >
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
    </div>
    <div>
      <button
        type="button"
        :popovertarget="`${uid}-group`"
        class="btn btn-ghost btn-sm"
        :class="{ 'btn-active': value.groupBy }"
        >分组{{ value.groupBy ? ' 1' : '' }}</button
      >
      <div
        :id="`${uid}-group`"
        :class="panel"
        popover="auto"
        data-list-view-popover
        role="group"
        aria-label="分组选项"
      >
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
    </div>
  </div>
</template>
