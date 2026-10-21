import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * `BoardLabel` —— 板级标签定义：板内唯一的名字 + 颜色，任务以多对多引用（US-528）。
 *
 * @remarks
 * 唯一约束 `(boardId, name)` 精确比较、保留大小写（`normalized` 为假），
 * 同板重名与异板同名都在存储层给出确定语义：前者拒绝、后者允许。
 */
@Entity({
  name: 'BoardLabel',
  tableName: 'board_label',
  namespace: 'board',
  displayName: '板级标签',
  properties: [
    { name: 'name', type: PropertyType.string, displayName: '名称' },
    { name: 'color', type: PropertyType.string, displayName: '颜色' }
  ],
  relations: [
    { name: 'board', columnName: 'board_id', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Board', mappedProperty: 'labels' },
    { name: 'tasks', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'TaskLabel', mappedProperty: 'label' }
  ],
  indexes: [{ name: 'board_name', properties: ['boardId', 'name'], unique: true }]
})
export class BoardLabel extends EntityBase {}
