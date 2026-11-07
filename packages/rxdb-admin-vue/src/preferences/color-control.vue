<script setup lang="ts">
import type { DrawerRow } from '@aiao/rxdb-admin';
import { computed } from 'vue';
import { useAdminText } from '../context.js';

/**
 * 颜色选择：预设色点 + 取色器 + 清除（回到主题自带色）。
 */
const props = defineProps<{
  /** 设置行。 */
  row: DrawerRow;
  /** 预设色（小写 `#rrggbb`）。 */
  presets: readonly string[];
}>();

const t = useAdminText();
const value = computed(() => String(props.row.value ?? ''));

const onInput = (event: Event): void => props.row.set((event.target as HTMLInputElement).value);
</script>

<template>
  <span
    class="flex flex-wrap items-center gap-2"
    role="group"
    :aria-label="row.label"
  >
    <button
      v-for="color in presets"
      :key="color"
      type="button"
      class="admin-color-dot"
      :style="{ backgroundColor: color }"
      :aria-label="color"
      :aria-pressed="value.toLowerCase() === color"
      data-testid="pref-color-preset"
      @click="row.set(color)"
    />
    <input
      type="color"
      class="admin-color-input"
      :value="value || '#167bff'"
      :aria-label="row.label"
      data-testid="pref-color-input"
      @input="onInput"
    />
    <button
      v-if="value !== ''"
      type="button"
      class="btn btn-ghost btn-xs"
      data-testid="pref-color-reset"
      @click="row.set('')"
    >
      {{ t('prefs.reset') }}
    </button>
  </span>
</template>
