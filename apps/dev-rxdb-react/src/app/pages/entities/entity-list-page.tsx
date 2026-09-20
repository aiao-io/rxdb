import { EntityList } from '@aiao/rxdb-model-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useParams } from 'react-router-dom';

/**
 * rxdb-model 实体列表页（`/entities/:namespace/:name` 子路由）：按 namespace + name 定位实体元数据，
 * 提供无限滚动、行内编辑、撤销/重做与筛选。
 *
 * 「查看」行 → 组件内置打开 edit 详情对话框（关系 Tab 内同理可无限下钻，editChain 防环）；
 * `/entities/:namespace/:name/:entityId` 路由是深链编辑入口。
 */
export default function EntityListPage(): React.JSX.Element {
  // 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
  useRxDB();

  const { namespace = '', name = '' } = useParams();

  return (
    <div className='page-host bg-base-100 flex h-full flex-col'>
      <EntityList name={name} namespace={namespace} />
    </div>
  );
}
