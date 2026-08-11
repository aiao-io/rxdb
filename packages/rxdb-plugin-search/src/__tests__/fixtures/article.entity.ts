/**
 * Article 测试 fixture：包含 `searchable` 字段（title/body/tags）以及非搜索字段。
 * 由 unit/integration/E2E/benchmark 共用。
 */
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Article',
  namespace: 'search-fixtures',
  log: false,
  properties: [
    { name: 'title', type: PropertyType.string, required: true, searchable: true },
    { name: 'body', type: PropertyType.string, required: true, searchable: true },
    { name: 'category', type: PropertyType.enum, enum: ['tech', 'life', 'travel'], required: true, searchable: true },
    { name: 'tags', type: PropertyType.stringArray, default: () => [], searchable: true },
    /** 非 searchable：用于反向用例（不应进入 FTS5） */
    { name: 'authorId', type: PropertyType.string, required: true },
    { name: 'viewCount', type: PropertyType.integer, default: 0 }
  ]
})
export class Article extends EntityBase {
  title!: string;
  body!: string;
  category!: 'tech' | 'life' | 'travel';
  tags!: string[];
  authorId!: string;
  viewCount!: number;
}
