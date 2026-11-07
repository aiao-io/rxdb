import type { EntityType } from '@aiao/rxdb';
import type { MenuNode } from '@aiao/rxdb-admin';
import type { I18n } from '@aiao/rxdb-i18n';
import { ArchiveRestore, Boxes, Search, Tags, Wrench } from 'lucide-react';
import type { JSX, ReactNode } from 'react';
import { entityDisplayName } from '../entities/entity-labels';
import { visibleEntityEntries, type WorkbenchEntityEntry } from '../entities/entity-registry';
import { domainZhMessages } from '../i18n/domain-messages';

/** 实体图标（按实体名映射，未知实体用通用盒子图标）。 */
const ENTITY_ICONS: Record<string, JSX.Element> = {
  Asset: <Boxes size={16} />,
  AssetCategory: <Tags size={16} />,
  AssetEvent: <Wrench size={16} />
};

/** 实体菜单项 id 的前缀：用于从菜单项还原实体，给计数徽标定位。 */
export const ENTITY_MENU_PREFIX = 'entity:';

/**
 * 工作台导航：实体分组（由实体注册表派生）+ 数据分组（搜索、备份 / 恢复）。
 * 实体可见性的唯一真相源仍是 entity-registry，不另建菜单配置表。
 * @param entities - RxDB 实例注册的实体。
 * @param translate - 当前应用的翻译函数。
 * @returns 菜单树。
 */
export function buildWorkbenchMenu(entities: readonly EntityType[], translate?: I18n['t']): MenuNode<ReactNode>[] {
  const label = (key: keyof typeof domainZhMessages): string => translate?.(key) ?? domainZhMessages[key];
  return [
    {
      id: 'entities',
      label: label('nav.entities'),
      expanded: true,
      children: visibleEntityEntries(entities).map(entry => ({
        id: `${ENTITY_MENU_PREFIX}${entry.namespace}/${entry.name}`,
        label: entityDisplayName(entry, translate),
        icon: ENTITY_ICONS[entry.name] ?? <Boxes size={16} />,
        route: `/entities/${entry.namespace}/${entry.name}`,
        testId: 'entity-nav-link'
      }))
    },
    {
      id: 'data',
      label: label('nav.data'),
      expanded: true,
      children: [
        {
          id: 'search',
          label: label('nav.search'),
          icon: <Search size={16} />,
          route: '/search',
          testId: 'search-nav-link'
        },
        {
          id: 'backup',
          label: label('nav.backup'),
          icon: <ArchiveRestore size={16} />,
          route: '/backup',
          testId: 'backup-nav-link'
        }
      ]
    }
  ];
}

/**
 * 从实体菜单项 id 还原实体条目。
 * @param entries - 可见实体条目。
 * @param id - 菜单项 id。
 * @returns 对应条目；不是实体菜单项时为 `undefined`。
 */
export function entryOfMenuId(entries: readonly WorkbenchEntityEntry[], id: string): WorkbenchEntityEntry | undefined {
  if (!id.startsWith(ENTITY_MENU_PREFIX)) return undefined;
  const key = id.slice(ENTITY_MENU_PREFIX.length);
  return entries.find(entry => `${entry.namespace}/${entry.name}` === key);
}
