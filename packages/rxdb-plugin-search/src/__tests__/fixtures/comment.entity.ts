/**
 * Comment 测试 fixture：用于跨 collection 聚合搜索的第二种实体。
 */
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Comment',
  namespace: 'search-fixtures',
  log: false,
  properties: [
    { name: 'articleId', type: PropertyType.string, required: true },
    { name: 'content', type: PropertyType.string, required: true, searchable: true },
    { name: 'authorName', type: PropertyType.string, required: true, searchable: true }
  ]
})
export class Comment extends EntityBase {
  articleId!: string;
  content!: string;
  authorName!: string;
}
