import { bindWujieRoute } from '@modules/wujie';
import { bootstrapApplication } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter, take } from 'rxjs';
import { App } from './app/app';
import { appConfig } from './app/app.config';

const navigationEnd = (router: Router) =>
  router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd));

/**
 * 与文档站宿主同步路由。独立运行时 `bindWujieRoute` 自己会静默跳过。
 */
const bindHostRoute = (router: Router) =>
  bindWujieRoute({
    navigate: (path, replace) => void router.navigateByUrl(path, { replaceUrl: replace }),
    // urlAfterRedirects 已剥掉 APP_BASE_HREF，与宿主约定的语义化路径同形
    subscribe: onChange => {
      const subscription = navigationEnd(router).subscribe(event => onChange(event.urlAfterRedirects));
      return () => subscription.unsubscribe();
    }
  });

bootstrapApplication(App, appConfig)
  .then(ref => {
    const router = ref.injector.get(Router);
    // 首次导航（默认路由 / redirect）落定之前接线会被它顶掉，所以等第一个 NavigationEnd；
    // 已经导航过就直接接，否则会一直等一个可能永远不来的下一次导航。
    if (router.navigated) bindHostRoute(router);
    else navigationEnd(router).pipe(take(1)).subscribe(() => bindHostRoute(router));
  })
  .catch(err => console.error(err));
