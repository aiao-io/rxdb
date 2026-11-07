<script setup lang="ts">
import type { DrawerRow } from '@aiao/rxdb-admin';
import { computed } from 'vue';
import CardsControl from './cards-control.vue';
import ColorControl from './color-control.vue';
import NumberControl from './number-control.vue';
import ShortcutList from './shortcut-list.vue';
import TextControl from './text-control.vue';
import ThemeGrid from './theme-grid.vue';
import WidgetList from './widget-list.vue';

/**
 * 按控件种类渲染一行设置的输入部分。
 */
const props = defineProps<{
  /** 设置行。 */
  row: DrawerRow;
}>();

const control = computed(() => props.row.control);

const onSwitch = (event: Event): void => props.row.set((event.target as HTMLInputElement).checked);
const onSelect = (event: Event): void => props.row.set((event.target as HTMLSelectElement).value);
</script>

<template>
  <input
    v-if="control.kind === 'switch'"
    :id="`prefs-${row.id}`"
    type="checkbox"
    class="toggle toggle-sm"
    :checked="row.value === true"
    :disabled="!row.enabled"
    :data-testid="`pref-${row.path}`"
    @change="onSwitch"
  />
  <select
    v-else-if="control.kind === 'select'"
    :id="`prefs-${row.id}`"
    class="select select-sm w-56"
    :value="String(row.value ?? '')"
    :disabled="!row.enabled"
    :data-testid="`pref-${row.path}`"
    @change="onSelect"
  >
    <option
      v-for="option in control.options"
      :key="option.value"
      :value="option.value"
    >
      {{ option.label }}
    </option>
  </select>
  <span
    v-else-if="control.kind === 'segmented'"
    class="join"
    role="group"
    :aria-label="row.label"
  >
    <button
      v-for="option in control.options"
      :key="option.value"
      type="button"
      class="btn btn-xs join-item"
      :class="{ 'btn-primary': row.value === option.value }"
      :aria-pressed="row.value === option.value"
      :disabled="!row.enabled"
      :data-testid="`pref-${row.path}-${option.value || 'default'}`"
      @click="row.set(option.value)"
    >
      {{ option.label }}
    </button>
  </span>
  <CardsControl
    v-else-if="control.kind === 'cards'"
    :row="row"
    :options="control.options"
    :preview="control.preview"
  />
  <NumberControl
    v-else-if="control.kind === 'number'"
    :row="row"
    :control="control"
  />
  <TextControl
    v-else-if="control.kind === 'text'"
    :row="row"
    :placeholder="control.placeholder"
  />
  <ColorControl
    v-else-if="control.kind === 'color'"
    :row="row"
    :presets="control.presets"
  />
  <ThemeGrid
    v-else-if="control.kind === 'themes'"
    :row="row"
  />
  <WidgetList v-else-if="control.kind === 'widgets'" />
  <ShortcutList v-else-if="control.kind === 'shortcuts'" />
</template>
