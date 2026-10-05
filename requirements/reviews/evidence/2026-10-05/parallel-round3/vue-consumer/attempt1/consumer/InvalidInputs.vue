<script setup lang="ts">
import {
  useCountAncestors,
  useCountDescendants,
  useFindAncestors,
  useFindDescendants
} from '@aiao/rxdb-plugin-tree-vue';
import { NumericNode, PlainNode, StringNode } from './models.js';

useFindDescendants(NumericNode, { entityId: 'wrong' });
useCountDescendants(NumericNode, { entityId: 'wrong' });
useFindAncestors(NumericNode, { entityId: 'wrong' });
useCountAncestors(NumericNode, { entityId: 'wrong' });
useFindDescendants(StringNode, { entityId: 1 });
useFindDescendants(PlainNode, { entityId: 1 });
useCountDescendants(PlainNode, { entityId: 1 });
useFindAncestors(PlainNode, { entityId: 1 });
useCountAncestors(PlainNode, { entityId: 1 });
const resource = useCountDescendants(NumericNode, { entityId: 1 });
resource.value = 2;
const wrongResult: string = resource.value;
useFindDescendants(NumericNode, { entityId: 1, level: 'deep' });
</script>

<template>
  <p>{{ wrongResult }}</p>
</template>
