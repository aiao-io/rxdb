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

class PlainNode {
  declare static [ENTITY_STATIC_TYPES]: TreeStaticTypes<typeof NumericNode>;
  readonly id: number = 1;
}

useFindDescendants(NumericNode, { entityId: 'not-a-number' });
useCountDescendants(NumericNode, { entityId: 'not-a-number' });
useFindAncestors(NumericNode, { entityId: 'not-a-number' });
useCountAncestors(NumericNode, { entityId: 'not-a-number' });
useFindDescendants(StringNode, { entityId: 123 });
useFindDescendants(PlainNode, { entityId: 1 });
useCountDescendants(PlainNode, { entityId: 1 });
useFindAncestors(PlainNode, { entityId: 1 });
useCountAncestors(PlainNode, { entityId: 1 });
const count = useCountAncestors(NumericNode, { entityId: 1 });
count.value = 3;
const wrongResult: string = count.value;
useFindDescendants(NumericNode, { entityId: 1, level: 'deep' });
void wrongResult;
