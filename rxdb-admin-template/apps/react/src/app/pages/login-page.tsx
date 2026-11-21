import { carriesInvitation, mountLogin, redirectTarget } from '@rxdb-admin-template/collaboration/auth';
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { workbenchShell } from '../shell/workbench-shell';

/** 全局登录页（后台外壳之外）：登录成功后回到 `redirect` 参数指向的本站地址。 */
export default function LoginPage() {
  const host = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
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
      signedIn: () => void navigate(target, { replace: true }),
      invited: carriesInvitation(target),
      brand: () => workbenchShell.i18n.t('app.brandTitle')
    });
  }, [navigate, target]);
  return <div ref={host} className='h-full' />;
}
