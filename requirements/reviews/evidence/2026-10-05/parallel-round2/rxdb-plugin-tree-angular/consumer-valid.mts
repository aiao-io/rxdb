import { ENTITY_STATIC_TYPES, type EntityStaticType } from '@aiao/rxdb';
import type { RxDBResource, UseOptions } from '@aiao/rxdb-angular';
import { TreeAdjacencyListEntityBase, type FindTreeOptions } from '@aiao/rxdb-plugin-tree';
import {
  useCountAncestors,
  useCountDescendants,
  useFindAncestors,
  useFindDescendants
} from '@aiao/rxdb-plugin-tree-angular';
import type { Signal } from '@angular/core';

export class NumericTree extends TreeAdjacencyListEntityBase<number> {
  declare static [ENTITY_STATIC_TYPES]: {
    idType: number;
    findDescendantsOptions: FindTreeOptions<typeof NumericTree>;
    countDescendantsOptions: FindTreeOptions<typeof NumericTree>;
    findAncestorsOptions: FindTreeOptions<typeof NumericTree>;
    countAncestorsOptions: FindTreeOptions<typeof NumericTree>;
  };

  name = '';
}

export class StringTree extends TreeAdjacencyListEntityBase<string> {
  declare static [ENTITY_STATIC_TYPES]: {
    idType: string;
    findDescendantsOptions: FindTreeOptions<typeof StringTree>;
    countDescendantsOptions: FindTreeOptions<typeof StringTree>;
    findAncestorsOptions: FindTreeOptions<typeof StringTree>;
    countAncestorsOptions: FindTreeOptions<typeof StringTree>;
  };

  name = '';
}

export function consumeNumericTree(rootId: number): {
  descendants: Signal<NumericTree[]>;
  ancestors: Signal<NumericTree[]>;
  descendantCount: Signal<number>;
  ancestorCount: Signal<number>;
  loading: Signal<boolean>;
  error: Signal<Error | undefined>;
  empty: Signal<boolean | undefined>;
  hasValue: Signal<boolean>;
} {
  const options: UseOptions<EntityStaticType<typeof NumericTree, 'findDescendantsOptions'>> = () => ({
    entityId: rootId,
    level: 1
  });
  const descendants: RxDBResource<NumericTree[]> = useFindDescendants(NumericTree, options);
  const ancestors: RxDBResource<NumericTree[]> = useFindAncestors(NumericTree, { entityId: rootId });
  const descendantCount: RxDBResource<number> = useCountDescendants(NumericTree, { entityId: rootId, level: 0 });
  const ancestorCount: RxDBResource<number> = useCountAncestors(NumericTree, () => ({ entityId: rootId }));

  return {
    descendants: descendants.value,
    ancestors: ancestors.value,
    descendantCount: descendantCount.value,
    ancestorCount: ancestorCount.value,
    loading: descendants.isLoading,
    error: descendants.error,
    empty: descendants.isEmpty,
    hasValue: descendants.hasValue
  };
}

export function consumeStringTree(rootId: string): {
  descendants: RxDBResource<StringTree[]>;
  ancestors: RxDBResource<StringTree[]>;
  descendantCount: RxDBResource<number>;
  ancestorCount: RxDBResource<number>;
} {
  return {
    descendants: useFindDescendants(StringTree, () => ({ entityId: rootId, level: 1 })),
    ancestors: useFindAncestors(StringTree, { entityId: rootId }),
    descendantCount: useCountDescendants(StringTree, { entityId: null }),
    ancestorCount: useCountAncestors(StringTree, { entityId: rootId })
  };
}
