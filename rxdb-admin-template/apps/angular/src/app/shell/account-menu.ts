import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { mountAccount } from '@rxdb-admin-template/collaboration/auth';
import { workbenchShell } from './workbench-shell';

/** 外壳顶栏右侧的全局账号菜单：登录状态、团队协作入口与退出账号。 */
@Component({
  selector: 'app-account-menu',
  template: '<span #host></span>',
  host: { style: 'display: contents' }
})
export class AccountMenu {
  private readonly host = viewChild.required<ElementRef<HTMLSpanElement>>('host');
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const dispose = mountAccount(this.host().nativeElement, {
        translate: (key, values) => workbenchShell.i18n.t(key, values),
        subscribeLanguage: listener => {
          const sub = workbenchShell.i18n.changes$.subscribe(listener);
          return () => sub.unsubscribe();
        },
        navigate: url => workbenchShell.navigate(url),
        currentUrl: () => `${window.location.pathname}${window.location.search}${window.location.hash}`
      });
      destroy.onDestroy(dispose);
    });
  }
}
