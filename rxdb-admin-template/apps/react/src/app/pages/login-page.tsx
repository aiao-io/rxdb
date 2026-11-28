import { carriesInvitation, mountLogin, redirectTarget } from '@rxdb-admin-template/collaboration/auth';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { workbenchShell } from '../shell/workbench-shell';

/**
 * 全局登录页（后台外壳之外）：登录成功后整页载入 `redirect` 参数指向的本站地址——页面按新账号的身份重新启动，
 * 打开它自己的本机库（ADMIN-US-222），不沿用登录之前建好的库。
 */
export default function LoginPage() {
  const host = useRef<HTMLDivElement>(null);
  const [params] = useSearchParams();
  const target = redirectTarget(params.get('redirect'));
  useEffect(() => {
    if (!host.current) return;
    return mountLogin(host.current, {
      translate: (key, values) => workbenchShell.i18n.t(key, values),
      subscribeLanguage: listener => {
        const sub = workbenchShell.i18n.changes$.subscribe(listener);
        return () => sub.unsubscribe();
      },
      signedIn: () => window.location.replace(target),
      invited: carriesInvitation(target),
      brand: () => workbenchShell.i18n.t('app.brandTitle')
    });
  }, [target]);
  return <div ref={host} className='h-full' />;
}
