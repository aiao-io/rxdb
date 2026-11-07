import type { WujieClient } from '@aiao/web-desktop-runtime/client';
import { requestIdleCallbackPolyfill } from '@aiao/utils';
import { bindWujieRoute } from '@modules/wujie';
import { createApp, nextTick } from 'vue';
import App from './app/App.vue';
import router from './router';
import './styles.css';

export async function bootstrap(client: WujieClient | undefined): Promise<void> {
  requestIdleCallbackPolyfill();
  const app = createApp(App);
  app.use(router);
  let closed = false;
  let unbind: () => void = () => undefined;
  client?.onDispose(() => { closed = true; unbind(); app.unmount(); });
  app.mount('#root');
  await router.isReady();
  if (closed) return;
  unbind = bindWujieRoute({
    navigate: (path, replace) => void (replace ? router.replace(path) : router.push(path)),
    subscribe: onChange => router.afterEach(to => onChange(to.fullPath)),
  });
  await nextTick();
  if (!closed) client?.ready();
}
