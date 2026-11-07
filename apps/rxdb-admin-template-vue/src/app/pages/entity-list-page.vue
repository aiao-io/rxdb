<script setup lang="ts">
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { EntityList } from '@aiao/rxdb-model-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { findWorkbenchEntity } from '../entities/entity-registry';
const db = useRxDB();
const { t } = useI18n();
const route = useRoute();
const namespace = computed(() => String(route.params['namespace'] ?? ''));
const name = computed(() => String(route.params['name'] ?? ''));
const found = computed(() => findWorkbenchEntity(db.config.entities, namespace.value, name.value));
</script>
<template>
  <div
    v-if="found"
    class="page-host"
    ><EntityList
      :key="`${namespace}/${name}`"
      :namespace="namespace"
      :name="name"
  /></div>
  <div
    v-else
    class="page-host items-center justify-center gap-2 p-8"
    data-testid="entity-load-failed"
    role="alert"
    ><span class="text-error font-semibold">{{ t('entity.loadFailed') }}</span
    ><span>{{ t('entity.notFound', { namespace, name }) }}</span></div
  >
</template>
