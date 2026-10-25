import { useDbConnectionError } from '../hooks/useDbConnectionError';

/**
 * 应用壳的数据库连接失败提示（US-221）。
 *
 * @remarks
 * 连接失败时受守卫的路由不渲染、其余页面的查询也取不到数据；这条提示是唯一能看到原因的地方。
 * 库通常要等占着它的上下文（如刚关闭的页面）退出后才能再打开，所以给一个整页重新加载的按钮。
 */
export function DbConnectionAlert(): React.JSX.Element | null {
  const message = useDbConnectionError();
  if (message === null) return null;
  return (
    <div className='alert alert-error m-4' data-testid='app-db-error' role='alert'>
      <span className='flex-1 text-sm'>数据库打不开：{message}</span>
      <button className='btn btn-sm' onClick={() => window.location.reload()} type='button'>
        重新加载
      </button>
    </div>
  );
}
