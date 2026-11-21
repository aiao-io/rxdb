import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { carriesInvitation, mountLogin, redirectTarget } from '@rxdb-admin-template/collaboration/auth';
import { workbenchShell } from '../shell/workbench-shell';

/** 全局登录页（后台外壳之外）：登录成功后回到 `redirect` 参数指向的本站地址。 */
@Component({
  selector: 'app-login-page',
  template: '<div #host class="h-full"></div>',
  host: { style: 'display: contents' }
})
export default class LoginPage {
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  constructor() {
    const destroy = inject(DestroyRef);
    const router = inject(Router);
    const target = redirectTarget(inject(ActivatedRoute).snapshot.queryParamMap.get('redirect'));
    afterNextRender(() => {
      const dispose = mountLogin(this.host().nativeElement, {
        translate: (key, values) => workbenchShell.i18n.t(key, values),
        subscribeLanguage: listener => {
          const sub = workbenchShell.i18n.changes$.subscribe(listener);
          return () => sub.unsubscribe();
        },
        signedIn: () => void router.navigateByUrl(target, { replaceUrl: true }),
        invited: carriesInvitation(target),
        brand: () => workbenchShell.i18n.t('app.brandTitle')
      });
      destroy.onDestroy(dispose);
    });
  }
}
