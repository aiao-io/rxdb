<script setup lang="ts">
import type { EntityType } from '@aiao/rxdb';
import { useCount, useRxDB } from '@aiao/rxdb-vue';
import { findWorkbenchEntity, type WorkbenchEntityEntry } from '../entities/entity-registry';
const props = defineProps<{ entry: WorkbenchEntityEntry }>();
const db = useRxDB();
const entity = findWorkbenchEntity(db.config.entities, props.entry.namespace, props.entry.name) as EntityType;
const count = useCount(entity, { where: { combinator: 'and', rules: [] } });
</script>
<template>
  <span class="badge badge-ghost badge-xs">{{ count.value ?? 0 }}</span>
</template>
