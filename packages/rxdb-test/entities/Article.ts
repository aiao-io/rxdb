import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * Article — demo 页面 `/search` 所用实体（与 `@aiao/rxdb-plugin-search`
 * `__tests__/fixtures/article.entity.ts` 字段结构完全一致，用于三端 parity
 * 与 benchmark 共享 seed）。
 *
 * `title` / `body` / `category` / `tags` 四个字段打 `searchable: true`
 * 由 `rxDBPluginSearch` 在启动时扫描并生成 `_fts_article` 虚拟表。
 *
 * `authorId` / `viewCount` 作为 non-searchable 反向用例，确保 FTS 不误命中。
 */
@Entity({
  name: 'Article',
  tableName: 'article',
  properties: [
    { name: 'title', type: PropertyType.string, required: true, searchable: true },
    { name: 'body', type: PropertyType.string, required: true, searchable: true },
    {
      name: 'category',
      type: PropertyType.enum,
      enum: ['tech', 'life', 'travel'],
      required: true,
      searchable: true
    },
    { name: 'tags', type: PropertyType.stringArray, searchable: true, default: [] },
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
