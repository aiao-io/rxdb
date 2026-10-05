import { ENTITY_STATIC_TYPES } from '@aiao/rxdb';
import type { FindTreeOptions, TreeEntityType } from '@aiao/rxdb-plugin-tree';

export type TreeStaticTypes<T extends TreeEntityType> = {
  countAncestorsOptions: FindTreeOptions<T>;
  countDescendantsOptions: FindTreeOptions<T>;
  findAncestorsOptions: FindTreeOptions<T>;
  findDescendantsOptions: FindTreeOptions<T>;
};

export class NumericNode {
  declare static [ENTITY_STATIC_TYPES]: TreeStaticTypes<typeof NumericNode>;
  readonly createdAt = new Date(0);
  readonly id: number = 1;
  readonly name: string = 'numeric';
  readonly parentId: number | null = null;
  readonly updatedAt = new Date(0);
}

export class StringNode {
  declare static [ENTITY_STATIC_TYPES]: TreeStaticTypes<typeof StringNode>;
  readonly createdAt = new Date(0);
  readonly id: string = 'node';
  readonly name: string = 'string';
  readonly parentId: string | null = null;
  readonly updatedAt = new Date(0);
}

export class PlainNode {
  readonly id: number = 1;
  readonly name: string = 'plain';
  readonly parentId: number | null = null;
}

export type NumericOptions = FindTreeOptions<typeof NumericNode>;
