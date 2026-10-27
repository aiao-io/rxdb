import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * 独立消费示例的实体：书签（US-528 的最小接线场景）。
 *
 * @remarks 本应用只 import 发布包（`@aiao/rxdb*`、`@aiao/rxdb-model-*`），
 * 不 import 工作台内部模块——它是「从零接入」的对照样本，
 * 接入成本记录见 website/docs/entity-model/admin-workbench-cost.md。
 */

@Entity({
  name: 'Bookmark',
  namespace: 'links',
  tableName: 'bookmark',
  displayName: '书签',
  properties: [
    { name: 'title', type: PropertyType.string, required: true, displayName: '标题' },
    { name: 'url', type: PropertyType.string, displayName: '链接', nullable: true },
    { name: 'note', type: PropertyType.string, displayName: '备注', nullable: true }
  ]
})
export class Bookmark extends EntityBase {
  title!: string;
  url?: string;
  note?: string;
}
