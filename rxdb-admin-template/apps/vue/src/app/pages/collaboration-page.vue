<script setup lang="ts">
import { workbenchShell } from '../shell/workbench-shell';

import { mountCollaboration, readAnonymousRecords } from '@rxdb-admin-template/collaboration';
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import { ENTITIES } from '../entities/asset-entities';
import { collaborationLabels } from '../entities/collaboration-labels';
import setupRxdb from '../rxdb/setup_rxdb';
import { createTeamDatabase } from '../rxdb/team-database';
import { renderTeamEditor } from './team-editor-renderer';
const host = useTemplateRef<HTMLDivElement>('host');
let dispose: (() => void) | undefined;
onMounted(() => {
  if (host.value)
    dispose = mountCollaboration(host.value, {
      translate: (key, values) => workbenchShell.i18n.t(key, values),
      subscribeLanguage: listener => {
        const sub = workbenchShell.i18n.changes$.subscribe(listener);
        return () => sub.unsubscribe();
      },
      importAnonymous: schema => readAnonymousRecords(setupRxdb(), ENTITIES, schema),
      labels: collaborationLabels,
      createTeamDatabase,
      renderEditor: renderTeamEditor
    });
});
onUnmounted(() => dispose?.());
</script>
<template><div ref="host"></div></template>
