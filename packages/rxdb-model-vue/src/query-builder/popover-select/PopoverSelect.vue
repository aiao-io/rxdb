<script lang="ts" setup>
/**
 * 基于 Popover API 的下拉选择组件（对齐 Angular 侧 `PopoverSelectComponent`）。
 *
 * 使用浏览器原生 Popover API 渲染选项列表（top layer，`overflow` 容器内不被裁剪）；
 * 支持关键字过滤、键盘导航（↑↓ 循环移动、Enter 选中、Escape 关闭）、
 * 打开自动高亮第一项，搜索后也自动高亮第一条结果。
 */
import { applyPopoverPosition, findOptionLabel } from '@aiao/rxdb-model';
import { computed, ref, watch } from 'vue';

let moduleUid = 0;

const props = withDefaults(
  defineProps<{
    /** 选项列表 */
    options: ReadonlyArray<{ value: string; label: string }>;
    /** 当前选中值 */
    selected?: string;
    /** 未选中时的占位文案 */
    placeholder?: string;
    /** 最小宽度 */
    minWidth?: string;
  }>(),
  { selected: '', placeholder: '请选择', minWidth: '8rem' }
);

const emit = defineEmits<{
  /** 选中某个选项 */
  selectChange: [value: string];
}>();

const uid = `rxdb-ps-${++moduleUid}`;
const listId = `${uid}-list`;
const filterText = ref('');
const activeIndex = ref(0);

const trigger = ref<HTMLButtonElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const filterInput = ref<HTMLInputElement | null>(null);

const currentLabel = computed(() => findOptionLabel(props.options, props.selected, props.placeholder));

const filteredOptions = computed(() => {
  const filter = filterText.value.toLowerCase().trim();
  if (!filter) return props.options;
  return props.options.filter(opt => opt.label.toLowerCase().includes(filter));
});

const activeItemId = computed(() => {
  const idx = activeIndex.value;
  const opts = filteredOptions.value;
  return idx >= 0 && idx < opts.length ? `${uid}-opt-${opts[idx].value}` : null;
});

// 过滤结果变化时高亮自动回到第一项
watch(filteredOptions, () => {
  activeIndex.value = 0;
});

const onBeforeToggle = (event: Event): void => {
  const te = event as ToggleEvent;
  if (te.newState === 'open') {
    if (popoverEl.value && trigger.value) {
      applyPopoverPosition(popoverEl.value, trigger.value.getBoundingClientRect());
    }
    filterText.value = '';
  }
};

const onToggle = (event: Event): void => {
  if ((event as ToggleEvent).newState === 'open') {
    filterInput.value?.focus();
    activeIndex.value = 0;
  }
};

const onKeydown = (event: KeyboardEvent): void => {
  const opts = filteredOptions.value;
  const len = opts.length;

  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault();
      if (len > 0) {
        activeIndex.value = (activeIndex.value + 1) % len;
        scrollActiveIntoView();
      }
      break;
    }
    case 'ArrowUp': {
      event.preventDefault();
      if (len > 0) {
        activeIndex.value = (activeIndex.value - 1 + len) % len;
        scrollActiveIntoView();
      }
      break;
    }
    case 'Enter': {
      event.preventDefault();
      const opt = opts[activeIndex.value];
      if (opt) onSelect(opt.value);
      break;
    }
    case 'Escape': {
      event.preventDefault();
      popoverEl.value?.hidePopover();
      trigger.value?.focus();
      break;
    }
    case 'Tab': {
      popoverEl.value?.hidePopover();
      break;
    }
  }
};

const onSelect = (value: string): void => {
  emit('selectChange', value);
  popoverEl.value?.hidePopover();
  trigger.value?.focus();
};

const scrollActiveIntoView = (): void => {
  const opts = filteredOptions.value;
  const opt = opts[activeIndex.value];
  if (!opt) return;
  document.getElementById(`${uid}-opt-${opt.value}`)?.scrollIntoView({ block: 'nearest' });
};

defineExpose({
  uid,
  listId,
  currentLabel,
  filteredOptions,
  activeItemId,
  filterText,
  activeIndex,
  onBeforeToggle,
  onToggle,
  onKeydown,
  onSelect
});
</script>

<template>
  <button
    class="select select-sm text-left"
    :popovertarget="uid"
    :style="{ 'min-width': minWidth }"
    ref="trigger"
    type="button"
  >
    {{ currentLabel }}
  </button>
  <div
    class="bg-base-100 rounded-box border-base-300 border shadow-xl"
    :id="uid"
    :style="{ 'min-width': minWidth }"
    @beforetoggle="onBeforeToggle"
    @keydown="onKeydown"
    @toggle="onToggle"
    popover
    ref="popoverEl"
    tabindex="-1"
  >
    <div class="mb-1 p-2">
      <input
        class="input input-sm w-full"
        v-model="filterText"
        :aria-activedescendant="activeItemId ?? undefined"
        :aria-controls="listId"
        aria-autocomplete="list"
        aria-expanded="true"
        placeholder="搜索..."
        ref="filterInput"
        role="combobox"
        type="text"
      />
    </div>
    <ul
      class="menu menu-sm max-h-60 w-full flex-nowrap overflow-y-auto px-2"
      :id="listId"
      role="listbox"
    >
      <li
        v-for="(option, i) in filteredOptions"
        :key="option.value"
        role="none"
      >
        <button
          class="flex w-full items-center text-left text-sm"
          :aria-selected="option.value === selected"
          :class="{
            'bg-primary/15': option.value === selected,
            'font-semibold': option.value === selected,
            'menu-focus': activeIndex === i
          }"
          :id="`${uid}-opt-${option.value}`"
          @click="onSelect(option.value)"
          role="option"
          type="button"
        >
          <span class="grow">{{ option.label }}</span>
          <svg
            class="text-primary h-3 w-3 shrink-0"
            v-if="option.value === selected"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </li>
      <li
        class="px-3 py-1.5 text-sm opacity-50"
        v-if="filteredOptions.length === 0"
      >
        无匹配项
      </li>
    </ul>
  </div>
</template>
