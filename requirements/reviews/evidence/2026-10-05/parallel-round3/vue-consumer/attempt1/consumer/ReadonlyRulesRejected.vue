<script setup lang="ts">
import type { RuleGroup } from '@aiao/rxdb';
import type { UseOptions } from '@aiao/rxdb-vue';
import { readonly, ref } from 'vue';
import {
  useCountAncestors,
  useCountDescendants,
  useFindAncestors,
  useFindDescendants
} from '@aiao/rxdb-plugin-tree-vue';
import { NumericNode, type NumericOptions } from './models.js';

const where: RuleGroup<NumericNode> = {
  combinator: 'and',
  rules: [{ combinator: 'or', rules: [{ field: 'name', operator: '=', value: 'branch' }] }]
};
const frozenWhere = readonly(where);
const coreContract: RuleGroup<NumericNode> = frozenWhere;
const treeContract: NumericOptions = { entityId: 1, where: frozenWhere };
const full = readonly(ref<NumericOptions>({ entityId: 1, where, level: 1 }));
const upstreamContract: UseOptions<NumericOptions> = full;
useFindDescendants(NumericNode, full);
useCountDescendants(NumericNode, full);
useFindAncestors(NumericNode, full);
useCountAncestors(NumericNode, full);
const typedWithoutWhere = readonly(ref<NumericOptions>({ entityId: 1, level: 1 }));
useFindAncestors(NumericNode, typedWithoutWhere);
</script>

<template>
  <p>{{ full.value.entityId }} {{ frozenWhere.combinator }}</p>
</template>
