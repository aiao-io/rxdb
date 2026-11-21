import { createApp } from 'vue';
import App from './app/App.vue';
import { bindWorkbenchDescription } from './app/i18n/workbench-i18n';
import { router } from './app/router';
import { bindWorkbenchNavigator, workbenchShell } from './app/shell/workbench-shell';
import './styles.css';
bindWorkbenchNavigator(url => void router.push(url));
workbenchShell.attach();
const stopDescription = bindWorkbenchDescription(workbenchShell.i18n, document);
const app = createApp(App).use(router);
// 首次导航（含全站登录门禁）结束后再挂载：未登录的人不会先看到后台外壳，与 React（根路由 loader）、Angular（阻塞式首次导航）一致。
// 首次导航失败时路由器自己会报错，照样挂载，与另两端出错时仍渲染应用一致
const mount = () => void app.mount('#root');
void router.isReady().then(mount, mount);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopDescription();
    app.unmount();
    workbenchShell.destroy();
  });
}
