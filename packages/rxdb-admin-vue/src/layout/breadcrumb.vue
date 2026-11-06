<script setup lang="ts">
import { computed } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { interceptNavigation } from './intercept-navigation.js';

/**
 * 面包屑：当前页在菜单中的路径；偏好关闭、只有一级且要求隐藏、或没有匹配时不渲染。
 */
const shell = useAdminShell();
const t = useAdminText();
const items = useAdminStore(shell.breadcrumb);
const prefs = useAdminStore(shell.preferences);

const visible = computed(() => {
  const { breadcrumb } = prefs.value;
  return breadcrumb.enable && items.value.length > 0 && !(breadcrumb.hideOnlyOne && items.value.length <= 1);
});

const go = (event: MouseEvent, route: string): void => interceptNavigation(event, () => shell.navigate(route));
</script>

<template>
  <nav
    v-if="visible"
    :aria-label="t('layout.breadcrumb')"
    data-testid="admin-breadcrumb"
  >
    <ol
      class="admin-breadcrumb"
      :data-style="prefs.breadcrumb.styleType"
    >
      <li
        v-for="(item, index) in items"
        :key="item.id"
      >
        <a
          v-if="item.route && index < items.length - 1"
          class="admin-breadcrumb-item link link-hover"
          :href="item.route"
          @click="go($event, item.route as string)"
          ><component
            :is="item.icon"
            v-if="prefs.breadcrumb.showIcon && item.icon"
          />{{ item.label }}</a
        >
        <span
          v-else
          class="admin-breadcrumb-item"
          :aria-current="index === items.length - 1 ? 'page' : undefined"
          ><component
            :is="item.icon"
            v-if="prefs.breadcrumb.showIcon && item.icon"
          />{{ item.label }}</span
        >
        <span
          v-if="index < items.length - 1"
          class="admin-breadcrumb-sep"
          aria-hidden="true"
          >/</span
        >
      </li>
    </ol>
  </nav>
</template>
