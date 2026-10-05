import { ENTITY_STATIC_TYPES, type EntityStaticType } from '@aiao/rxdb';
import type { FindTreeOptions, ITreeEntity } from '@aiao/rxdb-plugin-tree';
import {
  useCountAncestors,
  useCountDescendants,
  useFindAncestors,
  useFindDescendants
} from '@aiao/rxdb-plugin-tree-react';
import type { RxDBResource } from '@aiao/rxdb-react';

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

export function useInvalidTreeConsumer(): void {
  useFindDescendants(NumericTreeNode, { entityId: '0' });
  useCountDescendants(NumericTreeNode, () => ({ entityId: '0' }));
  useFindAncestors(StringTreeNode, { entityId: 0 });
  useCountAncestors(StringTreeNode, () => ({ entityId: 0 }));
  useFindDescendants(NumericTreeNode, { entityId: 0, level: '1' });

  const numericOptions: EntityStaticType<typeof NumericTreeNode, 'findAncestorsOptions'> = { entityId: '0' };
  const stringOptions: EntityStaticType<typeof StringTreeNode, 'countDescendantsOptions'> = { entityId: 0 };
  const stringResult: RxDBResource<StringTreeNode[]> = useFindDescendants(NumericTreeNode, { entityId: 0 });
  const numericResult: RxDBResource<NumericTreeNode[]> = useFindAncestors(StringTreeNode, { entityId: '0' });
  const stringCount: RxDBResource<string> = useCountAncestors(NumericTreeNode, { entityId: 0 });

  void numericOptions;
  void stringOptions;
  void stringResult;
  void numericResult;
  void stringCount;
}
