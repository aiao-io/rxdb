import { ENTITY_STATIC_TYPES } from '@aiao/rxdb';
import type { FindTreeOptions, TreeEntityType } from '@aiao/rxdb-plugin-tree';
import {
  useCountAncestors,
  useCountDescendants,
  useFindAncestors,
  useFindDescendants
} from '@aiao/rxdb-plugin-tree-vue';

type TreeStaticTypes<T extends TreeEntityType> = {
  countAncestorsOptions: FindTreeOptions<T>;
  countDescendantsOptions: FindTreeOptions<T>;
  findAncestorsOptions: FindTreeOptions<T>;
  findDescendantsOptions: FindTreeOptions<T>;
};

export class NumericNode {
  declare static [ENTITY_STATIC_TYPES]: TreeStaticTypes<typeof NumericNode>;
  readonly createdAt = new Date(0);
  readonly id: number = 1;
  readonly name = 'numeric';
  readonly parentId: number | null = null;
  readonly updatedAt = new Date(0);
}

export class StringNode {
  declare static [ENTITY_STATIC_TYPES]: TreeStaticTypes<typeof StringNode>;
  readonly createdAt = new Date(0);
  readonly id: string = 'node';
  readonly name = 'string';
  readonly parentId: string | null = null;
  readonly updatedAt = new Date(0);
}

import type { RxDBResource } from '@aiao/rxdb-vue';
import { computed, readonly, ref } from 'vue';

export function useTypedTree() {
  const root = ref(1);
  const options = ref<FindTreeOptions<typeof NumericNode>>({ entityId: 1, level: 2 });
  const frozen = readonly(options);
  const derived = computed(() => ({ entityId: root.value, level: 1 }));
  const descendants: RxDBResource<NumericNode[]> = useFindDescendants(NumericNode, options);
  const descendantCount: RxDBResource<number> = useCountDescendants(NumericNode, derived);
  const ancestors: RxDBResource<NumericNode[]> = useFindAncestors(NumericNode, frozen);
  const ancestorCount: RxDBResource<number> = useCountAncestors(NumericNode, () => ({ entityId: root.value }));
  const strings: RxDBResource<StringNode[]> = useFindDescendants(StringNode, { entityId: 'root' });
  const stringCount: RxDBResource<number> = useCountDescendants(StringNode, { entityId: 'root' });
  const stringAncestors: RxDBResource<StringNode[]> = useFindAncestors(StringNode, { entityId: 'leaf' });
  const stringAncestorCount: RxDBResource<number> = useCountAncestors(StringNode, { entityId: 'leaf' });
  const node: NumericNode | undefined = descendants.value[0];
  const numericId: number | undefined = node?.id;
  const error: Error | undefined = ancestors.error;
  const loading: boolean = ancestorCount.isLoading;
  const empty: boolean | undefined = descendants.isEmpty;
  const hasValue: boolean = descendantCount.hasValue;
  return {
    descendants,
    descendantCount,
    ancestors,
    ancestorCount,
    strings,
    stringCount,
    stringAncestors,
    stringAncestorCount,
    numericId,
    error,
    loading,
    empty,
    hasValue
  };
}
