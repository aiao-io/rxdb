<script setup lang="ts">
import { useFindDescendants } from '@aiao/rxdb-plugin-tree-vue';
import { NumericNode } from './models.js';
const descendants = useFindDescendants(NumericNode, { entityId: 1, depth: 1 });
</script>

<template>
  <p>{{ descendants.value.length }}</p>
</template>
