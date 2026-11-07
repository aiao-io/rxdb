<script setup lang="ts">
import { useAdminShell, useAdminStore } from '../context.js';
import { computed } from 'vue';
import { interceptNavigation } from './intercept-navigation.js';

/**
 * 品牌区：Logo 图片、图标与应用名，点击回首页；偏好关闭 Logo 时不渲染。
 * 链接带 `aria-label`：折叠为图标轨时文字被样式隐藏，链接仍需要可访问名称。
 */
const shell = useAdminShell();
const prefs = useAdminStore(shell.preferences);
const revision = useAdminStore(shell.text);
const brandTitle = computed(() => {
  void revision.value;
  return shell.brandTitle;
});

defineSlots<{
  /** 没有 Logo 图片时显示的图标。 */
  icon?(): unknown;
}>();

const go = (event: MouseEvent): void => interceptNavigation(event, () => shell.navigate(shell.homeUrl));
</script>

<template>
  <a
    v-if="prefs.logo.enable"
    class="admin-brand"
    :href="shell.homeUrl"
    :aria-label="brandTitle"
    @click="go"
  >
    <img
      v-if="prefs.logo.source"
      class="admin-brand-logo"
      :src="prefs.logo.source"
      alt=""
    />
    <slot
      v-else
      name="icon"
    />
    <span
      v-if="prefs.logo.showText || !prefs.logo.source"
      class="admin-brand-text"
      >{{ brandTitle }}</span
    >
  </a>
</template>
