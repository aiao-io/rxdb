import { EntityDetail, type EntityFormData } from '@aiao/rxdb-model-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useNavigate, useParams } from 'react-router-dom';

/**
 * rxdb-model 实体详情演示页：`/entities/:namespace/:name/:entityId` 路由进入编辑模式，
 * 按 id 从 Repository 加载实体；保存由 EntityDetail 内部完成（edit 模式实例路径），
 * 本页只负责保存/取消后返回实体列表（`..` 相对导航：详情路由是扁平的四段 URL，
 * 上一段即 `/entities/:namespace/:name` 列表页，dashboard 嵌套结构的 `../..` 不适用）。
 *
 * 交互式编辑走列表页「查看」的内置编辑对话框；本路由是深链入口。
 */
export default function EntityDetailPage(): React.JSX.Element {
  // 注入 RxDB 以初始化本地数据库
  useRxDB();

  const { namespace = '', name = '', entityId = '' } = useParams();
  const navigate = useNavigate();

  const onSaved = (data: EntityFormData): void => {
    console.info('[entity-detail] saved', data);
    void navigate('..', { relative: 'path' });
  };

  const onCancelled = (): void => {
    console.info('[entity-detail] cancelled');
    void navigate('..', { relative: 'path' });
  };

  return (
    <div className='page-host bg-base-100 flex h-full flex-col'>
      <EntityDetail
        entityId={entityId}
        name={name}
        namespace={namespace}
        onFormCancelled={onCancelled}
        onFormSubmitted={onSaved}
      />
    </div>
  );
}
