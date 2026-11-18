<script setup lang="ts">
import { carriesInvitation, mountLogin, redirectTarget } from '@rxdb-admin-template/collaboration/auth';
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { workbenchShell } from '../shell/workbench-shell';

const host = useTemplateRef<HTMLDivElement>('host');
const router = useRouter();
const redirect = useRoute().query['redirect'];
const target = redirectTarget(typeof redirect === 'string' ? redirect : null);
let dispose: (() => void) | undefined;
onMounted(() => {
  if (host.value)
    dispose = mountLogin(host.value, {
      translate: (key, values) => workbenchShell.i18n.t(key, values),
      subscribeLanguage: listener => {
        const sub = workbenchShell.i18n.changes$.subscribe(listener);
        return () => sub.unsubscribe();
      },
      signedIn: () => void router.replace(target),
      invited: carriesInvitation(target),
      brand: () => workbenchShell.i18n.t('app.brandTitle')
    });
});
onUnmounted(() => dispose?.());
</script>
<template>
  <div
    ref="host"
    class="h-full"
  ></div>
</template>
