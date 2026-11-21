<script setup lang="ts">
import { mountAccount } from '@rxdb-admin-template/collaboration/auth';
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import { workbenchShell } from './workbench-shell';

const host = useTemplateRef<HTMLSpanElement>('host');
let dispose: (() => void) | undefined;
onMounted(() => {
  if (host.value)
    dispose = mountAccount(host.value, {
      translate: (key, values) => workbenchShell.i18n.t(key, values),
      subscribeLanguage: listener => {
        const sub = workbenchShell.i18n.changes$.subscribe(listener);
        return () => sub.unsubscribe();
      },
      navigate: url => workbenchShell.navigate(url),
      currentUrl: () => `${window.location.pathname}${window.location.search}${window.location.hash}`
    });
});
onUnmounted(() => dispose?.());
</script>
<template><span ref="host"></span></template>
