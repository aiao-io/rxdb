import { useRouteError } from 'react-router-dom';
import { isReportedDbConnectionError } from '../rxdb/db-connection';

/**
 * 受守卫路由的错误元素：守卫（loader）失败时留在布局里，不让根路由的默认错误页换掉整个应用壳（US-221）。
 *
 * @remarks
 * 连不上数据库的失败已由应用壳的 `DbConnectionAlert` 显示，这里留空；其它错误照常显示出来。
 */
export function RouteLoadError(): React.JSX.Element | null {
  const error = useRouteError();
  if (isReportedDbConnectionError(error)) return null;
  return (
    <div className='alert alert-error m-4' data-testid='route-load-error' role='alert'>
      页面加载失败：{error instanceof Error ? error.message : String(error)}
    </div>
  );
}
