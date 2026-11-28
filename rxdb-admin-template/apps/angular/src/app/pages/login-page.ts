import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { carriesInvitation, mountLogin, redirectTarget } from '@rxdb-admin-template/collaboration/auth';
import { workbenchShell } from '../shell/workbench-shell';

/**
 * 全局登录页（后台外壳之外）：登录成功后整页载入 `redirect` 参数指向的本站地址——页面按新账号的身份重新启动，
 * 打开它自己的本机库（ADMIN-US-222），不沿用登录之前建好的库。
 */
@Component({
  selector: 'app-login-page',
  template: '<div #host class="h-full"></div>',
  host: { style: 'display: contents' }
})
export default class LoginPage {
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  constructor() {
    const destroy = inject(DestroyRef);
    const target = redirectTarget(inject(ActivatedRoute).snapshot.queryParamMap.get('redirect'));
    afterNextRender(() => {
      const dispose = mountLogin(this.host().nativeElement, {
        translate: (key, values) => workbenchShell.i18n.t(key, values),
        subscribeLanguage: listener => {
          const sub = workbenchShell.i18n.changes$.subscribe(listener);
          return () => sub.unsubscribe();
        },
        signedIn: () => window.location.replace(target),
        invited: carriesInvitation(target),
        brand: () => workbenchShell.i18n.t('app.brandTitle')
      });
      destroy.onDestroy(dispose);
    });
  }
}
