<script setup lang="ts">
import { menuTitleOf } from '@aiao/rxdb-admin';
import { computed, useTemplateRef, watch } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import LockScreen from '../lock/lock-screen.vue';
import CommandPalette from '../palette/command-palette.vue';
import PreferencesDrawer from '../preferences/preferences-drawer.vue';
import Tabbar from '../tabbar/tabbar.vue';
import type { AdminLayoutProps, RenderMenuExtra } from '../types.js';
import Watermark from '../watermark.vue';
import Footer from './footer.vue';
import Header from './header.vue';
import Sidebar from './sidebar.vue';

/**
 * 后台外壳布局：侧栏 / 顶栏 / 页签栏 / 内容区 / 页脚，外加偏好抽屉、命令面板、锁屏与水印。
 * 布局模式、尺寸、显隐全部由外壳偏好驱动；路由库无关，应用只需传入当前地址并在 `navigate` 回调里跳转。
 * 默认插槽是路由出口，刷新（`ui.refresh()`）会让它整体重建。
 */
const props = defineProps<AdminLayoutProps>();

defineSlots<{
  /** 路由出口。 */
  default?(): unknown;
  /** 品牌图标（没有 Logo 图片时显示）。 */
  'brand-icon'?(): unknown;
  /** 菜单项右侧附加内容，如数量徽标；参数是菜单节点。 */
  'menu-extra'?: RenderMenuExtra;
  /** 顶栏部件区之前的扩展内容。 */
  'header-start'?(): unknown;
  /** 顶栏部件区之后的扩展内容。 */
  'header-end'?(): unknown;
}>();

const shell = useAdminShell();
const t = useAdminText();
const layout = useAdminStore(shell.layout);
const ui = useAdminStore(shell.ui);
const prefs = useAdminStore(shell.preferences);
const mobile = useAdminStore(shell.isMobile);
const pageTitle = computed(() => menuTitleOf(props.menu, props.url) ?? shell.brandTitle);
const page = useTemplateRef<HTMLDivElement>('page');

const pathOf = (url: string): string => url.split(/[?#]/, 1)[0];

function restartEnterAnimation(element: HTMLElement): void {
  element.removeAttribute('data-entering');
  void element.offsetWidth;
  element.setAttribute('data-entering', 'true');
}

// 菜单与地址在渲染之前同步进外壳，首屏就带着完整布局，不会闪一帧没有侧栏的样子。
// 合成一个监听：先菜单后地址的顺序固定，不受模板里属性书写顺序影响（同步地址要用最新菜单解析页签标题）
watch(
  [() => props.menu, () => props.url],
  ([menu, url], [previousMenu, previousUrl]) => {
    if (menu !== previousMenu) shell.setMenu(menu);
    if (url !== previousUrl) shell.syncRoute(url);
  },
  { immediate: true }
);
watch(
  () => props.navigating,
  navigating => shell.ui.setNavigating(navigating),
  { immediate: true }
);

let lastPath = pathOf(props.url);
watch(
  () => props.url,
  url => {
    const path = pathOf(url);
    if (path !== lastPath && page.value) restartEnterAnimation(page.value);
    lastPath = path;
  },
  { flush: 'post' }
);
</script>

<template>
  <div
    id="layout-main"
    class="admin-shell"
    :data-layout="layout.mode"
    :data-mobile="mobile"
    :data-maximized="ui.maximized"
    data-testid="admin-shell"
  >
    <a
      class="btn btn-primary btn-sm admin-skip-link"
      href="#layout-content"
      >{{ t('layout.skipToContent') }}</a
    >
    <Sidebar :menu="menu">
      <template
        v-if="$slots['brand-icon']"
        #brand-icon
      >
        <slot name="brand-icon" />
      </template>
      <template
        v-if="$slots['menu-extra']"
        #menu-extra="slotProps"
      >
        <slot
          name="menu-extra"
          v-bind="slotProps"
        />
      </template>
    </Sidebar>
    <div
      id="layout-container"
      class="admin-main"
    >
      <Header :menu="menu">
        <template
          v-if="$slots['brand-icon']"
          #brand-icon
        >
          <slot name="brand-icon" />
        </template>
        <template
          v-if="$slots['header-start']"
          #start
        >
          <slot name="header-start" />
        </template>
        <template
          v-if="$slots['header-end']"
          #end
        >
          <slot name="header-end" />
        </template>
      </Header>
      <Tabbar />
      <main
        id="layout-content"
        class="admin-content"
        tabindex="-1"
      >
        <h1
          class="admin-sr-only"
          data-testid="admin-page-title"
          >{{ pageTitle }}</h1
        >
        <div
          v-if="prefs.transition.progress && ui.navigating"
          class="admin-progress"
          role="progressbar"
          :aria-label="t('layout.loading')"
        />
        <div
          v-if="prefs.transition.loading && ui.navigating"
          class="admin-loading-mask"
          data-testid="admin-loading-mask"
        >
          <span
            class="loading loading-spinner loading-lg"
            :aria-label="t('layout.loading')"
          />
        </div>
        <div
          ref="page"
          :key="ui.refreshKey"
          class="admin-page"
          data-testid="admin-page"
        >
          <slot />
        </div>
      </main>
      <Footer />
    </div>
    <Watermark />
    <PreferencesDrawer />
    <CommandPalette />
    <LockScreen />
  </div>
</template>
