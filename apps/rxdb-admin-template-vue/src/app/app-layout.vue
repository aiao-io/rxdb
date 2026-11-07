<script setup lang="ts">
import { AdminLayout } from '@aiao/rxdb-admin-vue';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { Database } from '@lucide/vue';
import { computed, watchEffect } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { visibleEntityEntries } from './entities/entity-registry';
import EntityCount from './shell/entity-count.vue';
import { createRecordSearchSource } from './shell/record-search';
import { buildWorkbenchMenu, entryOfMenuId } from './shell/workbench-menu';
import { navigating } from './router';
import { workbenchShell } from './shell/workbench-shell';
const db = useRxDB();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const entries = visibleEntityEntries(db.config.entities);
const menu = computed(() => buildWorkbenchMenu(db.config.entities, t));
watchEffect(onCleanup => {
  void locale.value;
  onCleanup(workbenchShell.palette.registerSource(createRecordSearchSource(db, url => void router.push(url), t)));
});
</script>
<template>
  <AdminLayout
    :menu="menu"
    :url="route.fullPath"
    :navigating="navigating"
  >
    <template #brand-icon
      ><Database
        :size="16"
        aria-hidden="true"
    /></template>
    <template #menu-extra="{ node }"
      ><EntityCount
        v-if="entryOfMenuId(entries, node.id)"
        :entry="entryOfMenuId(entries, node.id)!"
    /></template>
    <RouterView />
  </AdminLayout>
</template>
