import type { OrbitClient } from '@aiao/orbit/client';
import { bootstrapApplication } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { bindOrbitRoute } from '@modules/orbit';
import { filter, firstValueFrom, take } from 'rxjs';
import { App } from './app/app';
import { appConfig } from './app/app.config';

export async function bootstrap(client: OrbitClient | undefined): Promise<void> {
  const ref = await bootstrapApplication(App, appConfig);
  let closed = false;
  let unbind: () => void = () => undefined;
  client?.onDispose(() => {
    closed = true;
    unbind();
    ref.destroy();
  });
  const router = ref.injector.get(Router);
  const navigationEnd = router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd));
  if (!router.navigated) await firstValueFrom(navigationEnd.pipe(take(1)));
  if (closed) return;
  unbind = bindOrbitRoute({
    navigate: (path, replace) => void router.navigateByUrl(path, { replaceUrl: replace }),
    subscribe: onChange => {
      const subscription = navigationEnd.subscribe(event => onChange(event.urlAfterRedirects));
      return () => subscription.unsubscribe();
    }
  });
  await ref.whenStable();
  if (!closed) client?.ready();
}
