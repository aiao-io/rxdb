import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * Comment — 跨 collection 聚合搜索的第二种实体；`content` / `authorName`
 * 参与 FTS5，`articleId` 不参与。
 */
@Entity({
  name: 'Comment',
  tableName: 'comment',
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
