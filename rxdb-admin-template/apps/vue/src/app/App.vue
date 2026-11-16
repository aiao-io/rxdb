<script setup lang="ts">
import { AdminShellProvider } from '@aiao/rxdb-admin-vue';
import { provideI18n } from '@aiao/rxdb-i18n-vue';
import { provideRxDB } from '@aiao/rxdb-vue';
import AppLayout from './app-layout.vue';
import setupRxdb from './rxdb/setup_rxdb';
import { workbenchShell } from './shell/workbench-shell';
provideRxDB(setupRxdb());
provideI18n(workbenchShell.i18n);
</script>
<template>
  <AdminShellProvider :shell="workbenchShell"><AppLayout /></AdminShellProvider>
</template>
