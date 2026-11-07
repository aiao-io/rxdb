<script setup lang="ts">
import type { WidgetKey } from '@aiao/rxdb-admin';
import type { Component } from 'vue';
import { useAdminShell, useAdminStore } from '../context.js';
import FullscreenWidget from './fullscreen-widget.vue';
import LanguageWidget from './language-widget.vue';
import LockWidget from './lock-widget.vue';
import PreferencesWidget from './preferences-widget.vue';
import RefreshWidget from './refresh-widget.vue';
import SearchWidget from './search-widget.vue';
import ThemeWidget from './theme-widget.vue';
import TimezoneWidget from './timezone-widget.vue';

/**
 * 顶栏部件区：按偏好的顺序与显隐渲染。
 */
const WIDGETS: Record<WidgetKey, Component> = {
  search: SearchWidget,
  theme: ThemeWidget,
  language: LanguageWidget,
  timezone: TimezoneWidget,
  fullscreen: FullscreenWidget,
  refresh: RefreshWidget,
  lock: LockWidget,
  preferences: PreferencesWidget
};

const shell = useAdminShell();
const keys = useAdminStore(shell.widgets);
</script>

<template>
  <div
    class="admin-widgets"
    data-testid="admin-widgets"
  >
    <span
      v-for="key in keys"
      :key="key"
      class="admin-widget"
      :data-widget="key"
    >
      <component :is="WIDGETS[key]" />
    </span>
  </div>
</template>
