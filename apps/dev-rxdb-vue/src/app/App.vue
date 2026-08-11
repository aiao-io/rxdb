<script lang="ts" setup>
import { provideRxDB } from '@aiao/rxdb-vue';
import { onMounted, ref } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import AppSidebar from './components/AppSidebar.vue';
import AppToast from './components/AppToast.vue';
import LoadingBar from './components/LoadingBar.vue';
import { useAppService } from './composables/useAppService';
import { useTheme } from './composables/useTheme';
import setup_rxdb from './rxdb/setup_rxdb_sqlite-wasm';

const db = setup_rxdb();
provideRxDB(db);

useTheme();
const { sidebarPinned, headerFloating, toggleSidebar } = useAppService();

// Loading bar
const loadingBarRef = ref<InstanceType<typeof LoadingBar>>();
const router = useRouter();

onMounted(() => {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  document.documentElement.lang = locale;
});

router.beforeEach(() => {
  loadingBarRef.value?.continuousStart();
});

router.afterEach(() => {
  loadingBarRef.value?.complete();
});

router.onError(() => {
  loadingBarRef.value?.complete();
});
</script>

<template>
  <div
    id="layout-main"
    :class="['flex size-full', { 'left-menu-pinned': sidebarPinned, 'header-floating': headerFloating }]"
  >
    <LoadingBar
      ref="loadingBarRef"
      :shadow="true"
      color="#f11946"
    />
    <AppToast />
    <div
      v-if="sidebarPinned"
      class="sidebar-overlay md:hidden"
      aria-label="Close sidebar"
      @click="toggleSidebar"
    />
    <AppSidebar />
    <div
      id="layout-container"
      class="flex h-full min-w-0 grow flex-col overflow-hidden"
    >
      <AppHeader />
      <div
        id="layout-content"
        class="flex min-h-0 flex-1 flex-col overflow-auto"
      >
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
