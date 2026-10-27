import { EntityList } from '@aiao/rxdb-model-react';

/**
 * 书签列表页：整个应用就一个页面——「定义实体之后少写了多少 CRUD」
 * 的最小可复验形态（US-528 AC#1）。
 */
export default function BookmarksPage() {
  return (
    <div className='page-host' data-testid='entity-shell'>
      <EntityList namespace='links' name='Bookmark' />
    </div>
  );
}
