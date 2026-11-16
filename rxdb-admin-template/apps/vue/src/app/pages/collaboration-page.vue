<script setup lang="ts">
import { workbenchShell } from '../shell/workbench-shell';

import { mountCollaboration, readAnonymousAssets } from '@rxdb-admin-template/collaboration';
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import { ENTITIES } from '../entities/asset-entities';
import setupRxdb from '../rxdb/setup_rxdb';
const host = useTemplateRef<HTMLDivElement>('host');
let dispose: (() => void) | undefined;
onMounted(() => {
  if (host.value)
    dispose = mountCollaboration(host.value, { translate: (key, values) => workbenchShell.i18n.t(key, values),
      subscribeLanguage: listener => { const sub = workbenchShell.i18n.changes$.subscribe(listener); return () => sub.unsubscribe(); },
      importAnonymous: () => readAnonymousAssets(setupRxdb(), ENTITIES) });
});
onUnmounted(() => dispose?.());
</script>
<template><div ref="host"></div></template>
