import { EntityList } from '@aiao/rxdb-model-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useParams } from 'react-router-dom';
import { findWorkbenchEntity } from '../entities/entity-registry';

/**
 * 实体列表页：路由参数命名的实体经 rxdb-model 的 `EntityList` 渲染，
 * 未注册或不可见的实体给出失败态（US-526 AC 的「失败态」落点）。
 */
export default function EntityListPage() {
  const rxdb = useRxDB();
  const { namespace = '', name = '' } = useParams();
  const found = findWorkbenchEntity(rxdb.config.entities, namespace, name);

  if (found === null) {
    return (
      <div className='page-host items-center justify-center gap-2 p-8' data-testid='entity-load-failed' role='alert'>
        <span className='text-error font-semibold'>加载失败</span>
        <span>
          未找到实体 {namespace}/{name}，请从左侧导航选择可见实体。
        </span>
      </div>
    );
  }

  return (
    <div className='page-host'>
      <EntityList namespace={namespace} name={name} />
    </div>
  );
}
