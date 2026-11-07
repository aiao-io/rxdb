<script setup lang="ts">
import { History as HistoryIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { interceptNavigation } from '../layout/intercept-navigation.js';

/**
 * 访问历史下拉：按最近访问排列已打开的页签；没有可列出的页签时不渲染。
 */
const shell = useAdminShell();
const t = useAdminText();
const tabsState = useAdminStore(shell.tabs);

const titled = computed(() => {
  const { tabs, history } = tabsState.value;
  return history.flatMap(key => {
    const tab = tabs.find(candidate => candidate.key === key);
    return tab ? [tab] : [];
  });
});
</script>

<template>
  <div
    v-if="titled.length > 0"
    class="dropdown"
  >
    <button
      type="button"
      tabindex="0"
      class="btn btn-ghost btn-xs btn-square"
      :aria-label="t('tabbar.history')"
      aria-haspopup="menu"
      data-testid="admin-tab-history"
    >
      <HistoryIcon :size="14" />
    </button>
    <ul
      tabindex="0"
      class="dropdown-content menu menu-sm bg-base-100 rounded-box z-50 max-h-72 w-56 overflow-y-auto p-1 shadow"
    >
      <li
        v-for="tab in titled"
        :key="tab.key"
      >
        <a
          :href="tab.url"
          @click="interceptNavigation($event, () => shell.activateTab(tab.key))"
          >{{ tab.title }}</a
        >
      </li>
    </ul>
  </div>
</template>
