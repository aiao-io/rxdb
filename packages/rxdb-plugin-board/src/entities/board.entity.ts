import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * `Board` —— 看板的板：标题必填，描述可选；列与板级标签都挂在板上（US-534 / US-536）。
 */
@Entity({
  name: 'Board',
  tableName: 'board',
  namespace: 'board',
  displayName: '看板',
  properties: [
    { name: 'title', type: PropertyType.string, displayName: '标题' },
    { name: 'description', type: PropertyType.string, nullable: true, displayName: '描述' }
  ],
  relations: [
    { name: 'columns', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Column', mappedProperty: 'board' },
    { name: 'labels', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'BoardLabel', mappedProperty: 'board' }
  ]
})
export class Board extends EntityBase {
  title!: string;
  description: string | null = null;
}
