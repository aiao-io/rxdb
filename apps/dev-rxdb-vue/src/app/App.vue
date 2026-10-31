<script lang="ts" setup>
import { provideI18n } from '@aiao/rxdb-i18n-vue';
import { provideRxDB } from '@aiao/rxdb-vue';
import { onBeforeUnmount, ref, watchEffect } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import AppSidebar from './components/AppSidebar.vue';
import AppToast from './components/AppToast.vue';
import LoadingBar from './components/LoadingBar.vue';
import { useAppService } from './composables/useAppService';
import { useTheme } from './composables/useTheme';
import DbConnectionAlert from './components/DbConnectionAlert.vue';
import { dbConnectionError } from './rxdb/db-connection';
import { createDemoI18n } from './rxdb/i18n';
import setup_rxdb from './rxdb/setup_rxdb_sqlite-wasm';

const db = setup_rxdb();
provideRxDB(db);
const i18n = createDemoI18n(db);
provideI18n(i18n);
const ready = ref(false);
const initError = ref<string>();
const locale = ref(i18n.locale);
const subscription = i18n.locale$.subscribe(value => {
  locale.value = value;
});
void i18n.init().then(
  () => {
    ready.value = true;
  },
  error => {
    initError.value = error instanceof Error ? error.message : String(error);
  }
);
onBeforeUnmount(() => {
  subscription.unsubscribe();
  i18n.destroy();
});

useTheme();
const { sidebarPinned, headerFloating, toggleSidebar } = useAppService();

// Loading bar
const loadingBarRef = ref<InstanceType<typeof LoadingBar>>();
const router = useRouter();

watchEffect(() => {
  document.documentElement.lang = locale.value;
});

const removeBeforeEach = router.beforeEach(() => {
  loadingBarRef.value?.continuousStart();
});

const removeAfterEach = router.afterEach(() => {
  loadingBarRef.value?.complete();
});

const removeOnError = router.onError(() => {
  loadingBarRef.value?.complete();
});
onBeforeUnmount(() => {
  removeBeforeEach();
  removeAfterEach();
  removeOnError();
});
</script>

<template>
  <div
    v-if="ready"
    id="layout-main"
    :class="['flex size-full', { 'left-menu-pinned': sidebarPinned, 'header-floating': headerFloating }]"
  >
    <LoadingBar
      :shadow="true"
      color="#f11946"
      ref="loadingBarRef"
    />
    <AppToast />
    <div
      class="sidebar-overlay md:hidden"
      v-if="sidebarPinned"
      @click="toggleSidebar"
      aria-label="Close sidebar"
    />
    <AppSidebar />
    <div
      class="flex h-full min-w-0 grow flex-col overflow-hidden"
      id="layout-container"
    >
      <AppHeader />
      <div
        class="flex min-h-0 flex-1 flex-col overflow-auto"
        id="layout-content"
      >
        <DbConnectionAlert />
        <RouterView />
      </div>
    </div>
  </div>
  <DbConnectionAlert v-else-if="dbConnectionError !== null" />
  <div
    v-else-if="initError"
    class="alert alert-error"
    role="alert"
    >{{ initError }}</div
  >
  <div
    v-else
    class="flex h-full items-center justify-center"
  >
    <span class="loading loading-spinner loading-lg" />
  </div>
</template>

<style lang="scss" scoped></style>
