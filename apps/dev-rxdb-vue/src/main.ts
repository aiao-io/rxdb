import { requestIdleCallbackPolyfill } from '@aiao/utils';
import { bindWujieRoute } from '@modules/wujie';
import { createApp } from 'vue';
import App from './app/App.vue';
import router from './router';
import './styles.css';

// Safari 不支持 requestIdleCallback
requestIdleCallbackPolyfill();

const app = createApp(App);
app.use(router);
app.mount('#root');

// 与文档站宿主同步路由。独立运行时 bindWujieRoute 自己会静默跳过。
// 等 isReady：首次导航（`/` → `/home` 的 redirect）落定之前接线会被它顶掉。
void router.isReady().then(() =>
  bindWujieRoute({
    navigate: (path, replace) => void (replace ? router.replace(path) : router.push(path)),
    // fullPath 已剥掉 createWebHistory 的 base，与宿主约定的语义化路径同形
    subscribe: onChange => router.afterEach(to => onChange(to.fullPath))
  })
);
