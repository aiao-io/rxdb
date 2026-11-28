<script setup lang="ts">
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { watchEffect } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { visibleEntityEntries } from '../entities/entity-registry';
const { t } = useI18n();
const entries = visibleEntityEntries(useRxDB().config.entities);
const route = useRoute();
const router = useRouter();
watchEffect(() => {
  const first = entries[0];
  if (!route.params['namespace'] && first) void router.replace(`/entities/${first.namespace}/${first.name}`);
});
</script>
<template>
  <div
    class="page-host"
    data-testid="entity-shell"
    ><div
      v-if="entries.length === 0"
      role="alert"
      >{{ t('entity.none') }}</div
    ><RouterView
  /></div>
</template>
