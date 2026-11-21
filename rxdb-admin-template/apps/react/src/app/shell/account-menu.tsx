import { mountAccount } from '@rxdb-admin-template/collaboration/auth';
import { useEffect, useRef } from 'react';
import { workbenchShell } from './workbench-shell';

/** 外壳顶栏右侧的全局账号菜单：登录状态、团队协作入口与退出账号。 */
export function AccountMenu() {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!host.current) return;
    return mountAccount(host.current, {
      translate: (key, values) => workbenchShell.i18n.t(key, values),
      subscribeLanguage: listener => {
        const sub = workbenchShell.i18n.changes$.subscribe(listener);
        return () => sub.unsubscribe();
      },
      navigate: url => workbenchShell.navigate(url),
      currentUrl: () => `${window.location.pathname}${window.location.search}${window.location.hash}`
    });
  }, []);
  return <span ref={host} />;
}
