import { ENTITY_STATIC_TYPES, type EntityStaticType } from '@aiao/rxdb';
import type { FindTreeOptions, ITreeEntity } from '@aiao/rxdb-plugin-tree';
import {
  useCountAncestors,
  useCountDescendants,
  useFindAncestors,
  useFindDescendants
} from '@aiao/rxdb-plugin-tree-react';
import type { RxDBResource, UseOptions } from '@aiao/rxdb-react';

export interface NumericTreeStaticTypes {
  idType: number;
  entity: NumericTreeNode;
  findDescendantsOptions: FindTreeOptions<typeof NumericTreeNode>;
  countDescendantsOptions: FindTreeOptions<typeof NumericTreeNode>;
  findAncestorsOptions: FindTreeOptions<typeof NumericTreeNode>;
  countAncestorsOptions: FindTreeOptions<typeof NumericTreeNode>;
}

export declare class NumericTreeNode implements ITreeEntity {
  static [ENTITY_STATIC_TYPES]: NumericTreeStaticTypes;
  id: number;
  parentId: number | null;
  createdAt: Date;
  updatedAt: Date;
  label: string;
}

export interface StringTreeStaticTypes {
  idType: string;
  entity: StringTreeNode;
  findDescendantsOptions: FindTreeOptions<typeof StringTreeNode>;
  countDescendantsOptions: FindTreeOptions<typeof StringTreeNode>;
  findAncestorsOptions: FindTreeOptions<typeof StringTreeNode>;
  countAncestorsOptions: FindTreeOptions<typeof StringTreeNode>;
}

export declare class StringTreeNode implements ITreeEntity {
  static [ENTITY_STATIC_TYPES]: StringTreeStaticTypes;
  id: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  label: string;
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type NumericIdContract = Assert<
  Equal<NonNullable<EntityStaticType<typeof NumericTreeNode, 'findDescendantsOptions'>['entityId']>, number>
>;
export type StringIdContract = Assert<
  Equal<NonNullable<EntityStaticType<typeof StringTreeNode, 'findAncestorsOptions'>['entityId']>, string>
>;
export type NumericResultContract = Assert<
  Equal<ReturnType<typeof useFindDescendants<typeof NumericTreeNode>>['value'], NumericTreeNode[]>
>;
export type StringResultContract = Assert<
  Equal<ReturnType<typeof useFindAncestors<typeof StringTreeNode>>['value'], StringTreeNode[]>
>;

export function useNumericTreeConsumer(rootId = 0): {
  descendants: RxDBResource<NumericTreeNode[]>;
  ancestors: RxDBResource<NumericTreeNode[]>;
  descendantCount: RxDBResource<number>;
  ancestorCount: RxDBResource<number>;
  firstId: number | undefined;
  firstLabel: string | undefined;
} {
  const options: UseOptions<EntityStaticType<typeof NumericTreeNode, 'findDescendantsOptions'>> = {
    entityId: rootId,
    level: 1
  };
  const descendants: RxDBResource<NumericTreeNode[]> = useFindDescendants(NumericTreeNode, options);
  const ancestors: RxDBResource<NumericTreeNode[]> = useFindAncestors(NumericTreeNode, () => ({ entityId: rootId }));
  const descendantCount: RxDBResource<number> = useCountDescendants(NumericTreeNode, { entityId: rootId, level: 0 });
  const ancestorCount: RxDBResource<number> = useCountAncestors(NumericTreeNode, () => ({ entityId: rootId }));

  return {
    descendants,
    ancestors,
    descendantCount,
    ancestorCount,
    firstId: descendants.value[0]?.id,
    firstLabel: descendants.value[0]?.label
  };
}

export function useStringTreeConsumer(rootId = '0'): {
  descendants: RxDBResource<StringTreeNode[]>;
  ancestors: RxDBResource<StringTreeNode[]>;
  descendantCount: RxDBResource<number>;
  ancestorCount: RxDBResource<number>;
  firstId: string | undefined;
} {
  const options: UseOptions<EntityStaticType<typeof StringTreeNode, 'findAncestorsOptions'>> = () => ({
    entityId: rootId,
    level: 2
  });
  const descendants: RxDBResource<StringTreeNode[]> = useFindDescendants(StringTreeNode, { entityId: rootId });
  const ancestors: RxDBResource<StringTreeNode[]> = useFindAncestors(StringTreeNode, options);
  const descendantCount: RxDBResource<number> = useCountDescendants(StringTreeNode, () => ({ entityId: rootId }));
  const ancestorCount: RxDBResource<number> = useCountAncestors(StringTreeNode, { entityId: rootId, level: 0 });

  return { descendants, ancestors, descendantCount, ancestorCount, firstId: ancestors.value[0]?.id };
}
