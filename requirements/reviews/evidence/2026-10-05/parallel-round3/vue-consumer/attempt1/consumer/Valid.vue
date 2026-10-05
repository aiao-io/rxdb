<script setup lang="ts">
import type { RuleGroup } from '@aiao/rxdb';
import type { RxDBResource, UseOptions } from '@aiao/rxdb-vue';
import { computed, reactive, readonly, ref, shallowReadonly } from 'vue';
import {
  useCountAncestors,
  useCountDescendants,
  useFindAncestors,
  useFindDescendants
} from '@aiao/rxdb-plugin-tree-vue';
import { NumericNode, StringNode, type NumericOptions } from './models.js';

const props = defineProps<{ rootId: number }>();
const emit = defineEmits<{ selected: [id: number] }>();
const where: RuleGroup<NumericNode> = {
  combinator: 'and',
  rules: [{ combinator: 'or', rules: [{ field: 'name', operator: '=', value: 'branch' }] }]
};
const options = ref<NumericOptions>({ entityId: props.rootId, where, level: 2 });
const derived = computed<NumericOptions>(() => ({ entityId: props.rootId, where, level: 1 }));
const shallow = shallowReadonly(options);
const frozenScalar = readonly(ref({ entityId: 1, level: 1 }));
const shallowRuleOptions = shallowReadonly<NumericOptions>({ entityId: props.rootId, where, level: 1 });
const live = reactive<NumericOptions>({ entityId: props.rootId, where, level: 1 });
const upstreamShallow: UseOptions<NumericOptions> = shallow;
const upstreamScalar: UseOptions<NumericOptions> = frozenScalar;
const descendants: RxDBResource<NumericNode[]> = useFindDescendants(NumericNode, options);
const descendantCount: RxDBResource<number> = useCountDescendants(NumericNode, derived);
const ancestors: RxDBResource<NumericNode[]> = useFindAncestors(NumericNode, shallow);
const ancestorCount: RxDBResource<number> = useCountAncestors(NumericNode, () => ({ entityId: props.rootId, where }));
const scalarDescendants = useFindDescendants(NumericNode, frozenScalar);
const scalarDescendantCount = useCountDescendants(NumericNode, frozenScalar);
const scalarAncestors = useFindAncestors(NumericNode, frozenScalar);
const scalarAncestorCount = useCountAncestors(NumericNode, frozenScalar);
const shallowDescendants = useFindDescendants(NumericNode, upstreamShallow);
const shallowDescendantCount = useCountDescendants(NumericNode, shallow);
const shallowAncestors = useFindAncestors(NumericNode, shallowRuleOptions);
const shallowAncestorCount = useCountAncestors(NumericNode, shallow);
const liveDescendants = useFindDescendants(NumericNode, live);
const literalAncestors = useFindAncestors(NumericNode, { entityId: props.rootId, where, level: 1 });
const strings: RxDBResource<StringNode[]> = useFindDescendants(StringNode, { entityId: 'root' });
const stringCount: RxDBResource<number> = useCountDescendants(StringNode, { entityId: 'root' });
const stringAncestors: RxDBResource<StringNode[]> = useFindAncestors(StringNode, { entityId: 'leaf' });
const stringAncestorCount: RxDBResource<number> = useCountAncestors(StringNode, { entityId: 'leaf' });
const numericId: number | undefined = descendants.value[0]?.id;
const stringId: string | undefined = strings.value[0]?.id;
const error: Error | undefined = ancestors.error;
const loading: boolean = ancestorCount.isLoading;
const empty: boolean | undefined = descendants.isEmpty;
const hasValue: boolean = descendantCount.hasValue;
</script>

<template>
  <p v-if="descendants.error" role="alert">{{ descendants.error.message }}</p>
  <section :aria-busy="loading">
    <button v-for="node in descendants.value" :key="node.id" @click="emit('selected', node.id)">
      {{ node.id.toFixed(0) }} {{ node.name.toUpperCase() }}
    </button>
    <span>{{ descendantCount.value.toFixed(0) }} / {{ ancestorCount.value.toFixed(0) }}</span>
    <span>{{ ancestors.value.length }} {{ numericId }} {{ stringId }} {{ error?.message }} {{ empty }} {{ hasValue }}</span>
    <span>{{ scalarDescendants.value.length }} {{ scalarDescendantCount.value }} {{ scalarAncestors.value.length }} {{ scalarAncestorCount.value }}</span>
    <span>{{ shallowDescendants.value.length }} {{ shallowDescendantCount.value }} {{ shallowAncestors.value.length }} {{ shallowAncestorCount.value }}</span>
    <span>{{ liveDescendants.value.length }} {{ literalAncestors.value.length }} {{ upstreamScalar.value }}</span>
    <span>{{ strings.value.length }} {{ stringCount.value }} {{ stringAncestors.value.length }} {{ stringAncestorCount.value }}</span>
  </section>
</template>
