import { EntityList } from '@aiao/rxdb-model-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

/** 列表固定查询的结构（与 `EntityList` 的 `fixedQuery` 输入一致） */
type FixedQuery = { combinator: 'and' | 'or'; rules: unknown[] };

/**
 * rxdb-model 实体列表页（`/entities/:namespace/:name` 子路由）：按 namespace + name 定位实体元数据，
 * 提供无限滚动、行内编辑、撤销/重做与筛选。
 *
 * 「查看」行 → 组件内置打开 edit 详情对话框（关系 Tab 内同理可无限下钻，editChain 防环）；
 * `/entities/:namespace/:name/:entityId` 路由是深链编辑入口。
 *
 * 可选查询参数 `fixedQuery`（`FixedQuery` 的 JSON）作为列表的固定查询，例如钉住分组排序实体的一组后
 * 才能拖拽排序（US-028 阶段 B，三端 e2e 经它进入）。
 */
export default function EntityListPage(): React.JSX.Element {
  // 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
  useRxDB();

  const { namespace = '', name = '' } = useParams();
  const rawFixedQuery = useSearchParams()[0].get('fixedQuery');
  const fixedQuery = useMemo(
    () => (rawFixedQuery === null ? undefined : (JSON.parse(rawFixedQuery) as FixedQuery)),
    [rawFixedQuery]
  );

  return (
    <div className='page-host bg-base-100 flex h-full flex-col'>
      <EntityList fixedQuery={fixedQuery} name={name} namespace={namespace} />
    </div>
  );
}
