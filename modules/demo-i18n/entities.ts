import type { MessageCatalog } from '@aiao/rxdb-i18n';

/** 实体浏览演示页的简体中文文案目录。 */
export const entitiesZhMessages = {
  'page.entity.types': '实体类型',
  'page.entity.total': '共 {count} 个实体',
  'page.entity.grantDemo.title': '授权快照',
  'page.entity.grantDemo.unknown': '未取到',
  'page.entity.grantDemo.empty': '已取到，没有任何作用域',
  'page.entity.grantDemo.seed': '生成示例数据',
  'page.entity.grantDemo.grantA': 'a 可编辑、b 只读',
  'page.entity.grantDemo.revokeA': '收回 a 的 edit'
} as const;

/** 实体浏览演示页的文案键。 */
export type EntitiesMessageKey = keyof typeof entitiesZhMessages;

/** 实体浏览演示页的英文文案目录；键集合必须与简体中文目录一致。 */
export const entitiesEnMessages = {
  'page.entity.types': 'Entity types',
  'page.entity.total': '{count, plural, one {# entity} other {# entities}}',
  'page.entity.grantDemo.title': 'Grant snapshot',
  'page.entity.grantDemo.unknown': 'not loaded yet',
  'page.entity.grantDemo.empty': 'loaded, no scopes',
  'page.entity.grantDemo.seed': 'Seed sample rows',
  'page.entity.grantDemo.grantA': 'a editable, b read-only',
  'page.entity.grantDemo.revokeA': 'Revoke edit on a'
} satisfies Record<EntitiesMessageKey, string>;

/** 实体浏览演示页的随包目录；三端演示共用同一份。 */
export const entitiesCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: entitiesZhMessages },
  { locale: 'en', namespace: 'app', messages: entitiesEnMessages }
];
