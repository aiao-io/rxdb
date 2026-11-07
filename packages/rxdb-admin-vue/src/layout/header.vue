<script setup lang="ts">
import { Menu as MenuIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import type { HeaderProps } from '../types.js';
import HeaderWidgets from '../widgets/header-widgets.vue';
import Brand from './brand.vue';
import Breadcrumb from './breadcrumb.vue';
import HeaderMenu from './header-menu.vue';

/**
 * 顶栏：菜单开关、品牌（顶栏布局时）、水平菜单、面包屑与部件；内容最大化时不渲染。
 */
defineProps<HeaderProps>();

defineSlots<{
  /** 品牌图标（没有 Logo 图片时显示）。 */
  'brand-icon'?(): unknown;
  /** 部件区之前的扩展内容。 */
  start?(): unknown;
  /** 部件区之后的扩展内容。 */
  end?(): unknown;
}>();

const shell = useAdminShell();
const t = useAdminText();
const layout = useAdminStore(shell.layout);
const ui = useAdminStore(shell.ui);
const prefs = useAdminStore(shell.preferences);
const isDark = useAdminStore(shell.theme.isDark);
const mobile = useAdminStore(shell.isMobile);

const semiDark = computed(() => (layout.value.semiDarkHeader && !isDark.value ? shell.theme.darkName : undefined));
const expanded = computed(() => (mobile.value ? ui.value.drawerOpen : !layout.value.sidebarCollapsed));
</script>

<template>
  <header
    v-if="layout.showHeader"
    class="admin-header"
    :data-menu-align="prefs.header.menuAlign"
    :data-theme="semiDark"
    data-testid="admin-header"
  >
    <button
      v-if="layout.showMenuToggle"
      type="button"
      class="btn btn-ghost btn-sm btn-square"
      :aria-label="t('layout.toggleMenu')"
      :aria-expanded="expanded"
      aria-controls="admin-sidebar"
      data-testid="admin-menu-toggle"
      @click="shell.toggleSidebar()"
    >
      <MenuIcon :size="18" />
    </button>
    <Brand v-if="layout.brandInHeader">
      <template
        v-if="$slots['brand-icon']"
        #icon
      >
        <slot name="brand-icon" />
      </template>
    </Brand>
    <HeaderMenu
      v-if="layout.headerMenu"
      :nodes="menu"
    />
    <Breadcrumb v-if="layout.showBreadcrumb" />
    <div class="admin-header-spacer" />
    <slot name="start" />
    <HeaderWidgets />
    <slot name="end" />
  </header>
</template>
