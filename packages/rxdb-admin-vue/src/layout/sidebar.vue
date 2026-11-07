<script setup lang="ts">
import { PanelLeftClose as PanelLeftCloseIcon, PanelLeftOpen as PanelLeftOpenIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import type { RenderMenuExtra, SidebarProps } from '../types.js';
import Brand from './brand.vue';
import MenuTree from './menu-tree.vue';
import SidebarResizer from './sidebar-resizer.vue';

/**
 * 侧栏：品牌、菜单树、折叠按钮、宽度拖拽；折叠时可悬停展开，移动端是抽屉。布局不需要侧栏时不渲染。
 */
defineProps<SidebarProps>();

defineSlots<{
  /** 品牌图标（没有 Logo 图片时显示）。 */
  'brand-icon'?(): unknown;
  /** 菜单项右侧附加内容（徽标、计数）。 */
  'menu-extra'?: RenderMenuExtra;
}>();

const shell = useAdminShell();
const t = useAdminText();
const layout = useAdminStore(shell.layout);
const ui = useAdminStore(shell.ui);
const prefs = useAdminStore(shell.preferences);
const isDark = useAdminStore(shell.theme.isDark);
const mobile = useAdminStore(shell.isMobile);

const collapsed = computed(() => layout.value.sidebarCollapsed);
const hoverExpanded = computed(() => collapsed.value && ui.value.hoverExpanded);
const semiDark = computed(() => (layout.value.semiDarkSidebar && !isDark.value ? shell.theme.darkName : undefined));
const rail = computed(() => collapsed.value && !hoverExpanded.value);

const onEnter = (): void => {
  if (collapsed.value && prefs.value.sidebar.expandOnHover) shell.ui.setHoverExpanded(true);
};
</script>

<template>
  <template v-if="layout.showSidebar">
    <div class="admin-sidebar-slot">
      <aside
        id="admin-sidebar"
        class="admin-sidebar"
        :aria-label="t('layout.navigation')"
        data-testid="admin-sidebar"
        :data-collapsed="collapsed"
        :data-hover-expanded="hoverExpanded"
        :data-open="ui.drawerOpen"
        :data-show-title="prefs.sidebar.collapsedShowTitle"
        :data-theme="semiDark"
        @mouseenter="onEnter"
        @mouseleave="shell.ui.setHoverExpanded(false)"
      >
        <Brand v-if="!layout.brandInHeader">
          <template
            v-if="$slots['brand-icon']"
            #icon
          >
            <slot name="brand-icon" />
          </template>
        </Brand>
        <div class="admin-sidebar-body">
          <MenuTree
            :nodes="menu"
            :rail="rail"
          >
            <template
              v-if="$slots['menu-extra']"
              #extra="slotProps"
            >
              <slot
                name="menu-extra"
                v-bind="slotProps"
              />
            </template>
          </MenuTree>
        </div>
        <div
          v-if="!mobile"
          class="admin-sidebar-footer"
        >
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            :aria-label="collapsed ? t('layout.expand') : t('layout.collapse')"
            :aria-expanded="!collapsed"
            aria-controls="admin-sidebar"
            data-testid="admin-sidebar-toggle"
            @click="shell.toggleSidebar()"
          >
            <PanelLeftOpenIcon
              v-if="collapsed"
              :size="16"
            />
            <PanelLeftCloseIcon
              v-else
              :size="16"
            />
          </button>
        </div>
        <SidebarResizer v-if="prefs.sidebar.draggable && !collapsed && !mobile" />
      </aside>
    </div>
    <div
      class="admin-backdrop"
      :data-open="ui.drawerOpen"
      aria-hidden="true"
      @click="shell.ui.setDrawer(false)"
    />
  </template>
</template>
