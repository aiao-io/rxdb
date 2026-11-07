<script setup lang="ts">
import { buildTimezoneEntries, TIMEZONE_REGIONS, timeInZone } from '@aiao/rxdb-admin';
import { Check as CheckIcon, Clock as ClockIcon } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { blurActive } from './menu-widgets.js';

const TICK_MS = 30_000;

/**
 * 时区切换：按地理分组列出常用时区、各自当前时间与 UTC 偏移，每 30 秒刷新一次时间。
 * 按钮的可访问名称带上可见的偏移文字（WCAG 2.5.3 label-in-name）。
 */
const shell = useAdminShell();
const t = useAdminText();
const current = useAdminStore(shell.timezone);
const prefs = useAdminStore(shell.preferences);
const now = shallowRef(new Date());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, TICK_MS);
});

onBeforeUnmount(() => clearInterval(timer));

const entries = computed(() => buildTimezoneEntries(now.value));
const offset = computed(() => entries.value.find(entry => entry.zone === current.value)?.offset ?? current.value);
const regions = computed(() =>
  TIMEZONE_REGIONS.map(region => ({ region, items: entries.value.filter(entry => entry.region === region) }))
);

const select = (zone: string): void => {
  shell.preferences.setPath('app.timezone', zone);
  blurActive();
};
</script>

<template>
  <div class="dropdown dropdown-end">
    <button
      type="button"
      tabindex="0"
      class="btn btn-ghost btn-sm gap-1"
      :aria-label="`${t('widget.timezone')}：${offset}`"
      aria-haspopup="menu"
      data-testid="admin-widget-timezone"
    >
      <ClockIcon :size="16" />
      <span class="admin-widget-text text-xs">{{ offset }}</span>
    </button>
    <div
      tabindex="0"
      class="dropdown-content bg-base-100 rounded-box admin-popover-list z-50 mt-1 p-2 shadow"
      role="menu"
    >
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="prefs.app.timezone === ''"
        class="admin-popover-item"
        @click="select('')"
      >
        <span>{{ t('prefs.option.app.timezone.system') }}</span>
        <CheckIcon
          v-if="prefs.app.timezone === ''"
          :size="14"
        />
      </button>
      <div
        v-for="group in regions"
        :key="group.region"
        role="group"
        :aria-label="t(`timezone.region.${group.region}`)"
      >
        <div class="admin-popover-group">{{ t(`timezone.region.${group.region}`) }}</div>
        <button
          v-for="entry in group.items"
          :key="entry.zone"
          type="button"
          role="menuitemradio"
          :aria-checked="prefs.app.timezone === entry.zone"
          class="admin-popover-item"
          @click="select(entry.zone)"
        >
          <span
            >{{ entry.city
            }}<CheckIcon
              v-if="prefs.app.timezone === entry.zone"
              :size="14"
              class="ms-1 inline"
          /></span>
          <span class="text-xs opacity-70">{{ timeInZone(entry.zone, now) }} · {{ entry.offset }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
