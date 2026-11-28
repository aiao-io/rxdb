<script setup lang="ts">
import { AdminShellProvider } from '@aiao/rxdb-admin-vue';
import { provideI18n } from '@aiao/rxdb-i18n-vue';
import { provideRxDB } from '@aiao/rxdb-vue';
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppLayout from './app-layout.vue';
import setupRxdb from './rxdb/setup_rxdb';
import { workbenchShell } from './shell/workbench-shell';
provideRxDB(setupRxdb());
provideI18n(workbenchShell.i18n);
const route = useRoute();
/** 登录页在后台外壳之外单独渲染。 */
const loginPage = computed(() => route.path === '/login');
</script>
<template>
  <RouterView v-if="loginPage" />
  <AdminShellProvider
    v-else
    :shell="workbenchShell"
    ><AppLayout
  /></AdminShellProvider>
</template>
