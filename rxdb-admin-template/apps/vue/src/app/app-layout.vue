<script setup lang="ts">
import { AdminLayout } from '@aiao/rxdb-admin-vue';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { Database } from '@lucide/vue';
import { authSession } from '@rxdb-admin-template/collaboration/auth';
import { computed, onUnmounted, watchEffect } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { visibleEntityEntries } from './entities/entity-registry';
import AccountMenu from './shell/account-menu.vue';
import { loginUrl } from './shell/auth-gate';
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
// 退出账号或会话失效：带着当前地址回到登录页。会话换成了另一个账号（别的页面登录了别人）：本页的工作台库还是原账号的，
// 重新载入，换到那个账号自己的库（ADMIN-US-222）
const session = authSession();
const follow = () => {
  if (!session.user)
    void router.push(loginUrl(`${window.location.pathname}${window.location.search}${window.location.hash}`));
  else if (session.user.id !== db.config.identity?.subject) window.location.reload();
};
session.addEventListener('identity', follow);
onUnmounted(() => session.removeEventListener('identity', follow));
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
    <template #header-end><AccountMenu /></template>
    <RouterView />
  </AdminLayout>
</template>
